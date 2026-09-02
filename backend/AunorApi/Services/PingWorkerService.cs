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
    EnlaceEstadoCache enlaceCache,
    EmailAlertService emailAlert,
    TelegramAlertService telegramAlert,
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
                    .Select(e => new { e.Id, e.Ip, e.CheckPort, e.ViaId, EstacionId = e.Via.EstacionId })
                    .ToListAsync(ct);
                var mantenimientosActivos = await CargarMantenimientosActivos(db, ct);

                // SemaphoreSlim limita la concurrencia máxima
                var sem = new SemaphoreSlim(maxParallel, maxParallel);

                // Pingar TODOS en paralelo simultáneamente
                var pingTasks = equipos.Select(async eq =>
                {
                    await sem.WaitAsync(ct);
                    try   { return (eq.Id, eq.ViaId, eq.EstacionId, await CheckHost(eq.Ip, eq.CheckPort, timeoutMs, pingsPerHost)); }
                    finally { sem.Release(); }
                });

                var results = await Task.WhenAll(pingTasks);

                // Procesar cambios de estado (BD — secuencial, thread-safe)
                using var db2 = NewDb();
                var kpiChanged = false;

                foreach (var (equipoId, viaId, estacionId, (estado, latencia, detalle)) in results)
                {
                    var motivoMtto = ResolverMantenimiento(mantenimientosActivos, equipoId, viaId, estacionId);
                    var changed = await ProcessResult(db2, equipoId, viaId, estacionId, estado, latencia, detalle, motivoMtto, ct);
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
                    .Select(e => new { e.Id, e.Ip, e.CheckPort, e.ViaId, EstacionId = e.Via.EstacionId })
                    .ToListAsync(ct);
                var mantenimientosActivos = await CargarMantenimientosActivos(db, ct);

                var pingTasks = equipos.Select(async eq =>
                    (eq.Id, eq.ViaId, eq.EstacionId, await CheckHost(eq.Ip, eq.CheckPort, timeoutMs, pingsPerHost)));
                var results = await Task.WhenAll(pingTasks);

                using var db2 = NewDb();
                foreach (var (equipoId, viaId, estacionId, (estado, latencia, detalle)) in results)
                {
                    var motivoMtto = ResolverMantenimiento(mantenimientosActivos, equipoId, viaId, estacionId);
                    var changed = await ProcessResult(db2, equipoId, viaId, estacionId, estado, latencia, detalle, motivoMtto, ct);
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
        AppDbContext db, int equipoId, int viaId, int estacionId,
        string estado, double? latencia, string? detalle, string? motivoMtto, CancellationToken ct)
    {
        // Se actualiza SIEMPRE, en todo ciclo (a diferencia de ping_log, que solo
        // graba en cambios de estado) — es lo que consulta el dashboard para
        // mostrar la latencia real actual en vez de la congelada del último cambio.
        // En DOWN no se borra: se deja el último valor bueno conocido, así al
        // revisar un incidente se ve "última latencia antes de caer" en vez de nada.
        var ahora = DateTime.Now;
        if (latencia.HasValue)
            await db.Equipos.Where(e => e.Id == equipoId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(e => e.UltimaLatenciaMs, latencia)
                    .SetProperty(e => e.UltimoPingEn, ahora), ct);
        else
            await db.Equipos.Where(e => e.Id == equipoId)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.UltimoPingEn, ahora), ct);

        var last = await db.PingLogs
            .Where(p => p.EquipoId == equipoId)
            .OrderByDescending(p => p.Timestamp)
            .FirstOrDefaultAsync(ct);

        if (last?.Estado == estado) return false;   // sin cambio — no hacer nada

        db.PingLogs.Add(new PingLog
        {
            EquipoId      = equipoId,
            Timestamp     = DateTime.Now,
            Estado        = estado,
            LatenciaMs    = latencia,
            DetalleEstado = detalle
        });

        bool esStarlink    = enlaceCache.EsStarlink(estacionId);
        bool enMantenimiento = motivoMtto != null;

        if (estado == "DOWN")
        {
            // Durante failover Starlink no se crea incidente — es comportamiento esperado del enlace
            if (!esStarlink)
                db.Incidentes.Add(new Incidente
                {
                    EquipoId = equipoId,
                    Inicio   = DateTime.Now,
                    Tipo     = enMantenimiento ? "Mantenimiento" : "Real",
                    Motivo   = enMantenimiento ? $"Modo mantenimiento: {motivoMtto}" : null,
                });

            await db.SaveChangesAsync(ct);

            if (!esStarlink)
            {
                await hub.Clients.All.SendAsync("IncidenteAbierto", equipoId, DateTime.Now, ct);
                if (!enMantenimiento)
                {
                    var enGrupo = await EvaluarGrupoAsync(db, viaId, estacionId, ct);
                    if (!enGrupo)
                        await SendAlertsAsync(db, equipoId, down: true, duracionMin: 0, detalle);
                }
            }
        }
        else
        {
            var inc = await db.Incidentes
                .Where(i => i.EquipoId == equipoId && i.Fin == null)
                .FirstOrDefaultAsync(ct);
            if (inc != null)
            {
                inc.Fin = DateTime.Now;
                inc.DuracionMin = (int)(inc.Fin.Value - inc.Inicio).TotalMinutes;
            }
            await db.SaveChangesAsync(ct);
            if (inc != null)
            {
                await hub.Clients.All.SendAsync("IncidenteCerrado",
                    equipoId, inc.Fin, inc.DuracionMin, ct);
                // Silenciar también la recuperación si el incidente se abrió/cerró en mantenimiento
                if (!enMantenimiento && inc.Tipo != "Mantenimiento")
                {
                    var enGrupo = await EvaluarGrupoAsync(db, viaId, estacionId, ct);
                    if (!enGrupo)
                        await SendAlertsAsync(db, equipoId, down: false, duracionMin: inc.DuracionMin ?? 0);
                }
            }
        }

        // alerta=false en Starlink o mantenimiento para DOWN → frontend no reproduce sonido
        bool alerta = !enMantenimiento && (estado != "DOWN" || !esStarlink);
        await hub.Clients.All.SendAsync("EquipoStatusChanged",
            equipoId, estado, latencia, DateTime.Now, alerta, ct);

        return true;
    }

    // ── Mantenimiento activo ───────────────────────────────────────────────
    private static async Task<List<Mantenimiento>> CargarMantenimientosActivos(AppDbContext db, CancellationToken ct)
    {
        var ahora = DateTime.Now;
        return await db.Mantenimientos
            .Where(m => m.Desde <= ahora && m.Hasta >= ahora)
            .ToListAsync(ct);
    }

    private static string? ResolverMantenimiento(List<Mantenimiento> activos, int equipoId, int viaId, int estacionId) =>
        activos.FirstOrDefault(m =>
            m.EquipoId == equipoId || m.ViaId == viaId || m.EstacionId == estacionId)?.Motivo;

    // ── Incidentes de grupo (vía/peaje) ────────────────────────────────────
    // Umbrales — mismos que el indicador visual del dashboard (lib/incidentesAgrupados.ts):
    // vía = 100% de sus equipos monitoreados caídos (mín. 2); peaje = >=50% caído.
    private const int UmbralPeajePct = 50;

    // Re-evalúa el estado de la vía/peaje del equipo que acaba de cambiar, y
    // crea/edita/cierra el mensaje de Telegram del grupo si corresponde.
    // Devuelve true si este equipo queda cubierto por un mensaje de grupo
    // (en ese caso el llamador no debe mandar también la alerta individual).
    private async Task<bool> EvaluarGrupoAsync(AppDbContext db, int viaId, int estacionId, CancellationToken ct)
    {
        var estado = await db.Equipos
            .Where(e => e.Via.EstacionId == estacionId && e.Activo && e.Monitorear)
            .Select(e => new
            {
                e.Id,
                e.ViaId,
                Estado = db.PingLogs.Where(p => p.EquipoId == e.Id)
                    .OrderByDescending(p => p.Timestamp).Select(p => p.Estado).FirstOrDefault()
            })
            .ToListAsync(ct);

        var viaEquipos = estado.Where(e => e.ViaId == viaId).ToList();
        var viaDown  = viaEquipos.Count(e => e.Estado == "DOWN");
        var viaTotal = viaEquipos.Count;
        var estDown  = estado.Count(e => e.Estado == "DOWN");
        var estTotal = estado.Count;

        bool viaCumple   = viaTotal >= 2 && viaDown == viaTotal;
        bool peajeCumple = estTotal > 0 && (decimal)estDown / estTotal * 100 >= UmbralPeajePct;

        if (!viaCumple && !peajeCumple)
        {
            // Igual puede haber grupos abiertos resolviéndose (ya no cumplen el umbral)
            var abiertoVia   = await db.IncidenteGrupos.FirstOrDefaultAsync(g => g.Tipo == "Via"   && g.ViaId == viaId          && g.Fin == null, ct);
            var abiertoPeaje = await db.IncidenteGrupos.FirstOrDefaultAsync(g => g.Tipo == "Peaje" && g.EstacionId == estacionId && g.Fin == null, ct);
            if (abiertoVia is null && abiertoPeaje is null) return false;
        }

        var estacionNombre = await db.Estaciones.Where(e => e.Id == estacionId).Select(e => e.Nombre).FirstOrDefaultAsync(ct) ?? "?";
        var viaNumero      = await db.Vias.Where(v => v.Id == viaId).Select(v => v.Numero).FirstOrDefaultAsync(ct) ?? "?";
        bool cubierto = false;

        // ── Vía ──
        var grupoVia = await db.IncidenteGrupos.FirstOrDefaultAsync(g => g.Tipo == "Via" && g.ViaId == viaId && g.Fin == null, ct);
        if (viaCumple)
        {
            cubierto = true;
            var msg = $"🔴 INCIDENTE — VÍA {viaNumero} ({estacionNombre})\n{DateTime.Now:HH:mm} · {viaDown}/{viaTotal} equipos sin respuesta";
            if (grupoVia is null)
                await CrearGrupoAsync(db, "Via", estacionId, viaId, viaDown, viaTotal, msg, ct);
            else if (grupoVia.EquiposAfectados != viaDown)
                await ActualizarGrupoAsync(db, grupoVia, viaDown, viaTotal, msg, ct);
        }
        else if (grupoVia != null)
        {
            cubierto = true;
            var msg = $"🟢 RESUELTO — VÍA {viaNumero} ({estacionNombre})\nDuración: {DuracionTexto(grupoVia.Inicio)}";
            await CerrarGrupoAsync(db, grupoVia, msg, ct);
        }

        // ── Peaje ──
        var grupoPeaje = await db.IncidenteGrupos.FirstOrDefaultAsync(g => g.Tipo == "Peaje" && g.EstacionId == estacionId && g.Fin == null, ct);
        if (peajeCumple)
        {
            cubierto = true;
            var pct = Math.Round((decimal)estDown / estTotal * 100);
            var msg = $"🔴 INCIDENTE DE PEAJE — {estacionNombre}\n{DateTime.Now:HH:mm} · {estDown}/{estTotal} equipos caídos ({pct}%)";
            if (grupoPeaje is null)
                await CrearGrupoAsync(db, "Peaje", estacionId, null, estDown, estTotal, msg, ct);
            else if (grupoPeaje.EquiposAfectados != estDown)
                await ActualizarGrupoAsync(db, grupoPeaje, estDown, estTotal, msg, ct);
        }
        else if (grupoPeaje != null)
        {
            cubierto = true;
            var msg = $"🟢 RESUELTO — PEAJE {estacionNombre}\nDuración: {DuracionTexto(grupoPeaje.Inicio)}";
            await CerrarGrupoAsync(db, grupoPeaje, msg, ct);
        }

        return cubierto;
    }

    private async Task CrearGrupoAsync(AppDbContext db, string tipo, int estacionId, int? viaId, int afectados, int total, string mensaje, CancellationToken ct)
    {
        var envio = await telegramAlert.SendGrupoAsync(mensaje);
        db.IncidenteGrupos.Add(new IncidenteGrupo
        {
            Tipo = tipo, EstacionId = estacionId, ViaId = viaId,
            Inicio = DateTime.Now,
            TelegramChatId = envio.ChatId, TelegramMessageId = envio.MessageId,
            EquiposAfectados = afectados, EquiposTotal = total,
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task ActualizarGrupoAsync(AppDbContext db, IncidenteGrupo grupo, int afectados, int total, string mensaje, CancellationToken ct)
    {
        grupo.EquiposAfectados = afectados;
        grupo.EquiposTotal = total;
        // No se espera el envío — solo se encola. Si esto bloqueara aquí, un incidente de
        // 38 equipos frenaría el ciclo de ping 38 veces (una edición por cada cambio,
        // respetando el throttle de Telegram). El worker lo procesa en su propio tiempo.
        if (grupo.TelegramMessageId != null)
            _ = telegramAlert.EditarGrupoAsync(grupo.TelegramMessageId, mensaje);
        else
            log.LogWarning("Grupo {id} sin message_id — no se pudo editar en Telegram", grupo.Id);
        await db.SaveChangesAsync(ct);
    }

    private async Task CerrarGrupoAsync(AppDbContext db, IncidenteGrupo grupo, string mensajeFinal, CancellationToken ct)
    {
        grupo.Fin = DateTime.Now;
        if (grupo.TelegramMessageId != null)
            _ = telegramAlert.EditarGrupoAsync(grupo.TelegramMessageId, mensajeFinal);
        await db.SaveChangesAsync(ct);
    }

    private static string DuracionTexto(DateTime inicio)
    {
        var min = Math.Max((int)(DateTime.Now - inicio).TotalMinutes, 0);
        return min < 60 ? $"{min}m" : $"{min / 60}h {min % 60}m";
    }

    // ── Notificar email + Telegram cuando un equipo cae o se recupera ─────
    private async Task SendAlertsAsync(AppDbContext db, int equipoId, bool down, int duracionMin, string? detalle = null)
    {
        var alertasActivas = await db.Configuraciones
            .Where(c => c.Clave == "alertas_activas")
            .Select(c => c.Valor)
            .FirstOrDefaultAsync();
        if (alertasActivas != "1") return;

        var equipo = await db.Equipos
            .Where(e => e.Id == equipoId)
            .Select(e => new { e.Nombre, e.Ip, Estacion = e.Via.Estacion.Nombre })
            .FirstOrDefaultAsync();
        if (equipo is null) return;

        try
        {
            if (down)
                await Task.WhenAll(
                    emailAlert.SendDownAlertAsync(equipo.Nombre, equipo.Estacion, equipo.Ip, InterpretarDetalle(detalle)),
                    telegramAlert.SendDownAlertAsync(equipo.Nombre, equipo.Estacion, equipo.Ip, InterpretarDetalle(detalle)));
            else
                await Task.WhenAll(
                    emailAlert.SendUpAlertAsync(equipo.Nombre, equipo.Estacion, equipo.Ip, duracionMin),
                    telegramAlert.SendUpAlertAsync(equipo.Nombre, equipo.Estacion, equipo.Ip, duracionMin));
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error enviando alertas para equipo {id}", equipoId);
        }
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
    private static Task<(string estado, double? latencia, string? detalle)> CheckHost(
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
    private static async Task<(string estado, double? latencia, string? detalle)> TcpCheckMulti(
        string ip, List<int> ports, int timeoutMs)
    {
        var tasks = ports.Select(p => TcpCheckOne(ip, p, timeoutMs));
        var results = await Task.WhenAll(tasks);
        var first = results.FirstOrDefault(r => r.up);
        return first.up
            ? ("UP", first.ms, null)
            : ("DOWN", null, results.Select(r => r.detalle).FirstOrDefault(d => d != null) ?? "TcpError");
    }

    private static async Task<(bool up, double? ms, string? detalle)> TcpCheckOne(
        string ip, int port, int timeoutMs)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var cts    = new CancellationTokenSource(timeoutMs);
            using var client = new TcpClient();
            await client.ConnectAsync(ip, port, cts.Token);
            sw.Stop();
            return (true, (double)sw.ElapsedMilliseconds, null);
        }
        catch (SocketException sockEx) { return (false, null, sockEx.SocketErrorCode.ToString()); }
        catch (OperationCanceledException) { return (false, null, "TcpTimeout"); }
        catch (Exception ex) { return (false, null, ex.GetType().Name); }
    }

    // ICMP ping — fallback para equipos sin puerto TCP conocido
    private static async Task<(string estado, double? latencia, string? detalle)> IcmpPing(
        string ip, int timeoutMs, int count)
    {
        double total = 0;
        int    ok    = 0;
        string? ultimoDetalle = null;

        for (int i = 0; i < count; i++)
        {
            try
            {
                using var ping  = new Ping();
                var reply = await ping.SendPingAsync(ip, timeoutMs);
                if (reply.Status == IPStatus.Success) { ok++; total += reply.RoundtripTime; }
                else ultimoDetalle = reply.Status.ToString();
            }
            catch (Exception ex) { ultimoDetalle = ex.GetType().Name; }
        }

        return ok == 0 ? ("DOWN", null, ultimoDetalle ?? "TimedOut") : ("UP", total / ok, null);
    }

    // Interpretación legible del código crudo — usada en alertas e historial
    public static string? InterpretarDetalle(string? detalle) => detalle switch
    {
        null => null,
        "TimedOut" or "TcpTimeout" =>
            "Paquete salió, nadie contestó → pérdida en camino o equipo muerto",
        "DestinationHostUnreachable" or "DestinationNetworkUnreachable" or "DestinationUnreachable"
            or "HostUnreachable" or "NetworkUnreachable" or "ConnectionRefused" =>
            "Un router respondió: no hay ruta → enlace caído aguas arriba",
        "TtlExpired" =>
            "Bucle de ruteo, típico en reconvergencia/failover",
        "NoBufferSpaceAvailable" =>
            "El problema es el servidor central, no la red",
        _ => $"Detalle: {detalle}",
    };

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(cs.ConnectionString).Options);
}
