using AunorApi.Data;
using AunorApi.DTOs;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using static AunorApi.Services.ReporteDiario.ReporteDiarioReglas;

namespace AunorApi.Services.ReporteDiario;

// Arma el DTO único del reporte diario Sigma. Convive con el reporte de discrepancias actual:
// no lo toca ni comparte estado con él.
public class ReporteDiarioService(
    IConnectionStringProvider cs,
    ConsolidadoConnectionProvider consolidado,
    ReporteService reporteService,
    ILogger<ReporteDiarioService> log)
{
    public sealed record Config(
        TimeSpan HoraCorte, int EventoEquipos, int EventoVentanaMin, double UmbralLatenciaMs,
        int ViaMinTransitos, bool IncluirMantenimiento, double MargenDiscPt);

    // Plaza (nombre mostrado) según tra_coest del consolidado
    public static string Plaza(int coest) => coest switch
    {
        1 => "Fortaleza", 2 => "Huarmey", 3 => "KM 402", 4 => "Virú", 5 => "Santa", _ => $"Plaza {coest}"
    };

    // ── Zona horaria / ventana ───────────────────────────────────────────
    public static DateTime AhoraLima()
    {
        foreach (var id in new[] { "America/Lima", "SA Pacific Standard Time" })
        {
            try { return TimeZoneInfo.ConvertTime(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(id)); }
            catch (TimeZoneNotFoundException) { }
        }
        return DateTime.Now; // el contenedor corre con TZ=America/Lima
    }

    // Último corte (08:00 por defecto) ya cumplido: fin de la última ventana completa.
    public static DateTime UltimoCorte(DateTime ahora, TimeSpan hora)
    {
        var c = ahora.Date.Add(hora);
        return c <= ahora ? c : c.AddDays(-1);
    }

    // Etiqueta de una ventana = fecha de su inicio, sin el desplazamiento de la hora de corte.
    private static DateTime Etiqueta(DateTime inicioVentana, TimeSpan corte) => inicioVentana.Add(-corte).Date;

    public async Task<Config> LeerConfigAsync(CancellationToken ct = default)
    {
        using var db = NewDb();
        var d = await db.Configuraciones.AsNoTracking().Where(c => c.Clave.StartsWith("reporte_") || c.Clave == "hora_reporte_diario")
            .ToDictionaryAsync(c => c.Clave, c => c.Valor, ct);
        string V(string k) => d.GetValueOrDefault(k) ?? "";
        int I(string k, int def) => int.TryParse(V(k), out var x) && x > 0 ? x : def;
        double Dd(string k, double def) => double.TryParse(V(k), System.Globalization.CultureInfo.InvariantCulture, out var x) && x > 0 ? x : def;
        return new Config(
            TimeSpan.TryParse(V("hora_reporte_diario"), out var h) ? h : new TimeSpan(8, 0, 0),
            I("reporte_evento_comun_equipos", 3), I("reporte_evento_comun_ventana_min", 10),
            Dd("reporte_latencia_umbral_ms", 24), I("reporte_via_min_transitos", 50),
            V("reporte_incluir_mantenimiento") == "1", 1.0);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Generación
    // ═════════════════════════════════════════════════════════════════════
    public async Task<ReporteDiarioDto> GenerarAsync(DateTime? corte = null, CancellationToken ct = default)
    {
        var cfg   = await LeerConfigAsync(ct);
        var hasta = corte ?? UltimoCorte(AhoraLima(), cfg.HoraCorte);
        var desde = hasta.AddDays(-1);
        var f     = Etiqueta(desde, cfg.HoraCorte);   // etiqueta de la ventana actual

        // ── Discrepancia y OCR (snapshots) ──────────────────────────────
        List<SnapDisc> disc = []; List<SnapOcr> ocr = [];
        bool hayDisc = false, hayOcr = false;
        try
        {
            await AsegurarSnapshotsAsync(f, cfg.HoraCorte, ct);
            (disc, ocr) = await LeerSnapshotsAsync(f.AddDays(-29), f, ct);
            hayDisc = true; hayOcr = true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Consolidado sin configurar / inaccesible: esas secciones salen "sin dato"
            log.LogWarning(ex, "Reporte diario: no se pudieron obtener discrepancias/OCR");
        }

        var tendDisc = TendenciaDiscrepancia(disc, f, hayDisc);
        var tendOcr  = TendenciaOcr(ocr, f, hayOcr);

        var discHoy  = disc.Where(r => r.Fecha == f).ToList();
        var txHoy    = discHoy.Sum(r => r.Transitos);
        int? txHoyN  = hayDisc && txHoy > 0 ? txHoy : null;
        int? disHoyN = txHoyN is null ? null : discHoy.Sum(r => r.Discrepancias);
        var pctHoy   = Pct(disHoyN, txHoyN);
        var pctAyer  = PctDisc(disc.Where(r => r.Fecha == f.AddDays(-1)));
        var kpiDisc  = new RdDiscrepanciaKpi(pctHoy, txHoyN, disHoyN, DeltaPt(pctHoy, pctAyer));

        var ocrHoy   = ocr.Where(r => r.Fecha == f).ToList();
        int? evalHoy = hayOcr && ocrHoy.Sum(r => r.Evaluables) > 0 ? ocrHoy.Sum(r => r.Evaluables) : null;
        int? recHoy  = evalHoy is null ? null : ocrHoy.Sum(r => r.Reconocidas);
        var ocrPct   = Pct(recHoy, evalHoy);
        var ocrAyer  = PctOcr(ocr.Where(r => r.Fecha == f.AddDays(-1)));
        var kpiOcr   = new RdOcrKpi(ocrPct, recHoy, evalHoy, DeltaPt(ocrPct, ocrAyer));

        var vias     = ViasCriticas(disc, f, cfg.ViaMinTransitos);
        var ocrDto   = OcrSeccion(ocr, ocrHoy, f, hayOcr);
        try { ocrDto = ocrDto with { PlacasFrecuentes = await PlacasFrecuentesAsync(desde, hasta, ct) }; }
        catch (Exception ex) when (ex is not OperationCanceledException) { log.LogWarning(ex, "Reporte diario: placas frecuentes"); }

        // ── Equipos / servicios ─────────────────────────────────────────
        var (kpiEquipos, pendientes) = await EquiposAsync(hasta, ct);
        pendientes.AddRange(await ServiciosPendientesAsync(ct));
        pendientes = pendientes.OrderBy(p => p.SinDato).ThenBy(p => p.Desde ?? DateTime.MaxValue).ToList();

        // ── Incidentes ──────────────────────────────────────────────────
        var kpiInc  = await IncidentesKpiAsync(hasta, ct);
        var eventos = await EventosAsync(desde, hasta, cfg, ct);

        // ── Disponibilidad 30 d ─────────────────────────────────────────
        var (kpiDisp, plazasDisp) = await DisponibilidadAsync(hasta, cfg, ct);

        // ── Latencia ────────────────────────────────────────────────────
        var latencia = await LatenciaAsync(desde, hasta, cfg.UmbralLatenciaMs, ct);

        // ── Lectura rápida ──────────────────────────────────────────────
        var sinResp24 = pendientes.Where(p => p.Tipo == "Equipo" && p.MinutosSinServicio > 24 * 60).ToList();
        var plazasConc = vias.GroupBy(v => v.Plaza).Where(g => g.Count() >= 2).OrderByDescending(g => g.Count())
            .Select(g => g.Key).ToList();
        if (plazasConc.Count == 0 && vias.Count > 0) plazasConc = [vias[0].Plaza];
        var lectura = LecturaRapida(new EntradaLectura(
            pctHoy, PromedioPrevio(tendDisc), cfg.MargenDiscPt, plazasConc,
            sinResp24.Count, sinResp24.Count == 0 ? null : (int)(sinResp24.Max(p => p.MinutosSinServicio ?? 0) / 60.0),
            eventos.FirstOrDefault(e => e.EventoComun)));

        var inds = new RdIndicadores(kpiDisc, kpiOcr, kpiEquipos, kpiInc, kpiDisp);
        return new ReporteDiarioDto(desde, hasta, AhoraLima(), lectura, inds, tendDisc, tendOcr,
            pendientes, plazasDisp, eventos, vias, ocrDto, latencia, cfg.UmbralLatenciaMs);
    }

    // Promedio de los 29 días anteriores al actual (referencia para la regla "subió sobre el promedio")
    private static double? PromedioPrevio(RdTendencia t) =>
        Promedio(t.Puntos.Take(Math.Max(0, t.Puntos.Count - 1)).Select(p => p.Valor));

    // ═════════════════════════════════════════════════════════════════════
    //  Snapshots de discrepancia / OCR
    // ═════════════════════════════════════════════════════════════════════
    private sealed class SnapDisc { public DateTime Fecha { get; set; } public int Coest { get; set; } public int Nuvia { get; set; } public string Via { get; set; } = ""; public int Transitos { get; set; } public int Discrepancias { get; set; } }
    private sealed class SnapOcr  { public DateTime Fecha { get; set; } public int Coest { get; set; } public int Nuvia { get; set; } public string Via { get; set; } = ""; public int Evaluables { get; set; } public int Reconocidas { get; set; } public int NoLegibles { get; set; } public int ErrorDeteccion { get; set; } public int SinPlacaRef { get; set; } }

    // Calcula (desde el consolidado) y guarda los snapshots de las ventanas faltantes de los últimos 30 días,
    // más SIEMPRE la ventana actual (por si hubo justificaciones tardías). Solo ventanas completas.
    public async Task AsegurarSnapshotsAsync(DateTime fActual, TimeSpan corte, CancellationToken ct = default)
    {
        await using var app = new SqlConnection(cs.ConnectionString);
        var existentes = (await app.QueryAsync<DateTime>(@"
            SELECT d.fecha FROM (SELECT DISTINCT fecha FROM snap_discrepancia_via_dia WHERE fecha BETWEEN @a AND @b) d
            WHERE EXISTS (SELECT 1 FROM snap_ocr_via_dia o WHERE o.fecha = d.fecha)",
            new { a = fActual.AddDays(-29), b = fActual })).Select(x => x.Date).ToHashSet();

        var faltan = Enumerable.Range(0, 30).Select(i => fActual.AddDays(-i)).Where(d => !existentes.Contains(d)).ToList();
        if (!faltan.Contains(fActual)) faltan.Add(fActual);
        await RecalcularAsync(faltan.Min(), faltan.Max(), corte, ct);
    }

    // Recalcula los snapshots de las ventanas [desde..hasta] (etiquetas). Usado también por el backfill manual.
    public async Task RecalcularAsync(DateTime fDesde, DateTime fHasta, TimeSpan corte, CancellationToken ct = default)
    {
        var ini = fDesde.Add(corte);
        var fin = fHasta.AddDays(1).Add(corte);
        var off = (int)corte.TotalMinutes;

        await using var con = new SqlConnection(await consolidado.GetAsync());
        await con.OpenAsync(ct);
        await con.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");

        const string join = "FROM transitos t LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia";
        const string grp  = "CAST(DATEADD(MINUTE, -@off, t.tra_fecha) AS DATE)";
        const string via  = "ISNULL(MAX(vd.via_nombr), 'Via ' + CAST(t.tra_nuvia AS VARCHAR(5)))";
        var p = new { ini, fin, off };

        // Discrepancias: numerador validado contra disjus; denominador = todos los tránsitos normales.
        // Misma definición que DiscrepanciasService.
        // OUTER APPLY + TOP 1 (como DiscrepanciasService.GetAnalisisAsync): SQL Server no permite una
        // subconsulta dentro de un SUM, y disjus puede traer varias filas por tránsito.
        var disc = (await con.QueryAsync<SnapDisc>($@"
            SELECT {grp} AS Fecha, t.tra_coest AS Coest, t.tra_nuvia AS Nuvia, {via} AS Via,
                   COUNT(*) AS Transitos,
                   SUM(CASE WHEN dj.ok IS NOT NULL AND t.tra_manua <> t.tra_dac THEN 1 ELSE 0 END) AS Discrepancias
            {join}
            OUTER APPLY (SELECT TOP 1 1 AS ok FROM disjus d
                         WHERE d.dis_coest=t.tra_coest AND d.dis_nuvia=t.tra_nuvia
                           AND d.dis_numev=t.tra_numev AND d.dis_fecha=t.tra_fecha) dj
            WHERE t.tra_fecha >= @ini AND t.tra_fecha < @fin {DiscrepanciasService.FiltroTipo}
            GROUP BY {grp}, t.tra_coest, t.tra_nuvia",
            p, commandTimeout: 300)).ToList();

        // OCR: las 4 categorías son excluyentes y suman 'evaluables'
        const string conRef = "ISNULL(t.tra_paten,'') <> ''";
        var oc = (await con.QueryAsync<SnapOcr>($@"
            SELECT {grp} AS Fecha, t.tra_coest AS Coest, t.tra_nuvia AS Nuvia, {via} AS Via,
                   COUNT(*) AS Evaluables,
                   SUM(CASE WHEN {conRef} AND t.tra_paten = t.tra_patocr THEN 1 ELSE 0 END) AS Reconocidas,
                   SUM(CASE WHEN {conRef} AND ISNULL(t.tra_patocr,'') = '' THEN 1 ELSE 0 END) AS NoLegibles,
                   SUM(CASE WHEN {conRef} AND ISNULL(t.tra_patocr,'') <> '' AND t.tra_paten <> t.tra_patocr THEN 1 ELSE 0 END) AS ErrorDeteccion,
                   SUM(CASE WHEN NOT ({conRef}) THEN 1 ELSE 0 END) AS SinPlacaRef
            {join}
            WHERE t.tra_fecha >= @ini AND t.tra_fecha < @fin {DiscrepanciasService.FiltroTipo}
            GROUP BY {grp}, t.tra_coest, t.tra_nuvia",
            p, commandTimeout: 300)).ToList();

        await using var app = new SqlConnection(cs.ConnectionString);
        await app.OpenAsync(ct);
        await using var tx = await app.BeginTransactionAsync(ct);
        var rango = new { a = fDesde, b = fHasta };
        await app.ExecuteAsync("DELETE FROM snap_discrepancia_via_dia WHERE fecha BETWEEN @a AND @b", rango, tx);
        await app.ExecuteAsync("DELETE FROM snap_ocr_via_dia WHERE fecha BETWEEN @a AND @b", rango, tx);
        await app.ExecuteAsync(@"INSERT INTO snap_discrepancia_via_dia (fecha, coest, nuvia, via, transitos, discrepancias)
            VALUES (@Fecha, @Coest, @Nuvia, @Via, @Transitos, @Discrepancias)", disc, tx);
        await app.ExecuteAsync(@"INSERT INTO snap_ocr_via_dia (fecha, coest, nuvia, via, evaluables, reconocidas, no_legibles, error_deteccion, sin_placa_ref)
            VALUES (@Fecha, @Coest, @Nuvia, @Via, @Evaluables, @Reconocidas, @NoLegibles, @ErrorDeteccion, @SinPlacaRef)", oc, tx);
        await tx.CommitAsync(ct);
        log.LogInformation("Snapshots reporte diario {a:yyyy-MM-dd}..{b:yyyy-MM-dd}: {d} filas discrepancia, {o} filas OCR", fDesde, fHasta, disc.Count, oc.Count);
    }

    private async Task<(List<SnapDisc>, List<SnapOcr>)> LeerSnapshotsAsync(DateTime a, DateTime b, CancellationToken ct)
    {
        await using var app = new SqlConnection(cs.ConnectionString);
        var p = new { a, b };
        var d = (await app.QueryAsync<SnapDisc>(@"SELECT fecha AS Fecha, coest AS Coest, nuvia AS Nuvia, via AS Via, transitos AS Transitos, discrepancias AS Discrepancias
            FROM snap_discrepancia_via_dia WHERE fecha BETWEEN @a AND @b", p)).ToList();
        var o = (await app.QueryAsync<SnapOcr>(@"SELECT fecha AS Fecha, coest AS Coest, nuvia AS Nuvia, via AS Via, evaluables AS Evaluables, reconocidas AS Reconocidas,
            no_legibles AS NoLegibles, error_deteccion AS ErrorDeteccion, sin_placa_ref AS SinPlacaRef
            FROM snap_ocr_via_dia WHERE fecha BETWEEN @a AND @b", p)).ToList();
        return (d, o);
    }

    private static double? PctDisc(IEnumerable<SnapDisc> rows)
    {
        var l = rows.ToList(); var tx = l.Sum(r => r.Transitos);
        return tx > 0 ? Pct(l.Sum(r => r.Discrepancias), tx) : null;
    }
    private static double? PctOcr(IEnumerable<SnapOcr> rows)
    {
        var l = rows.ToList(); var ev = l.Sum(r => r.Evaluables);
        return ev > 0 ? Pct(l.Sum(r => r.Reconocidas), ev) : null;
    }

    private static RdTendencia TendenciaDiscrepancia(List<SnapDisc> rows, DateTime f, bool hay)
    {
        var pts = Enumerable.Range(0, 30).Select(i => f.AddDays(i - 29))
            .Select(d => new RdPunto(d, hay ? PctDisc(rows.Where(r => r.Fecha == d)) : null)).ToList();
        return new RdTendencia(pts, Promedio(pts.Select(p => p.Valor)));
    }
    private static RdTendencia TendenciaOcr(List<SnapOcr> rows, DateTime f, bool hay)
    {
        var pts = Enumerable.Range(0, 30).Select(i => f.AddDays(i - 29))
            .Select(d => new RdPunto(d, hay ? PctOcr(rows.Where(r => r.Fecha == d)) : null)).ToList();
        return new RdTendencia(pts, Promedio(pts.Select(p => p.Valor)));
    }

    // Top 6 por % de discrepancia de la ventana actual; las vías con pocos tránsitos no entran
    // (1 tránsito con error = 100 % sería ruido, no una vía crítica).
    private static List<RdViaCritica> ViasCriticas(List<SnapDisc> rows, DateTime f, int minTx)
    {
        double? PctVia(DateTime d, int coest, int nuvia) =>
            PctDisc(rows.Where(r => r.Fecha == d && r.Coest == coest && r.Nuvia == nuvia));
        return rows.Where(r => r.Fecha == f && r.Transitos >= minTx)
            .Select(r => (r, pct: r.Discrepancias * 100.0 / r.Transitos))
            .OrderByDescending(x => x.pct).Take(6)
            .Select(x => new RdViaCritica(
                x.r.Via, Plaza(x.r.Coest), Math.Round(x.pct, 2),
                DeltaPt(Math.Round(x.pct, 2), PctVia(f.AddDays(-1), x.r.Coest, x.r.Nuvia)), x.r.Transitos,
                Enumerable.Range(0, 7).Select(i => f.AddDays(i - 6)).Select(d => new RdPunto(d, PctVia(d, x.r.Coest, x.r.Nuvia))).ToList()))
            .ToList();
    }

    private static RdOcr OcrSeccion(List<SnapOcr> todas, List<SnapOcr> hoy, DateTime f, bool hay)
    {
        var ev = hoy.Sum(r => r.Evaluables);
        int? E(Func<SnapOcr, int> sel) => hay && ev > 0 ? hoy.Sum(sel) : null;
        RdOcrCategoria Cat(string n, Func<SnapOcr, int> sel) { var c = E(sel); return new(n, Pct(c, ev), c); }
        var cats = new List<RdOcrCategoria>
        {
            Cat("Reconocidas", r => r.Reconocidas), Cat("No legibles", r => r.NoLegibles),
            Cat("Error de detección", r => r.ErrorDeteccion), Cat("Sin placa de referencia", r => r.SinPlacaRef)
        };
        var plazas = hoy.Select(r => r.Coest).Concat(todas.Where(r => r.Fecha == f.AddDays(-1)).Select(r => r.Coest)).Distinct().Order()
            .Select(c =>
            {
                var h = PctOcr(hoy.Where(r => r.Coest == c));
                return new RdOcrPlaza(Plaza(c), h, DeltaPt(h, PctOcr(todas.Where(r => r.Fecha == f.AddDays(-1) && r.Coest == c))));
            })
            .OrderByDescending(p => p.Pct ?? -1).ToList();
        return new RdOcr(cats, hay ? plazas : [], []);
    }

    private sealed class PlacaFila { public string Placa { get; set; } = ""; public int Coest { get; set; } public int Nuvia { get; set; } public string? Via { get; set; } public int Veces { get; set; } public string? Ocr { get; set; } }

    // 3 placas no reconocidas que más se repiten en la ventana. No hay imagen de la placa en el origen
    // de datos (transitos no la guarda) → ImagenUrl = null; el motivo se deriva de lo que leyó el OCR.
    private async Task<List<RdPlacaFrecuente>> PlacasFrecuentesAsync(DateTime desde, DateTime hasta, CancellationToken ct)
    {
        await using var con = new SqlConnection(await consolidado.GetAsync());
        await con.OpenAsync(ct);
        await con.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        var filas = (await con.QueryAsync<PlacaFila>($@"
            SELECT TOP 100 t.tra_paten AS Placa, t.tra_coest AS Coest, t.tra_nuvia AS Nuvia,
                   MAX(vd.via_nombr) AS Via, COUNT(*) AS Veces, MAX(ISNULL(t.tra_patocr,'')) AS Ocr
            FROM transitos t LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            WHERE t.tra_fecha >= @desde AND t.tra_fecha < @hasta {DiscrepanciasService.FiltroTipo}
              AND ISNULL(t.tra_paten,'') <> '' AND ISNULL(t.tra_patocr,'') <> t.tra_paten
            GROUP BY t.tra_paten, t.tra_coest, t.tra_nuvia
            ORDER BY COUNT(*) DESC", new { desde, hasta }, commandTimeout: 120)).ToList();

        return filas.GroupBy(x => x.Placa).Select(g => (placa: g.Key, veces: g.Sum(x => x.Veces), top: g.OrderByDescending(x => x.Veces).First()))
            .Where(x => x.veces >= 2).OrderByDescending(x => x.veces).Take(3)
            .Select(x => new RdPlacaFrecuente(x.placa, x.top.Via ?? $"Via {x.top.Nuvia}", Plaza(x.top.Coest), x.veces,
                string.IsNullOrEmpty(x.top.Ocr) ? "No legible" : $"El OCR leyó {x.top.Ocr}", null))
            .ToList();
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Equipos, servicios, incidentes
    // ═════════════════════════════════════════════════════════════════════
    private sealed class EquipoFila
    {
        public int Id { get; set; } public string Nombre { get; set; } = ""; public string? ViaNum { get; set; }
        public string Plaza { get; set; } = ""; public string? EstadoAhora { get; set; } public DateTime? DesdeAhora { get; set; }
        public string? EstadoAntes { get; set; } public string? TipoInc { get; set; }
    }

    // Estado en un instante = último registro de ping_log anterior a ese instante (ping_log solo graba cambios).
    private async Task<(RdEquiposKpi, List<RdPendiente>)> EquiposAsync(DateTime hasta, CancellationToken ct)
    {
        await using var app = new SqlConnection(cs.ConnectionString);
        var filas = (await app.QueryAsync<EquipoFila>(@"
            SELECT e.id AS Id, e.nombre AS Nombre, v.numero AS ViaNum, es.nombre AS Plaza,
                   a.estado AS EstadoAhora, a.[timestamp] AS DesdeAhora, b.estado AS EstadoAntes, inc.tipo AS TipoInc
            FROM equipos e
            JOIN vias v ON v.id = e.via_id
            JOIN estaciones es ON es.id = v.estacion_id
            OUTER APPLY (SELECT TOP 1 estado, [timestamp] FROM ping_log p WHERE p.equipo_id = e.id AND p.[timestamp] <= @hasta ORDER BY p.[timestamp] DESC) a
            OUTER APPLY (SELECT TOP 1 estado FROM ping_log p WHERE p.equipo_id = e.id AND p.[timestamp] <= @antes ORDER BY p.[timestamp] DESC) b
            OUTER APPLY (SELECT TOP 1 tipo FROM incidentes i WHERE i.equipo_id = e.id AND i.inicio <= @hasta AND (i.fin IS NULL OR i.fin > @hasta) ORDER BY i.inicio DESC) inc
            WHERE e.activo = 1 AND e.monitorear = 1",
            new { hasta, antes = hasta.AddDays(-1) }, commandTimeout: 60)).ToList();

        var conEstado = filas.Where(f => f.EstadoAhora != null).ToList();
        var caidos    = conEstado.Where(f => f.EstadoAhora == "DOWN").ToList();
        var antes     = filas.Where(f => f.EstadoAntes != null).ToList();

        var kpi = conEstado.Count == 0 ? new RdEquiposKpi(null, null, null, null)
            : new RdEquiposKpi(conEstado.Count - caidos.Count, conEstado.Count, caidos.Count,
                antes.Count == 0 ? null : caidos.Count - antes.Count(f => f.EstadoAntes == "DOWN"));

        var pend = caidos.Select(f => new RdPendiente("Equipo", f.Nombre, f.Plaza, f.ViaNum, f.DesdeAhora,
                f.DesdeAhora is null ? null : (int)(hasta - f.DesdeAhora.Value).TotalMinutes, false,
                f.TipoInc is "Mantenimiento" or "ReinicioForzado" ? "en mantenimiento" : null)).ToList();
        return (kpi, pend);
    }

    private sealed class CheckFila { public string Servicio { get; set; } = ""; public string Chk { get; set; } = ""; public string? Ubicacion { get; set; } public string? Estado { get; set; } public DateTime? Desde { get; set; } }

    // Servicios (servidores/páginas): DOWN actual, o sin dato si el chequeo nunca ha corrido.
    private async Task<List<RdPendiente>> ServiciosPendientesAsync(CancellationToken ct)
    {
        await using var app = new SqlConnection(cs.ConnectionString);
        var filas = (await app.QueryAsync<CheckFila>(@"
            SELECT s.nombre AS Servicio, sc.nombre AS Chk, sc.ubicacion AS Ubicacion, sc.ultimo_estado AS Estado,
                   (SELECT TOP 1 si.inicio FROM servicio_incidentes si WHERE si.servicio_check_id = sc.id AND si.fin IS NULL ORDER BY si.inicio DESC) AS Desde
            FROM servicio_checks sc JOIN servicios s ON s.id = sc.servicio_id
            WHERE sc.activo = 1 AND sc.monitorear = 1 AND s.activo = 1")).ToList();

        var ahora = AhoraLima();
        var porServicio = filas.GroupBy(f => f.Servicio).ToDictionary(g => g.Key, g => g.Count());
        return filas.Where(f => f.Estado is null || f.Estado == "DOWN").Select(f =>
        {
            var nombre = porServicio[f.Servicio] > 1 ? $"{f.Servicio} · {f.Chk}" : f.Servicio;
            return new RdPendiente("Servicio", nombre, string.IsNullOrWhiteSpace(f.Ubicacion) ? "—" : f.Ubicacion, null,
                f.Desde, f.Desde is null ? null : (int)(ahora - f.Desde.Value).TotalMinutes, f.Estado is null, null);
        }).ToList();
    }

    private async Task<RdIncidentesKpi> IncidentesKpiAsync(DateTime hasta, CancellationToken ct)
    {
        await using var app = new SqlConnection(cs.ConnectionString);
        const string sql = @"
            SELECT COUNT(*) AS Total, ISNULL(SUM(CASE WHEN fin IS NULL THEN 1 ELSE 0 END), 0) AS Activos,
                   AVG(CASE WHEN fin IS NOT NULL THEN DATEDIFF(SECOND, inicio, fin) / 60.0 END) AS Mttr
            FROM incidentes WHERE tipo = 'Real' AND inicio >= @a AND inicio < @b";
        var act = await app.QueryFirstAsync(sql, new { a = hasta.AddDays(-7), b = hasta });
        var prev = await app.QueryFirstAsync(sql, new { a = hasta.AddDays(-8), b = hasta.AddDays(-1) });
        double? mttr = act.Mttr is null ? null : Math.Round((double)act.Mttr, 0);
        return new RdIncidentesKpi((int)act.Total, (int)act.Activos, mttr, (int)act.Total - (int)prev.Total);
    }

    private async Task<List<RdEvento>> EventosAsync(DateTime desde, DateTime hasta, Config cfg, CancellationToken ct)
    {
        await using var app = new SqlConnection(cs.ConnectionString);
        var filas = (await app.QueryAsync<(int EquipoId, string Nombre, string? ViaNum, string Plaza, DateTime Inicio, DateTime? Fin, string Tipo)>(@"
            SELECT i.equipo_id, e.nombre, v.numero, es.nombre, i.inicio, i.fin, i.tipo
            FROM incidentes i JOIN equipos e ON e.id = i.equipo_id JOIN vias v ON v.id = e.via_id JOIN estaciones es ON es.id = v.estacion_id
            WHERE i.inicio >= @desde AND i.inicio < @hasta", new { desde, hasta })).ToList();
        return AgruparEventos(filas.Select(f => new CaidaEquipo(f.EquipoId, f.Nombre, f.Plaza, f.ViaNum, f.Inicio, f.Fin, f.Tipo)),
            cfg.EventoEquipos, cfg.EventoVentanaMin);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Disponibilidad 30 d y latencia
    // ═════════════════════════════════════════════════════════════════════
    private async Task<(RdDisponibilidadKpi, List<RdPlazaDisp>)> DisponibilidadAsync(DateTime hasta, Config cfg, CancellationToken ct)
    {
        var hoy  = await reporteService.ComputeSlaAsync(hasta.AddDays(-30), hasta, false, null, cfg.IncluirMantenimiento, ct);
        var ayer = await reporteService.ComputeSlaAsync(hasta.AddDays(-31), hasta.AddDays(-1), false, null, cfg.IncluirMantenimiento, ct);

        static double? Agg(IEnumerable<SlaEquipoDto> l) { var a = l.ToList(); return Disponibilidad(a.Sum(e => (long)e.TotalMin), a.Sum(e => (long)e.DownMin)); }
        var pct = Agg(hoy);
        var plazas = hoy.GroupBy(e => e.Estacion).Select(g => (Plaza: g.Key, Pct: Agg(g))).OrderBy(x => x.Pct ?? 101).ToList();
        var menor = plazas.FirstOrDefault(p => p.Pct != null).Plaza;
        return (new RdDisponibilidadKpi(pct, DeltaPt(pct, Agg(ayer))),
            plazas.OrderBy(p => p.Plaza).Select(p => new RdPlazaDisp(p.Plaza, p.Pct, p.Plaza == menor && p.Pct != null)).ToList());
    }

    // Promedio de la ventana desde snap_latencia_sitio. Si la plaza aún no tiene muestras en la ventana
    // (el muestreo es nuevo), se usa la latencia ACTUAL de sus equipos UP — igual que el panel — marcada EsActual.
    private async Task<List<RdLatencia>> LatenciaAsync(DateTime desde, DateTime hasta, double umbral, CancellationToken ct)
    {
        await using var app = new SqlConnection(cs.ConnectionString);
        var filas = (await app.QueryAsync<(string Sitio, double? Ms, double? Actual)>(@"
            SELECT es.nombre,
                   (SELECT AVG(l.ms_prom) FROM snap_latencia_sitio l WHERE l.estacion_id = es.id AND l.ts >= @desde AND l.ts < @hasta),
                   (SELECT AVG(e.ultima_latencia_ms) FROM equipos e JOIN vias v ON v.id = e.via_id
                    OUTER APPLY (SELECT TOP 1 estado FROM ping_log p WHERE p.equipo_id = e.id ORDER BY p.[timestamp] DESC) u
                    WHERE v.estacion_id = es.id AND e.activo = 1 AND e.monitorear = 1 AND e.ultima_latencia_ms IS NOT NULL
                      AND e.ultimo_ping_en >= DATEADD(MINUTE, -5, GETDATE()) AND u.estado = 'UP')
            FROM estaciones es WHERE es.activo = 1", new { desde, hasta })).ToList();
        return filas.Select(f =>
            {
                var ms = f.Ms ?? f.Actual;
                return new RdLatencia(f.Sitio, ms is null ? null : Math.Round(ms.Value, 1), ms > umbral, f.Ms is null && f.Actual is not null);
            })
            .OrderBy(x => x.Ms ?? double.MaxValue).ToList();
    }

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs.ConnectionString).Options);
}
