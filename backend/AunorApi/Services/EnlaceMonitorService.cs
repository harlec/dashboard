using System.Net.NetworkInformation;
using AunorApi.Data;
using AunorApi.Hubs;
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
                ProbeIp = e.Vias
                    .SelectMany(v => v.Equipos)
                    .Where(eq => eq.Activo && eq.Monitorear && eq.CheckPort == null)
                    .Select(eq => eq.Ip)
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        var tareas = sondas
            .Where(s => s.ProbeIp != null)
            .Select(async s =>
            {
                var hop3   = await GetTercerSalto(s.ProbeIp!, timeoutMs);
                var enlace = ClasificarHop(hop3);
                return (s.EstacionId, s.Nombre, enlace, Hop: hop3?.ToString() ?? "—");
            });

        var resultados = await Task.WhenAll(tareas);

        foreach (var (estacionId, nombre, enlace, hop) in resultados)
        {
            var anterior = cache.Get(estacionId);
            cache.Set(estacionId, enlace);

            if (enlace != anterior)
            {
                log.LogInformation("Enlace {est}: {ant} → {nuevo}  (3er salto: {hop})",
                    nombre, anterior, enlace, hop);
                await hub.Clients.All.SendAsync("EnlaceChanged", estacionId, enlace, hop, ct);
            }
        }
    }

    private static async Task<System.Net.IPAddress?> GetTercerSalto(string ip, int timeoutMs)
    {
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(ip, timeoutMs, new byte[32], new PingOptions(3, true));

            // TtlExpired = el 3er router respondió con Time Exceeded (esperado)
            // Success     = destino a menos de 3 saltos (improbable pero manejamos igual)
            if (reply.Status is IPStatus.TtlExpired or IPStatus.Success)
                return reply.Address;

            return null;
        }
        catch { return null; }
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
