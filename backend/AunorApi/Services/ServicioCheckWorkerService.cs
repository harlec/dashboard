using System.Collections.Concurrent;
using AunorApi.Data;
using AunorApi.Models;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

// Chequea servicios que no cuelgan de una vía/estación (servidores en sala,
// páginas web) — subsistema independiente de PingWorkerService, mismo patrón
// de debounce/confirmaciones pero sin agrupación de incidentes ni alertas por
// ahora (solo guarda info; ver plan de "Monitoreo de Servicios").
public class ServicioCheckWorkerService(
    IConnectionStringProvider cs,
    IcmpGate icmpGate,
    IHttpClientFactory httpClientFactory,
    EmailAlertService emailAlert,
    TelegramAlertService telegramAlert,
    IConfiguration config,
    ILogger<ServicioCheckWorkerService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var intervalSec        = config.GetValue<int>("Servicios:IntervalSeconds", 60);
        var timeoutMs           = config.GetValue<int>("Servicios:TimeoutSeconds", 5) * 1000;
        var maxParallel          = config.GetValue<int>("Servicios:MaxParallel", 10);
        var confirmacionesDown  = config.GetValue<int>("Ping:ConfirmacionesDown", 2);

        log.LogInformation(
            "ServicioCheckWorker iniciado — ciclo {n}s, timeout {t}s, paralelo {p}, confirmaciones DOWN {c}",
            intervalSec, timeoutMs / 1000, maxParallel, confirmacionesDown);

        var downStreak = new ConcurrentDictionary<int, int>();
        var httpClient = httpClientFactory.CreateClient();

        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var db = NewDb();
                var checks = await db.ServicioChecks
                    .Where(c => c.Activo && c.Monitorear)
                    .Select(c => new { c.Id, c.TipoCheck, c.Host, c.Puerto })
                    .ToListAsync(ct);

                var sem = new SemaphoreSlim(maxParallel, maxParallel);
                var tasks = checks.Select(async chk =>
                {
                    await sem.WaitAsync(ct);
                    try   { return (chk.Id, await RunCheck(chk.TipoCheck, chk.Host, chk.Puerto, timeoutMs, icmpGate.Semaphore, httpClient)); }
                    finally { sem.Release(); }
                });

                var results = await Task.WhenAll(tasks);

                using var db2 = NewDb();
                foreach (var (checkId, (estado, latencia, detalle)) in results)
                    await ProcessResult(db2, downStreak, confirmacionesDown, checkId, estado, latencia, detalle, ct);

                log.LogDebug("Ciclo servicios: {n} checks", checks.Count);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogError(ex, "Error en ciclo de chequeo de servicios"); }

            await Task.Delay(TimeSpan.FromSeconds(intervalSec), ct);
        }
    }

    private static Task<(string estado, double? latencia, string? detalle)> RunCheck(
        string tipoCheck, string host, int? puerto, int timeoutMs, SemaphoreSlim icmpSem, HttpClient httpClient) => tipoCheck switch
    {
        "Tcp"  => TcpCheck(host, puerto, timeoutMs),
        "Http" => NetworkChecks.HttpCheck(httpClient, host, timeoutMs),
        _      => NetworkChecks.IcmpPing(host, timeoutMs, 1, icmpSem),
    };

    private static async Task<(string estado, double? latencia, string? detalle)> TcpCheck(string host, int? puerto, int timeoutMs)
    {
        if (puerto is not > 0) return ("DOWN", null, "SinPuerto");
        var (up, ms, detalle) = await NetworkChecks.TcpCheckOne(host, puerto.Value, timeoutMs);
        return up ? ("UP", ms, null) : ("DOWN", null, detalle);
    }

    private async Task ProcessResult(
        AppDbContext db, ConcurrentDictionary<int, int> downStreak, int confirmacionesDown,
        int checkId, string estado, double? latencia, string? detalle, CancellationToken ct)
    {
        // No se limpia UltimaLatenciaMs en DOWN — se deja el último valor bueno
        // conocido, igual que Equipo.UltimaLatenciaMs en PingWorkerService.
        var ahora = DateTime.Now;
        if (latencia.HasValue)
            await db.ServicioChecks.Where(c => c.Id == checkId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.UltimaLatenciaMs, latencia)
                    .SetProperty(c => c.UltimoCheckEn, ahora), ct);
        else
            await db.ServicioChecks.Where(c => c.Id == checkId)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.UltimoCheckEn, ahora), ct);

        // Mismo criterio de confirmación que PingWorkerService.ProcessResult — un
        // solo ciclo fallido no basta para declarar el servicio caído.
        if (estado == "UP")
            downStreak.TryRemove(checkId, out _);
        else
        {
            var racha = downStreak.AddOrUpdate(checkId, 1, (_, c) => c + 1);
            if (racha < confirmacionesDown) return;
        }

        var check = await db.ServicioChecks.FindAsync([checkId], ct);
        if (check is null || check.UltimoEstado == estado) return;

        var estadoPrevio = check.UltimoEstado;
        check.UltimoEstado = estado;
        await db.SaveChangesAsync(ct);

        db.ServicioCheckLogs.Add(new ServicioCheckLog
        {
            ServicioCheckId = checkId,
            Timestamp       = ahora,
            Estado          = estado,
            LatenciaMs      = latencia,
            Detalle         = detalle,
        });

        if (estado == "DOWN")
        {
            db.ServicioIncidentes.Add(new ServicioIncidente
            {
                ServicioCheckId = checkId,
                Inicio          = ahora,
                DetalleEstado   = detalle,
            });
        }
        else
        {
            var inc = await db.ServicioIncidentes
                .Where(i => i.ServicioCheckId == checkId && i.Fin == null)
                .FirstOrDefaultAsync(ct);
            if (inc != null)
            {
                inc.Fin = ahora;
                inc.DuracionMin = (int)(inc.Fin.Value - inc.Inicio).TotalMinutes;
            }
        }

        await db.SaveChangesAsync(ct);

        // Primer chequeo UP (sin estado previo) no es una recuperación: no se avisa.
        if (estado == "UP" && estadoPrevio != "DOWN") return;

        // Fire-and-forget: un SMTP lento no debe frenar el ciclo de chequeos.
        var duracion = estado == "UP" ? (await db.ServicioIncidentes.Where(i => i.ServicioCheckId == checkId && i.Fin != null)
            .OrderByDescending(i => i.Fin).Select(i => i.DuracionMin).FirstOrDefaultAsync(ct)) ?? 0 : 0;
        _ = Task.Run(() => EnviarAlertasAsync(checkId, estado == "DOWN", duracion, detalle));
    }

    private async Task EnviarAlertasAsync(int checkId, bool down, int duracionMin, string? detalle)
    {
        try
        {
            using var db = NewDb();
            var activas = await db.Configuraciones.Where(c => c.Clave == "alertas_activas")
                .Select(c => c.Valor).FirstOrDefaultAsync();
            if (activas != "1") return;

            var chk = await db.ServicioChecks.Where(c => c.Id == checkId)
                .Select(c => new { Servicio = c.Servicio.Nombre, c.Nombre, c.Host, c.Puerto }).FirstOrDefaultAsync();
            if (chk is null) return;

            var destino = chk.Puerto is > 0 ? $"{chk.Host}:{chk.Puerto}" : chk.Host;
            var interp  = detalle is null ? null : $"Detalle: {detalle}";

            if (down)
                await Task.WhenAll(
                    emailAlert.SendServicioDownAsync(chk.Servicio, chk.Nombre, destino, interp),
                    telegramAlert.SendServicioDownAsync(chk.Servicio, chk.Nombre, destino, interp));
            else
                await Task.WhenAll(
                    emailAlert.SendServicioUpAsync(chk.Servicio, chk.Nombre, destino, duracionMin),
                    telegramAlert.SendServicioUpAsync(chk.Servicio, chk.Nombre, destino, duracionMin));
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error enviando alertas del chequeo de servicio {id}", checkId);
        }
    }

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs.ConnectionString).Options);
}
