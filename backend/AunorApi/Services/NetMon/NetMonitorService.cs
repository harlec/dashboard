using AunorApi.Data;
using AunorApi.Models;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services.NetMon;

// Cada NetMon:IntervalSeconds (60) lee los contadores de cada equipo activo, calcula el
// consumo contra la lectura anterior (dt con el reloj, no con el intervalo) y guarda una
// muestra por enlace. En un par HA se consultan ambas unidades y se conserva la que
// realmente lleva tráfico (la pasiva casi no mueve contadores en las interfaces de datos).
public class NetMonitorService(
    IConnectionStringProvider cs,
    IEnumerable<IDeviceClient> clientes,
    NetAlertaService alertas,
    IConfiguration config,
    ILogger<NetMonitorService> log) : BackgroundService
{
    // Lectura anterior por (equipo, interfaz): cada unidad HA tiene sus propios contadores.
    readonly Dictionary<(int dev, string iface), LecturaContador> anteriores = new();
    // Ciclos consecutivos sin respuesta por equipo.
    readonly Dictionary<int, int> fallos = new();

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var intervalo = config.GetValue("NetMon:IntervalSeconds", 60);
        log.LogInformation("NetMonitor iniciado — ciclo cada {n}s", intervalo);

        // Pequeña espera: que la API y la BD terminen de arrancar
        try { await Task.Delay(TimeSpan.FromSeconds(15), ct); } catch (OperationCanceledException) { return; }

        while (!ct.IsCancellationRequested)
        {
            try   { await CicloAsync(ct); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogError(ex, "Error en ciclo NetMonitor"); }

            try { await Task.Delay(TimeSpan.FromSeconds(intervalo), ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    async Task CicloAsync(CancellationToken ct)
    {
        var umbralFallos = config.GetValue("NetMon:FallosSinDatos", 3);

        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs.ConnectionString).Options);

        var dispositivos = await db.NetDevices.Where(d => d.Activo).ToListAsync(ct);
        if (dispositivos.Count == 0) return;
        var links = await db.NetLinks.Include(l => l.Device).Where(l => l.Device.Activo).ToListAsync(ct);

        // Sondeo en paralelo de todos los equipos
        var lecturas = await Task.WhenAll(dispositivos.Select(d => LeerAsync(d, ct)));
        var porDevice = lecturas.ToDictionary(l => l.dev.Id);

        foreach (var l in lecturas)
        {
            fallos[l.dev.Id] = l.contadores is null ? fallos.GetValueOrDefault(l.dev.Id) + 1 : 0;
            // Una unidad que dejó de responder reinicia su referencia: al volver no se promedia
            // el consumo sobre un hueco largo.
            if (l.contadores is null)
                foreach (var k in anteriores.Keys.Where(k => k.dev == l.dev.Id).ToList()) anteriores.Remove(k);
        }

        var ahora = DateTime.UtcNow;
        foreach (var link in links)
        {
            // Unidades que atienden este enlace: el equipo del enlace + los de su mismo grupo HA
            var unidades = dispositivos.Where(d => d.Id == link.DeviceId ||
                (link.Device.GrupoHa != null && d.GrupoHa == link.Device.GrupoHa)).ToList();

            var respondieron = unidades.Where(u => porDevice[u.Id].contadores is not null).ToList();
            var fallosEnlace = unidades.Count == 0 ? 0 : unidades.Min(u => fallos.GetValueOrDefault(u.Id));

            // Candidata por unidad: consumo válido contra su lectura anterior
            Consumo? mejor = null;
            foreach (var u in respondieron)
            {
                var (_, tsUtc, contadores) = porDevice[u.Id];
                var c = contadores!.FirstOrDefault(x => x.Nombre == link.Interfaz);
                if (c is null) continue;

                var actual = new LecturaContador(tsUtc, c.InBytes, c.OutBytes);
                var clave = (u.Id, link.Interfaz);
                var consumo = anteriores.TryGetValue(clave, out var previa) ? CalculoConsumo.Calcular(previa, actual) : null;
                anteriores[clave] = actual;

                if (consumo is not null && (mejor is null || consumo.InBps + consumo.OutBps > mejor.InBps + mejor.OutBps))
                    mejor = consumo;
            }

            try
            {
                await alertas.EvaluarSinDatosAsync(db, link, fallosEnlace, umbralFallos, ahora, ct);

                // Sin muestra válida (primer ciclo, contador retrocedió, failover): no se guarda ni alerta
                if (mejor is null) continue;

                var utilIn  = CalculoConsumo.UtilPct(mejor.InBps,  link.MbpsContratadoIn);
                var utilOut = CalculoConsumo.UtilPct(mejor.OutBps, link.MbpsContratadoOut);
                db.NetSamples.Add(new NetSample
                {
                    LinkId = link.Id, TsUtc = ahora,
                    InBps = (long)Math.Round(mejor.InBps), OutBps = (long)Math.Round(mejor.OutBps),
                    UtilInPct = utilIn, UtilOutPct = utilOut,
                });
                await db.SaveChangesAsync(ct);

                double? util = utilIn is null && utilOut is null ? null : Math.Max(utilIn ?? 0, utilOut ?? 0);
                await alertas.EvaluarSaturacionAsync(db, link, util, ahora, ct);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                log.LogError(ex, "NetMon: error guardando muestra de {iface}", link.Interfaz);
                db.ChangeTracker.Clear();
            }
        }
    }

    async Task<(NetDevice dev, DateTime tsUtc, IReadOnlyList<ContadorInterfaz>? contadores)> LeerAsync(NetDevice dev, CancellationToken ct)
    {
        var cliente = clientes.FirstOrDefault(c => c.Marca.Equals(dev.Marca, StringComparison.OrdinalIgnoreCase));
        if (cliente is null)
        {
            log.LogWarning("NetMon: no hay cliente para la marca '{marca}' ({dev})", dev.Marca, dev.Nombre);
            return (dev, DateTime.UtcNow, null);
        }
        try
        {
            // El instante se toma al recibir la respuesta: es el reloj real del dt
            var contadores = await cliente.LeerContadoresAsync(dev, ct);
            return (dev, DateTime.UtcNow, contadores);
        }
        catch (DeviceClientException ex)
        {
            log.LogWarning("NetMon: {msg}", ex.Message);   // el mensaje no lleva secretos ni URL
            return (dev, DateTime.UtcNow, null);
        }
    }
}
