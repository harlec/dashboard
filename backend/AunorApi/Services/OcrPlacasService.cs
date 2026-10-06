using AunorApi.DTOs;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AunorApi.Services;

public class OcrPlacasService(ConsolidadoConnectionProvider consolidado)
{

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

    // tra_subfp = 1 identifica tránsitos prepago
    private static string FiltroPrepago(bool soloPrepago) => soloPrepago ? "AND tra_subfp = 1" : "";

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

    // Límite inferior del intervalo de Wilson (95%) para una proporción — la forma
    // estándar de comparar tasas de acierto entre muestras de tamaño muy distinto.
    // Una vía con 2 tránsitos y 0 errores (100%) obtiene un score bajo por la
    // incertidumbre; una vía con 1000 tránsitos y 5 discrepancias (99.5%) obtiene
    // un score alto porque el volumen respalda esa tasa. Así el ranking de
    // "mejores vías" no lo gana la vía con menos datos, lo gana la más confiable.
    private static double WilsonScore(int aciertos, int total)
    {
        if (total <= 0) return 0;
        const double z = 1.959963985; // 95% de confianza
        double n = total;
        double phat = aciertos / n;
        double z2 = z * z;
        double denom = 1 + z2 / n;
        double centro = phat + z2 / (2 * n);
        double ajuste = z * Math.Sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
        return Math.Max(0, (centro - ajuste) / denom) * 100;
    }

    private sealed record TransitosDiaFila(DateTime Dia, int Total, int Efectivo, int Tag, int PorPlaca, int Tarjeta, int Exento,
        int ConPlaca, int Aciertos, int NoLegibles, int Errores);

    // El panel consulta cada ~2 min desde varias pantallas: un escaneo del mes completo por cada
    // visita castiga a la BD de producción, así que se reutiliza el último resultado 90 s.
    private static TransitosMesDto? _transitosMesCache;
    private static DateTime _transitosMesCacheAt;
    private static readonly SemaphoreSlim _transitosMesLock = new(1, 1);

    // ── Tránsitos del mes en curso: total, promedio diario, forma de cobro y serie por día ──
    public async Task<TransitosMesDto> GetTransitosMesAsync()
    {
        await _transitosMesLock.WaitAsync();
        try
        {
            if (_transitosMesCache != null && DateTime.Now - _transitosMesCacheAt < TimeSpan.FromSeconds(90)
                && _transitosMesCache.Mes == DateTime.Now.ToString("yyyy-MM"))
                return _transitosMesCache;
            _transitosMesCache = await CalcularTransitosMesAsync();
            _transitosMesCacheAt = DateTime.Now;
            return _transitosMesCache;
        }
        finally { _transitosMesLock.Release(); }
    }

    private async Task<TransitosMesDto> CalcularTransitosMesAsync()
    {
        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        string pw = PeriodWhere("mes");
        // El total del mes incluye exentos (X), que FiltroBase deja fuera por no ser evaluables en OCR/DAC.
        string baseConExentos = FiltroBase.Replace("'T')", "'T','X')");

        var porDiaFilas = (await conn.QueryAsync<TransitosDiaFila>($@"
            SELECT CAST(tra_fecha AS DATE) AS Dia,
                   COUNT(*) AS Total,
                   SUM(CASE WHEN tra_tipop = 'E' THEN 1 ELSE 0 END) AS Efectivo,
                   SUM(CASE WHEN tra_tipop = 'T' THEN 1 ELSE 0 END) AS Tag,
                   SUM(CASE WHEN tra_tipop = 'O' THEN 1 ELSE 0 END) AS PorPlaca,
                   SUM(CASE WHEN tra_tipop = 'S' THEN 1 ELSE 0 END) AS Tarjeta,
                   SUM(CASE WHEN tra_tipop = 'X' THEN 1 ELSE 0 END) AS Exento,
                   -- Lectura OCR: solo tránsitos con placa de referencia (mismo criterio que GetResumenAsync)
                   SUM(CASE WHEN tra_tipop <> 'X' AND tra_paten IS NOT NULL AND tra_paten <> '' THEN 1 ELSE 0 END) AS ConPlaca,
                   SUM(CASE WHEN tra_tipop <> 'X' AND tra_paten IS NOT NULL AND tra_paten <> '' AND tra_paten = tra_patocr THEN 1 ELSE 0 END) AS Aciertos,
                   SUM(CASE WHEN tra_tipop <> 'X' AND tra_paten IS NOT NULL AND tra_paten <> '' AND (tra_patocr IS NULL OR tra_patocr = '') THEN 1 ELSE 0 END) AS NoLegibles,
                   SUM(CASE WHEN tra_tipop <> 'X' AND tra_paten IS NOT NULL AND tra_paten <> '' AND tra_patocr IS NOT NULL AND tra_patocr <> '' AND tra_paten <> tra_patocr THEN 1 ELSE 0 END) AS Errores
            FROM transitos t
            WHERE {pw}
              {baseConExentos}
            GROUP BY CAST(tra_fecha AS DATE)
            ORDER BY Dia", commandTimeout: 120)).ToList();

        var hoy = DateTime.Now;
        int diasMes = DateTime.DaysInMonth(hoy.Year, hoy.Month);
        int total    = porDiaFilas.Sum(r => r.Total);
        int efectivo = porDiaFilas.Sum(r => r.Efectivo);
        int tag      = porDiaFilas.Sum(r => r.Tag);
        int porPlaca = porDiaFilas.Sum(r => r.PorPlaca);
        int tarjeta  = porDiaFilas.Sum(r => r.Tarjeta);
        int exento   = porDiaFilas.Sum(r => r.Exento);

        // El promedio usa días CALENDARIO transcurridos (incluye el día en curso, aún parcial),
        // así que el día de hoy lo subestima un poco hasta que cierre la jornada.
        int dias = hoy.Day;
        double promedio = dias > 0 ? Math.Round((double)total / dias, 0) : 0;

        return new TransitosMesDto(
            hoy.ToString("yyyy-MM"), dias, diasMes, total, promedio, (int)Math.Round(promedio * diasMes),
            efectivo, tag, porPlaca, tarjeta, exento, total - efectivo - tag - porPlaca - tarjeta - exento,
            porDiaFilas.Sum(r => r.ConPlaca), porDiaFilas.Sum(r => r.Aciertos),
            porDiaFilas.Sum(r => r.Errores), porDiaFilas.Sum(r => r.NoLegibles),
            porDiaFilas.Select(r => new TransitosDiaDto(r.Dia.ToString("yyyy-MM-dd"), r.Total, r.ConPlaca, r.Aciertos)).ToList());
    }

    // ── Resumen + por estación + tipos de error ───────────────────────────
    public async Task<OcrResumenDto> GetResumenAsync(string periodo, bool soloPrepago = false)
    {
        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        string pw = PeriodWhere(periodo);
        string fp = FiltroPrepago(soloPrepago);

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
              {fp}
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
              {fp}
              AND tra_paten IS NOT NULL AND tra_paten <> ''
            GROUP BY tra_coest
            ORDER BY Efectividad ASC")).ToList();

        // Tipos de error (solo entre los que fallaron)
        var porTipoError = (await conn.QueryAsync<OcrTipoErrorDto>($@"
            SELECT {TipoErrorExpr} AS TipoError, COUNT(*) AS Total
            FROM transitos t
            WHERE {pw}
              {FiltroBase}
              {fp}
              AND tra_paten IS NOT NULL AND tra_paten <> ''
              AND (tra_patocr IS NULL OR tra_patocr = '' OR tra_paten <> tra_patocr)
            GROUP BY {TipoErrorExpr}
            ORDER BY Total DESC")).ToList();

        // Ranking de vías por errores OCR (no detectadas + confusiones). Se ordena
        // por score de Wilson sobre la tasa de ERROR (no por la tasa cruda): así una
        // vía con 1-2 tránsitos y 100% de error no desplaza a una vía con miles de
        // tránsitos y una tasa de error alta pero consistente, que es la que
        // realmente conviene atender primero — mismo criterio que "mejores vías".
        var porViaCruda = (await conn.QueryAsync<OcrViaCrudaDto>($@"
            SELECT
                {EstacionCase} AS Estacion,
                ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR)) AS Via,
                COUNT(*) AS Total,
                SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END) AS Aciertos,
                SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = '' THEN 1 ELSE 0 END) AS NoReconocidas,
                SUM(CASE WHEN tra_patocr IS NOT NULL AND tra_patocr <> ''
                          AND tra_paten <> tra_patocr THEN 1 ELSE 0 END) AS Confusiones
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest = vd.via_coest AND t.tra_nuvia = vd.via_nuvia
            WHERE {pw}
              {FiltroBase}
              {fp}
              AND tra_paten IS NOT NULL AND tra_paten <> ''
            GROUP BY t.tra_coest, t.tra_nuvia, vd.via_nombr")).ToList();

        var porVia = porViaCruda
            .Select(v => {
                int errores = v.NoReconocidas + v.Confusiones;
                decimal efectividad = v.Total > 0 ? Math.Round((decimal)v.Aciertos * 100 / v.Total, 1) : 0m;
                decimal score = Math.Round((decimal)WilsonScore(errores, v.Total), 1);
                return new OcrViaDto(v.Estacion, v.Via, v.Total, v.Aciertos, v.NoReconocidas, v.Confusiones, efectividad, score);
            })
            .OrderByDescending(v => v.Score)
            .Take(20)
            .ToList();

        return new OcrResumenDto(
            total, aciertos, sinDetectar, errores,
            efectividad, tasaSinDetect, tasaError,
            porEstacion, porTipoError, porVia);
    }

    // ── Mejores vías de referencia, respetando el período elegido ─────────
    // A diferencia de GetTendenciasAsync (ventana fija de 30 días), esta usa el
    // mismo período que el resto de la pantalla (1h/4h/12h/24h/ayer/mes) y
    // ordena por score de Wilson, no por tasa de error cruda — así una vía con
    // pocos tránsitos y 0 errores no le gana a una con muchos tránsitos y pocas
    // discrepancias, que es en realidad la referencia más confiable.
    public async Task<List<OcrMejorViaPeriodoDto>> GetMejoresViasAsync(string periodo, bool soloPrepago = false)
    {
        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        string pw = PeriodWhere(periodo);
        string fp = FiltroPrepago(soloPrepago);

        var vias = (await conn.QueryAsync<OcrViaCrudaDto>($@"
            SELECT
                {EstacionCase} AS Estacion,
                ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR)) AS Via,
                COUNT(*) AS Total,
                SUM(CASE WHEN tra_paten = tra_patocr THEN 1 ELSE 0 END) AS Aciertos,
                SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = '' THEN 1 ELSE 0 END) AS NoReconocidas,
                SUM(CASE WHEN tra_patocr IS NOT NULL AND tra_patocr <> ''
                          AND tra_paten <> tra_patocr THEN 1 ELSE 0 END) AS Confusiones
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest = vd.via_coest AND t.tra_nuvia = vd.via_nuvia
            WHERE {pw}
              {FiltroBase}
              {fp}
              AND tra_paten IS NOT NULL AND tra_paten <> ''
            GROUP BY t.tra_coest, t.tra_nuvia, vd.via_nombr",
            commandTimeout: 60)).ToList();

        return vias
            .Where(v => v.Total >= 5)
            .Select(v => new OcrMejorViaPeriodoDto(
                v.Estacion, v.Via, v.Total, v.Aciertos,
                v.Total > 0 ? Math.Round((decimal)(v.NoReconocidas + v.Confusiones) * 100 / v.Total, 1) : 0m,
                Math.Round((decimal)WilsonScore(v.Aciertos, v.Total), 1)))
            .OrderByDescending(v => v.Score)
            .Take(20)
            .ToList();
    }

    // ── Análisis de confusión de caracteres + por hora + pares ──────────
    public async Task<OcrAnalisisDto> GetAnalisisAsync(bool soloPrepago = false)
    {
        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        string fp = FiltroPrepago(soloPrepago);

        // 1. Matriz de confusión carácter a carácter (últimos 30 días)
        //    Solo cuando misma longitud: eso indica sustitución pura de un carácter
        var topConfusiones = (await conn.QueryAsync<OcrConfusionCaracterDto>($@"
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
              {fp}
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
        var porHora = (await conn.QueryAsync<OcrPorHoraDto>($@"
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
              {fp}
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
              {fp}
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
        int pagina, int porPagina, bool soloPrepago = false)
    {
        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        string pw = PeriodWhere(periodo);
        string fp = FiltroPrepago(soloPrepago);

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
              {fp}
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
    public async Task<OcrTendenciasDto> GetTendenciasAsync(bool soloPrepago = false)
    {
        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");
        const int timeout = 120;

        string filtro30d = $@"
            tra_fecha >= DATEADD(DAY, -30, GETDATE())
            AND tra_tipop IN ('E','S','O','M','T')
            AND tra_titra = 'TR'
            AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)
            {FiltroPrepago(soloPrepago)}
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
                    Score: Math.Round((decimal)WilsonScore(tot - err, tot), 1),
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

        // Mejores vías de referencia: ranking por score de Wilson (precisión ajustada
        // por volumen), no por tasa de error cruda — evita que una vía con pocos
        // tránsitos y 0 errores gane sobre una vía con miles de tránsitos y una tasa
        // de error mínima, que es en realidad la referencia más confiable.
        var mejoresVias = viaAgg
            .Where(v => v.Total >= 20)
            .OrderByDescending(v => v.Score)
            .Take(8)
            .Select(v => new OcrMejorViaDto(v.Estacion, v.Via, v.Total, v.TasaVia, v.Score, v.Horas))
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

    // ── Evolución de una vía específica en el tiempo (día a día) ────────
    public async Task<OcrViaEvolucionDto> GetViaEvolucionAsync(string estacion, string via, int dias, bool soloPrepago = false)
    {
        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");

        int? coest = estacion switch {
            "FORTALEZA" => 1, "HUARMEY" => 2, "402" => 3, "VIRU" => 4, "SANTA" => 5, _ => null
        };

        // La vía llega como el nombre que ya se le mostró al usuario (vd.via_nombr,
        // o el fallback "Via N" cuando no hay nombre catalogado) — se compara igual.
        const string viaMatch = @"
            (vd.via_nombr = @via OR (vd.via_nombr IS NULL AND 'Via ' + CAST(t.tra_nuvia AS VARCHAR) = @via))";

        string filtroBase = $@"
            tra_fecha >= DATEADD(DAY, -@dias, GETDATE())
            AND tra_tipop IN ('E','S','O','M','T')
            AND tra_titra = 'TR'
            AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)
            AND tra_paten IS NOT NULL AND tra_paten <> ''
            {FiltroPrepago(soloPrepago)}
            AND t.tra_coest = @coest
            AND {viaMatch}";

        // "No detectada": el OCR no leyó nada. "Reconocida con error": el OCR leyó
        // algo, pero no coincide con la placa del cajero (sustitución/carácter extra/perdido).
        const string noDetSum = @"
            SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = '' THEN 1 ELSE 0 END)";
        const string errRecSum = @"
            SUM(CASE WHEN tra_patocr IS NOT NULL AND tra_patocr <> ''
                          AND tra_paten <> tra_patocr THEN 1 ELSE 0 END)";
        const string errSum = @"
            SUM(CASE WHEN tra_patocr IS NULL OR tra_patocr = ''
                          OR tra_paten <> tra_patocr THEN 1 ELSE 0 END)";

        var param = new { coest, via, dias };

        var diaria = (await conn.QueryAsync<OcrDiaViaDto>($@"
            SELECT CONVERT(varchar(10), CAST(tra_fecha AS DATE), 23) AS Fecha,
                   COUNT(*) AS Total,
                   ROUND(100.0 * {errSum}    / NULLIF(COUNT(*), 0), 1) AS TasaError,
                   ROUND(100.0 * {noDetSum}  / NULLIF(COUNT(*), 0), 1) AS TasaNoDetectada,
                   ROUND(100.0 * {errRecSum} / NULLIF(COUNT(*), 0), 1) AS TasaReconocidaError
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            WHERE {filtroBase}
            GROUP BY CAST(tra_fecha AS DATE)
            ORDER BY Fecha",
            param, commandTimeout: 90)).ToList();

        var porHora = (await conn.QueryAsync<OcrCeldaDto>($@"
            SELECT DATEPART(HOUR, tra_fecha) AS Hora,
                   COUNT(*) AS Total,
                   ROUND(100.0 * {errSum} / NULLIF(COUNT(*), 0), 1) AS TasaError
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            WHERE {filtroBase}
            GROUP BY DATEPART(HOUR, tra_fecha)
            ORDER BY Hora",
            param, commandTimeout: 90)).ToList();

        return new OcrViaEvolucionDto(estacion, via, dias, diaria, porHora);
    }
}
