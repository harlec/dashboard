using AunorApi.DTOs;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AunorApi.Services;

public class OcrPlacasService(IConfiguration config)
{
    private readonly string _connStr =
        Environment.GetEnvironmentVariable("CONSOLIDADO_CONN")
        ?? config["ConsolidadoDb:ConnectionString"]
        ?? throw new InvalidOperationException("CONSOLIDADO_CONN no configurado");

    private static readonly HashSet<string> PeriodosValidos =
        ["1h", "4h", "12h", "24h", "ayer", "mes"];

    public static bool EsPeriodoValido(string p) => PeriodosValidos.Contains(p);

    private static string PeriodWhere(string periodo) => periodo switch {
        "1h"   => "tra_fecha >= DATEADD(HOUR,  -1, GETDATE())",
        "4h"   => "tra_fecha >= DATEADD(HOUR,  -4, GETDATE())",
        "12h"  => "tra_fecha >= DATEADD(HOUR, -12, GETDATE())",
        "24h"  => "tra_fecha >= DATEADD(HOUR, -24, GETDATE())",
        "ayer" => @"tra_fecha >= CAST(DATEADD(DAY,-1,CAST(GETDATE() AS DATE)) AS DATETIME)
                AND tra_fecha <  CAST(CAST(GETDATE() AS DATE) AS DATETIME)",
        "mes"  => "tra_fecha >= CAST(DATEFROMPARTS(YEAR(GETDATE()),MONTH(GETDATE()),1) AS DATETIME)",
        _      => "tra_fecha >= DATEADD(HOUR, -24, GETDATE())"
    };

    // Filtro base de tránsito (mismo criterio que discrepancias de consultoría)
    private const string FiltroBase = @"
        AND tra_tipop IN ('E','S','O','M','T')
        AND tra_titra = 'TR'
        AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)";

    // Clasificación del tipo de error OCR
    private const string TipoErrorExpr = @"
        CASE
            WHEN tra_patocr IS NULL OR tra_patocr = '' THEN 'NO DETECTADA'
            WHEN LEN(tra_paten) = LEN(tra_patocr)      THEN 'SUSTITUCIÓN'
            WHEN LEN(tra_patocr) > LEN(tra_paten)      THEN 'CARÁCTER EXTRA'
            ELSE 'CARÁCTER PERDIDO'
        END";

    private const string EstacionCase = @"CASE tra_coest
        WHEN 1 THEN 'FORTALEZA' WHEN 2 THEN 'HUARMEY'
        WHEN 3 THEN '402'       WHEN 4 THEN 'VIRU' WHEN 5 THEN 'SANTA'
        ELSE 'DESCONOCIDA' END";

    // ── Resumen + por estación + tipos de error ───────────────────────────
    public async Task<OcrResumenDto> GetResumenAsync(string periodo)
    {
        await using var conn = new SqlConnection(_connStr);
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        string pw = PeriodWhere(periodo);

        // Totales en una sola pasada
        var totales = await conn.QueryFirstAsync($@"
            SELECT
                COUNT(*) AS TotalConPlaca,
                SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END) AS Aciertos,
                SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = '' THEN 1 ELSE 0 END) AS SinDetectar,
                SUM(CASE WHEN tra_patocr IS NOT NULL AND tra_patocr <> ''
                          AND tra_paten <> tra_patocr THEN 1 ELSE 0 END) AS Errores
            FROM transitos t
            WHERE {pw}
              {FiltroBase}
              AND tra_paten IS NOT NULL AND tra_paten <> ''");

        int total       = (int)totales.TotalConPlaca;
        int aciertos    = (int)totales.Aciertos;
        int sinDetectar = (int)totales.SinDetectar;
        int errores     = (int)totales.Errores;

        double efectividad    = total > 0 ? Math.Round(aciertos    * 100.0 / total, 1) : 0;
        double tasaSinDetect  = total > 0 ? Math.Round(sinDetectar * 100.0 / total, 1) : 0;
        double tasaError      = total > 0 ? Math.Round(errores     * 100.0 / total, 1) : 0;

        // Por estación
        var porEstacion = (await conn.QueryAsync<OcrEstacionDto>($@"
            SELECT
                {EstacionCase} AS Estacion,
                COUNT(*) AS Total,
                SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END) AS Aciertos,
                SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = '' THEN 1 ELSE 0 END) AS SinDetectar,
                SUM(CASE WHEN tra_patocr IS NOT NULL AND tra_patocr <> ''
                          AND tra_paten <> tra_patocr THEN 1 ELSE 0 END) AS Errores,
                ROUND(100.0 * SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0), 1) AS Efectividad
            FROM transitos t
            WHERE {pw}
              {FiltroBase}
              AND tra_paten IS NOT NULL AND tra_paten <> ''
            GROUP BY tra_coest
            ORDER BY Efectividad ASC")).ToList();

        // Tipos de error (solo entre los que fallaron)
        var porTipoError = (await conn.QueryAsync<OcrTipoErrorDto>($@"
            SELECT {TipoErrorExpr} AS TipoError, COUNT(*) AS Total
            FROM transitos t
            WHERE {pw}
              {FiltroBase}
              AND tra_paten IS NOT NULL AND tra_paten <> ''
              AND (tra_patocr IS NULL OR tra_patocr = '' OR tra_paten <> tra_patocr)
            GROUP BY {TipoErrorExpr}
            ORDER BY Total DESC")).ToList();

        // Ranking de vías por errores OCR (no detectadas + confusiones)
        var porVia = (await conn.QueryAsync<OcrViaDto>($@"
            SELECT TOP 20
                {EstacionCase} AS Estacion,
                ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR)) AS Via,
                COUNT(*) AS Total,
                SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END) AS Aciertos,
                SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = '' THEN 1 ELSE 0 END) AS NoReconocidas,
                SUM(CASE WHEN tra_patocr IS NOT NULL AND tra_patocr <> ''
                          AND tra_paten <> tra_patocr THEN 1 ELSE 0 END) AS Confusiones,
                ROUND(100.0 * SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0), 1) AS Efectividad
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest = vd.via_coest AND t.tra_nuvia = vd.via_nuvia
            WHERE {pw}
              {FiltroBase}
              AND tra_paten IS NOT NULL AND tra_paten <> ''
            GROUP BY t.tra_coest, t.tra_nuvia, vd.via_nombr
            ORDER BY (
                1.0 * (
                    SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = '' THEN 1 ELSE 0 END) +
                    SUM(CASE WHEN tra_patocr IS NOT NULL AND tra_patocr <> ''
                              AND tra_paten <> tra_patocr THEN 1 ELSE 0 END)
                ) / NULLIF(COUNT(*), 0)
            ) DESC")).ToList();

        return new OcrResumenDto(
            total, aciertos, sinDetectar, errores,
            efectividad, tasaSinDetect, tasaError,
            porEstacion, porTipoError, porVia);
    }

    // ── Análisis de confusión de caracteres + por hora + pares ──────────
    public async Task<OcrAnalisisDto> GetAnalisisAsync()
    {
        await using var conn = new SqlConnection(_connStr);
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");

        // 1. Matriz de confusión carácter a carácter (últimos 30 días)
        //    Solo cuando misma longitud: eso indica sustitución pura de un carácter
        var topConfusiones = (await conn.QueryAsync<OcrConfusionCaracterDto>(@"
            SELECT TOP 40
                p.pos                               AS Posicion,
                SUBSTRING(t.tra_paten,  p.pos, 1)  AS Esperado,
                SUBSTRING(t.tra_patocr, p.pos, 1)  AS OcrLeyo,
                COUNT(*)                            AS Casos
            FROM transitos t
            CROSS APPLY (
                SELECT pos
                FROM (VALUES(1),(2),(3),(4),(5),(6),(7),(8)) v(pos)
                WHERE pos <= LEN(t.tra_paten)
            ) p
            WHERE tra_fecha >= DATEADD(DAY, -30, GETDATE())
              AND tra_tipop IN ('E','S','O','M','T')
              AND tra_titra = 'TR'
              AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)
              AND tra_paten  IS NOT NULL AND LEN(tra_paten)  > 0
              AND tra_patocr IS NOT NULL AND LEN(tra_patocr) > 0
              AND tra_paten <> tra_patocr
              AND LEN(tra_paten) = LEN(tra_patocr)
              AND SUBSTRING(t.tra_paten, p.pos, 1) <> SUBSTRING(t.tra_patocr, p.pos, 1)
            GROUP BY p.pos,
                     SUBSTRING(t.tra_paten,  p.pos, 1),
                     SUBSTRING(t.tra_patocr, p.pos, 1)
            ORDER BY Casos DESC",
            commandTimeout: 90)).ToList();

        // 2. Efectividad por hora del día (últimos 7 días)
        var porHora = (await conn.QueryAsync<OcrPorHoraDto>(@"
            SELECT
                DATEPART(HOUR, tra_fecha) AS Hora,
                COUNT(*) AS Total,
                SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END) AS Aciertos,
                SUM(CASE WHEN tra_patocr IS NOT NULL AND tra_patocr <> ''
                          AND tra_paten <> tra_patocr THEN 1 ELSE 0 END) AS Errores,
                ROUND(100.0 * SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0), 1) AS Efectividad
            FROM transitos t
            WHERE tra_fecha >= DATEADD(DAY, -7, GETDATE())
              AND tra_tipop IN ('E','S','O','M','T')
              AND tra_titra = 'TR'
              AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)
              AND tra_paten IS NOT NULL AND tra_paten <> ''
            GROUP BY DATEPART(HOUR, tra_fecha)
            ORDER BY Hora",
            commandTimeout: 90)).ToList();

        // 3. Top pares (cajero→OCR) más repetidos en errores (últimos 30 días)
        var topPares = (await conn.QueryAsync<OcrParDto>($@"
            SELECT TOP 25
                tra_paten  AS PlacaCajero,
                tra_patocr AS PlacaOcr,
                {TipoErrorExpr} AS TipoError,
                COUNT(*) AS Casos
            FROM transitos t
            WHERE tra_fecha >= DATEADD(DAY, -30, GETDATE())
              AND tra_tipop IN ('E','S','O','M','T')
              AND tra_titra = 'TR'
              AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)
              AND tra_paten  IS NOT NULL AND tra_paten  <> ''
              AND tra_patocr IS NOT NULL AND tra_patocr <> ''
              AND tra_paten <> tra_patocr
            GROUP BY tra_paten, tra_patocr, {TipoErrorExpr}
            ORDER BY Casos DESC",
            commandTimeout: 90)).ToList();

        return new OcrAnalisisDto(topConfusiones, porHora, topPares);
    }

    // ── Detalle paginado ─────────────────────────────────────────────────
    public async Task<OcrDetalleDto> GetDetalleAsync(
        string periodo, string? estacion, string? placa, string? tipoError,
        int pagina, int porPagina)
    {
        await using var conn = new SqlConnection(_connStr);
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        string pw = PeriodWhere(periodo);

        int? coest = estacion switch {
            "FORTALEZA" => 1, "HUARMEY" => 2, "402" => 3, "VIRU" => 4, "SANTA" => 5, _ => null
        };
        string? placaFiltro = string.IsNullOrWhiteSpace(placa) ? null : placa.Trim().ToUpper();

        // Filtro extra por tipo de error
        string tipoFiltro = tipoError switch {
            "NO DETECTADA"     => "AND (tra_patocr IS NULL OR tra_patocr = '')",
            "SUSTITUCIÓN"      => "AND tra_patocr IS NOT NULL AND tra_patocr <> '' AND tra_paten <> tra_patocr AND LEN(tra_paten) = LEN(tra_patocr)",
            "CARÁCTER EXTRA"   => "AND tra_patocr IS NOT NULL AND LEN(tra_patocr) > LEN(tra_paten)",
            "CARÁCTER PERDIDO" => "AND tra_patocr IS NOT NULL AND LEN(tra_patocr) < LEN(tra_paten)",
            _                  => "AND (tra_patocr IS NULL OR tra_patocr = '' OR tra_paten <> tra_patocr)"
        };

        string baseFrom = $@"
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            WHERE {pw}
              {FiltroBase}
              AND tra_paten IS NOT NULL AND tra_paten <> ''
              {tipoFiltro}
              AND (@coest IS NULL OR tra_coest = @coest)
              AND (@placa IS NULL OR tra_paten LIKE '%'+@placa+'%' OR tra_patocr LIKE '%'+@placa+'%')";

        var param = new { coest, placa = placaFiltro };
        int totalCount = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) {baseFrom}", param);

        int offset = (pagina - 1) * porPagina;
        var items = (await conn.QueryAsync<OcrItemDto>($@"
            SELECT
                CONVERT(varchar(16), tra_fecha, 120)                          AS Fecha,
                {EstacionCase}                                                AS Estacion,
                ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR))   AS Via,
                ISNULL(CAST(tra_ticke AS VARCHAR(20)), '')                    AS Ticket,
                ISNULL(tra_paten,  '')                                        AS PlacaCajero,
                ISNULL(tra_patocr, '')                                        AS PlacaOcr,
                {TipoErrorExpr}                                               AS TipoError
            {baseFrom}
            ORDER BY tra_fecha DESC
            OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY",
            new { coest, placa = placaFiltro, offset, porPagina })).ToList();

        return new OcrDetalleDto(totalCount, pagina, porPagina, items);
    }

    // ── Tendencias: heatmap vía×hora + tendencia diaria + mejores vías ──
    public async Task<OcrTendenciasDto> GetTendenciasAsync()
    {
        await using var conn = new SqlConnection(_connStr);
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        const int timeout = 120;

        const string filtro30d = @"
            tra_fecha >= DATEADD(DAY, -30, GETDATE())
            AND tra_tipop IN ('E','S','O','M','T')
            AND tra_titra = 'TR'
            AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)
            AND tra_paten IS NOT NULL AND tra_paten <> ''";

        const string errSum = @"
            SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = ''
                          OR tra_paten <> tra_patocr THEN 1 ELSE 0 END)";

        // 1. Heatmap: vía × hora (30 días, mín. 5 transacciones por celda)
        var heatRaw = (await conn.QueryAsync<(string Estacion, string Via, int Hora, int Total, int Errores)>($@"
            SELECT {EstacionCase}                                                     AS Estacion,
                   ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR))       AS Via,
                   DATEPART(HOUR, tra_fecha)                                          AS Hora,
                   COUNT(*)                                                           AS Total,
                   {errSum}                                                           AS Errores
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            WHERE {filtro30d}
            GROUP BY t.tra_coest, t.tra_nuvia, vd.via_nombr, DATEPART(HOUR, tra_fecha)
            HAVING COUNT(*) >= 5
            ORDER BY Estacion, Via, Hora",
            commandTimeout: timeout)).ToList();

        // 2. Tendencia: vía × día (30 días)
        var diaRaw = (await conn.QueryAsync<(string Fecha, string Estacion, string Via, int Total, int Errores)>($@"
            SELECT CONVERT(varchar(10), CAST(tra_fecha AS DATE), 23)                 AS Fecha,
                   {EstacionCase}                                                     AS Estacion,
                   ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR))       AS Via,
                   COUNT(*)                                                           AS Total,
                   {errSum}                                                           AS Errores
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            WHERE {filtro30d}
            GROUP BY CAST(tra_fecha AS DATE), t.tra_coest, t.tra_nuvia, vd.via_nombr
            ORDER BY Fecha, Estacion, Via",
            commandTimeout: timeout)).ToList();

        // ── Agregar heatmap por vía ──────────────────────────────────────
        var viaAgg = heatRaw
            .GroupBy(r => (r.Estacion, r.Via))
            .Select(g => {
                int tot = g.Sum(r => r.Total);
                int err = g.Sum(r => r.Errores);
                var horas = g.OrderBy(r => r.Hora)
                             .Select(r => new OcrCeldaDto(r.Hora, r.Total,
                                 r.Total > 0 ? Math.Round((decimal)r.Errores * 100 / r.Total, 1) : 0m))
                             .ToList();
                return (
                    Estacion: g.Key.Estacion,
                    Via: g.Key.Via,
                    Total: tot,
                    TasaVia: tot > 0 ? Math.Round((decimal)err * 100 / tot, 1) : 0m,
                    Horas: horas
                );
            })
            .ToList();

        // Heatmap: vías con ≥50 transacciones, ordenadas peor→mejor (para ver problemas arriba)
        var heatmap = viaAgg
            .Where(v => v.Total >= 50)
            .OrderByDescending(v => v.TasaVia)
            .Select(v => new OcrHeatmapRowDto(v.Estacion, v.Via, v.Total, v.TasaVia, v.Horas))
            .ToList();

        // Mejores vías de referencia: top 5 con ≥100 transacciones y menor tasa de error
        var mejoresVias = viaAgg
            .Where(v => v.Total >= 100)
            .OrderBy(v => v.TasaVia)
            .Take(5)
            .Select(v => new OcrMejorViaDto(v.Estacion, v.Via, v.Total, v.TasaVia, v.Horas))
            .ToList();

        var mejoresKey = new HashSet<string>(mejoresVias.Select(m => $"{m.Estacion}|{m.Via}"));

        // Tendencia diaria: red completa + promedio ponderado de mejores vías
        var tendenciaDiaria = diaRaw
            .GroupBy(r => r.Fecha)
            .OrderBy(g => g.Key)
            .Select(g => {
                int tot = g.Sum(r => r.Total);
                int err = g.Sum(r => r.Errores);
                decimal tasaRed = tot > 0 ? Math.Round((decimal)err * 100 / tot, 1) : 0m;

                var mej   = g.Where(r => mejoresKey.Contains($"{r.Estacion}|{r.Via}")).ToList();
                int totM  = mej.Sum(r => r.Total);
                int errM  = mej.Sum(r => r.Errores);
                decimal tasaMej = totM > 0 ? Math.Round((decimal)errM * 100 / totM, 1) : 0m;

                return new OcrDiaTendenciaDto(g.Key, tot, tasaRed, tasaMej);
            })
            .ToList();

        return new OcrTendenciasDto(heatmap, tendenciaDiaria, mejoresVias);
    }
}
