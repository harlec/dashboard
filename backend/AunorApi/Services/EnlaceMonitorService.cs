using System.Net.NetworkInformation;
using AunorApi.Data;
using AunorApi.Hubs;
using AunorApi.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

public class EnlaceMonitorService(
    IConnectionStringProvider cs,
    IHubContext<MonitorHub> hub,
    EnlaceEstadoCache cache,
    IConfiguration config,
    ILogger<EnlaceMonitorService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var intervalSec = config.GetValue<int>("Enlace:IntervalSeconds", 60);
        var timeoutMs   = config.GetValue<int>("Enlace:TimeoutMs", 2000);

        log.LogInformation("EnlaceMonitor iniciado — ciclo cada {n}s", intervalSec);

        while (!ct.IsCancellationRequested)
        {
            try   { await CheckEnlaces(timeoutMs, ct); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogError(ex, "Error en ciclo EnlaceMonitor"); }

            await Task.Delay(TimeSpan.FromSeconds(intervalSec), ct);
        }
    }

    private async Task CheckEnlaces(int timeoutMs, CancellationToken ct)
    {
        using var db = NewDb();

        // Por cada estación activa, selecciona la primera IP de equipo ICMP como sonda
        var sondas = await db.Estaciones
            .Where(e => e.Activo)
            .Select(e => new {
                EstacionId = e.Id,
                e.Nombre,
                Probe = e.Vias
                    .SelectMany(v => v.Equipos)
                    .Where(eq => eq.Activo && eq.Monitorear && eq.CheckPort == null)
                    .Select(eq => new { eq.Id, eq.Ip })
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        var tareas = sondas
            .Where(s => s.Probe != null)
            .Select(async s =>
            {
                var (hop3, latencia) = await GetTercerSalto(s.Probe!.Ip, timeoutMs);
                var enlace = ClasificarHop(hop3);
                return (s.EstacionId, s.Nombre, ProbeEquipoId: s.Probe!.Id, enlace, Hop: hop3?.ToString() ?? "—", latencia);
            });

        var resultados = await Task.WhenAll(tareas);

        foreach (var (estacionId, nombre, probeEquipoId, enlace, hop, latencia) in resultados)
        {
            var anterior = cache.Get(estacionId);
            cache.Set(estacionId, enlace);

            if (enlace != anterior)
            {
                log.LogInformation("Enlace {est}: {ant} → {nuevo}  (3er salto: {hop})",
                    nombre, anterior, enlace, hop);
                await hub.Clients.All.SendAsync("EnlaceChanged", estacionId, enlace, hop, ct);
                await RegistrarCambioEnlaceAsync(db, probeEquipoId, enlace, latencia, ct);
            }
        }
    }

    // Cierra el evento de enlace abierto (si hay) y abre uno nuevo con el estado actual —
    // misma mecánica que Incidente (Inicio/Fin encadenados), para reconstruir el
    // historial completo de qué enlace estuvo activo en cada momento.
    private static async Task RegistrarCambioEnlaceAsync(
        AppDbContext db, int probeEquipoId, string enlace, double? latencia, CancellationToken ct)
    {
        var ahora = DateTime.Now;
        var abierto = await db.EnlaceEventos
            .Where(e => e.EquipoId == probeEquipoId && e.Fin == null)
            .FirstOrDefaultAsync(ct);
        if (abierto != null)
        {
            abierto.Fin = ahora;
            abierto.DuracionMin = (int)(ahora - abierto.Inicio).TotalMinutes;
        }

        db.EnlaceEventos.Add(new EnlaceEvento
        {
            EquipoId = probeEquipoId, Inicio = ahora, Enlace = enlace, LatenciaMs = latencia,
        });
        await db.SaveChangesAsync(ct);
    }

    private static async Task<(System.Net.IPAddress? hop, double? latenciaMs)> GetTercerSalto(string ip, int timeoutMs)
    {
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(ip, timeoutMs, new byte[32], new PingOptions(3, true));

            // TtlExpired = el 3er router respondió con Time Exceeded (esperado)
            // Success     = destino a menos de 3 saltos (improbable pero manejamos igual)
            if (reply.Status is IPStatus.TtlExpired or IPStatus.Success)
                return (reply.Address, reply.RoundtripTime);

            return (null, null);
        }
        catch { return (null, null); }
    }

    // 3er octeto: 30 = MPLS, 40 = Starlink
    private static string ClasificarHop(System.Net.IPAddress? addr)
    {
        if (addr == null) return "SIN_CONEXION";
        var p = addr.ToString().Split('.');
        if (p.Length != 4) return "DESCONOCIDO";
        return p[2] switch {
            "30" => "MPLS",
            "40" => "STARLINK",
            _    => "DESCONOCIDO"
        };
    }

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(cs.ConnectionString).Options);
}
