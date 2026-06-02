using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading.Channels;
using AunorApi.Data;
using AunorApi.Hubs;
using AunorApi.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

public class PingWorkerService(
    IConnectionStringProvider cs,
    IHubContext<MonitorHub> hub,
    IConfiguration config,
    ILogger<PingWorkerService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var intervalSec  = config.GetValue<int>("Ping:IntervalSeconds",  30);
        var downRetrySec = config.GetValue<int>("Ping:DownRetrySeconds", 12);
        var timeoutMs    = config.GetValue<int>("Ping:TimeoutSeconds",   3) * 1000;
        var pingsPerHost = config.GetValue<int>("Ping:PingsPerHost",     2);
        var maxParallel  = config.GetValue<int>("Ping:MaxParallel",      60);

        log.LogInformation(
            "PingWorker iniciado — ciclo normal {n}s, retry DOWN {d}s, timeout {t}s, paralelo {p}",
            intervalSec, downRetrySec, timeoutMs / 1000, maxParallel);

        // Canal para el loop de retry rápido de equipos DOWN
        var downChannel = Channel.CreateUnbounded<int>();

        // Tarea: ciclo normal completo cada intervalSec
        var normalTask = RunNormalCycle(downChannel.Writer, timeoutMs, pingsPerHost,
                                        maxParallel, intervalSec, ct);

        // Tarea: retry rápido solo para equipos DOWN cada downRetrySec
        var retryTask  = RunDownRetry(downChannel.Reader, timeoutMs, pingsPerHost,
                                      downRetrySec, ct);

        await Task.WhenAll(normalTask, retryTask);
    }

    // ── Ciclo completo: pinga todo en paralelo ────────────────────────────
    private async Task RunNormalCycle(
        ChannelWriter<int> downWriter,
        int timeoutMs, int pingsPerHost, int maxParallel,
        int intervalSec, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var db = NewDb();
                var equipos = await db.Equipos
                    .Where(e => e.Activo && e.Monitorear)
                    .Select(e => new { e.Id, e.Ip, e.CheckPort })
                    .ToListAsync(ct);

                // SemaphoreSlim limita la concurrencia máxima
                var sem = new SemaphoreSlim(maxParallel, maxParallel);

                // Pingar TODOS en paralelo simultáneamente
                var pingTasks = equipos.Select(async eq =>
                {
                    await sem.WaitAsync(ct);
                    try   { return (eq.Id, await CheckHost(eq.Ip, eq.CheckPort, timeoutMs, pingsPerHost)); }
                    finally { sem.Release(); }
                });

                var results = await Task.WhenAll(pingTasks);

                // Procesar cambios de estado (BD — secuencial, thread-safe)
                using var db2 = NewDb();
                var kpiChanged = false;

                foreach (var (equipoId, (estado, latencia)) in results)
                {
                    var changed = await ProcessResult(db2, equipoId, estado, latencia, ct);
                    if (changed)
                    {
                        kpiChanged = true;
                        // Si quedó DOWN → mandarlo al canal de retry rápido
                        if (estado == "DOWN")
                            await downWriter.WriteAsync(equipoId, ct);
                    }
                }

                if (kpiChanged) await EmitKpis(db2, ct);

                log.LogDebug("Ciclo completo: {n} equipos en paralelo", equipos.Count);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogError(ex, "Error en ciclo ping normal"); }

            await Task.Delay(TimeSpan.FromSeconds(intervalSec), ct);
        }
    }

    // ── Retry rápido: solo los equipos DOWN ───────────────────────────────
    private async Task RunDownRetry(
        ChannelReader<int> downReader,
        int timeoutMs, int pingsPerHost,
        int retrySec, CancellationToken ct)
    {
        // Conjunto de IDs que están en DOWN para monitorear más seguido
        var downIds = new HashSet<int>();

        while (!ct.IsCancellationRequested)
        {
            // Leer nuevos IDs que acaban de caer
            while (downReader.TryRead(out var id)) downIds.Add(id);

            if (downIds.Count > 0)
            {
                using var db = NewDb();
                var equipos = await db.Equipos
                    .Where(e => downIds.Contains(e.Id) && e.Activo)
                    .Select(e => new { e.Id, e.Ip, e.CheckPort })
                    .ToListAsync(ct);

                var pingTasks = equipos.Select(async eq =>
                    (eq.Id, await CheckHost(eq.Ip, eq.CheckPort, timeoutMs, pingsPerHost)));
                var results = await Task.WhenAll(pingTasks);

                using var db2 = NewDb();
                foreach (var (equipoId, (estado, latencia)) in results)
                {
                    var changed = await ProcessResult(db2, equipoId, estado, latencia, ct);
                    // Si recuperó → sacarlo del conjunto DOWN
                    if (estado == "UP") downIds.Remove(equipoId);
                    if (changed) await EmitKpis(db2, ct);
                }

                if (downIds.Count > 0)
                    log.LogDebug("Retry DOWN: {n} equipos pendientes", downIds.Count);
            }

            await Task.Delay(TimeSpan.FromSeconds(retrySec), ct);
        }
    }

    // ── Procesar un resultado de ping ─────────────────────────────────────
    private async Task<bool> ProcessResult(
        AppDbContext db, int equipoId, string estado, double? latencia, CancellationToken ct)
    {
        var last = await db.PingLogs
            .Where(p => p.EquipoId == equipoId)
            .OrderByDescending(p => p.Timestamp)
            .FirstOrDefaultAsync(ct);

        if (last?.Estado == estado) return false;   // sin cambio — no hacer nada

        db.PingLogs.Add(new PingLog
        {
            EquipoId   = equipoId,
            Timestamp  = DateTime.UtcNow,
            Estado     = estado,
            LatenciaMs = latencia
        });

        if (estado == "DOWN")
        {
            db.Incidentes.Add(new Incidente { EquipoId = equipoId, Inicio = DateTime.UtcNow });
            await db.SaveChangesAsync(ct);
            await hub.Clients.All.SendAsync("IncidenteAbierto", equipoId, DateTime.UtcNow, ct);
        }
        else
        {
            var inc = await db.Incidentes
                .Where(i => i.EquipoId == equipoId && i.Fin == null)
                .FirstOrDefaultAsync(ct);
            if (inc != null)
            {
                inc.Fin = DateTime.UtcNow;
                inc.DuracionMin = (int)(inc.Fin.Value - inc.Inicio).TotalMinutes;
            }
            await db.SaveChangesAsync(ct);
            if (inc != null)
                await hub.Clients.All.SendAsync("IncidenteCerrado",
                    equipoId, inc.Fin, inc.DuracionMin, ct);
        }

        await hub.Clients.All.SendAsync("EquipoStatusChanged",
            equipoId, estado, latencia, DateTime.UtcNow, ct);

        return true;
    }

    private async Task EmitKpis(AppDbContext db, CancellationToken ct)
    {
        var equipos = await db.Equipos
            .Where(e => e.Activo && e.Monitorear)
            .Select(e => new {
                Estado = db.PingLogs
                    .Where(p => p.EquipoId == e.Id)
                    .OrderByDescending(p => p.Timestamp)
                    .Select(p => p.Estado)
                    .FirstOrDefault()
            }).ToListAsync(ct);

        int total = equipos.Count;
        int ups   = equipos.Count(x => x.Estado == "UP");
        int downs = equipos.Count(x => x.Estado == "DOWN");
        int inc   = await db.Incidentes.CountAsync(i => i.Fin == null, ct);

        await hub.Clients.All.SendAsync("KpiUpdated", ups, downs, total, inc, ct);
    }

    // Decide el método según si hay puerto(s) TCP configurados
    private static Task<(string estado, double? latencia)> CheckHost(
        string ip, string? ports, int timeoutMs, int pingsPerHost)
    {
        if (string.IsNullOrWhiteSpace(ports))
            return IcmpPing(ip, timeoutMs, pingsPerHost);

        var portList = ports.Split(',')
            .Select(p => int.TryParse(p.Trim(), out var n) ? n : 0)
            .Where(n => n > 0)
            .ToList();

        return portList.Count == 0
            ? IcmpPing(ip, timeoutMs, pingsPerHost)
            : TcpCheckMulti(ip, portList, timeoutMs);
    }

    // Prueba varios puertos en paralelo — UP si cualquiera responde
    private static async Task<(string estado, double? latencia)> TcpCheckMulti(
        string ip, List<int> ports, int timeoutMs)
    {
        var tasks = ports.Select(p => TcpCheckOne(ip, p, timeoutMs));
        var results = await Task.WhenAll(tasks);
        var first = results.FirstOrDefault(r => r.up);
        return first.up ? ("UP", first.ms) : ("DOWN", null);
    }

    private static async Task<(bool up, double? ms)> TcpCheckOne(
        string ip, int port, int timeoutMs)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var cts    = new CancellationTokenSource(timeoutMs);
            using var client = new TcpClient();
            await client.ConnectAsync(ip, port, cts.Token);
            sw.Stop();
            return (true, (double)sw.ElapsedMilliseconds);
        }
        catch { return (false, null); }
    }

    // ICMP ping — fallback para equipos sin puerto TCP conocido
    private static async Task<(string estado, double? latencia)> IcmpPing(
        string ip, int timeoutMs, int count)
    {
        double total = 0;
        int    ok    = 0;

        for (int i = 0; i < count; i++)
        {
            try
            {
                using var ping  = new Ping();
                var reply = await ping.SendPingAsync(ip, timeoutMs);
                if (reply.Status == IPStatus.Success) { ok++; total += reply.RoundtripTime; }
            }
            catch { }
        }

        return ok == 0 ? ("DOWN", null) : ("UP", total / ok);
    }

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(cs.ConnectionString).Options);
}
