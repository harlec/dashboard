using AunorApi.DTOs;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AunorApi.Services;

public class DiscrepanciasService(IConfiguration config)
{
    private readonly string _connStr =
        Environment.GetEnvironmentVariable("CONSOLIDADO_CONN")
        ?? config["ConsolidadoDb:ConnectionString"]
        ?? throw new InvalidOperationException("CONSOLIDADO_CONN no configurado");

    // Períodos válidos → fragmento WHERE que usa GETDATE() del propio SQL Server
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
        _      => "tra_fecha >= DATEADD(HOUR, -12, GETDATE())"
    };

    private static string PeriodBucket(string periodo) => periodo switch {
        "1h"           => "DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha)/10*10, 0)",
        "4h"           => "DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha)/20*20, 0)",
        "12h"          => "DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha)/30*30, 0)",
        "24h" or "ayer"=> "DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha)/60*60, 0)",
        "mes"          => "CAST(CAST(tra_fecha AS DATE) AS DATETIME)",
        _              => "DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha)/30*30, 0)"
    };

    private static string FormatBucket(DateTime dt, string periodo) =>
        periodo == "mes" ? dt.ToString("dd/MM") : dt.ToString("HH:mm");

    private const string EstacionCase = @"CASE tra_coest
        WHEN 1 THEN 'FORTALEZA' WHEN 2 THEN 'HUARMEY'
        WHEN 3 THEN '402'       WHEN 4 THEN 'VIRU' WHEN 5 THEN 'SANTA'
        END";

    // Condiciones comunes (sin el filtro de periodo y sin tra_manua<>tra_dac)
    private const string FiltroTipo = @"
        AND tra_tipop IN ('E','S','O','M','T')
        AND tra_titra = 'TR'
        AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)";

    private const string DisjusJoin = @"
        INNER JOIN disjus ON dis_coest=tra_coest AND dis_nuvia=tra_nuvia
                         AND dis_numev=tra_numev  AND dis_fecha=tra_fecha";

    public async Task<DiscrepanciasResumenDto> GetResumenAsync(string periodo)
    {
        await using var conn = new SqlConnection(_connStr);
        string pw     = PeriodWhere(periodo);
        string bucket = PeriodBucket(periodo);

        // 1. Total discrepancias
        var total = await conn.ExecuteScalarAsync<int>($@"
            SELECT COUNT(*)
            FROM transitos t {DisjusJoin}
            WHERE {pw}
              AND t.tra_manua <> t.tra_dac
              {FiltroTipo}");

        // 2. Total transacciones (sin filtro de discrepancia)
        var totalTx = await conn.ExecuteScalarAsync<int>($@"
            SELECT COUNT(*)
            FROM transitos t {DisjusJoin}
            WHERE {pw}
              {FiltroTipo}");

        double efectividad = totalTx > 0
            ? Math.Round((totalTx - total) * 100.0 / totalTx, 2)
            : 100.0;

        // 3. Top 15 pares de confusión
        var topPares = (await conn.QueryAsync<ConfusionParDto>($@"
            WITH cte AS (
                SELECT
                    ISNULL(C1.cfa_catde, CAST(t.tra_manua AS VARCHAR(30))) AS Desde,
                    ISNULL(C2.cfa_catde, CAST(t.tra_dac   AS VARCHAR(30))) AS Hasta
                FROM transitos t {DisjusJoin}
                LEFT JOIN catfau C1 ON t.tra_manua=C1.cfa_tarif AND C1.cfa_coest IS NULL
                LEFT JOIN catfau C2 ON t.tra_dac  =C2.cfa_tarif AND C2.cfa_coest IS NULL
                WHERE {pw}
                  AND t.tra_manua <> t.tra_dac
                  {FiltroTipo}
            )
            SELECT TOP 15 Desde, Hasta, COUNT(*) AS Total
            FROM cte GROUP BY Desde, Hasta ORDER BY Total DESC")).ToList();

        // 4. Por estación
        var porEstacion = (await conn.QueryAsync<EstacionConteoDto>($@"
            SELECT {EstacionCase} AS Estacion, COUNT(*) AS Total
            FROM transitos t {DisjusJoin}
            WHERE {pw}
              AND t.tra_manua <> t.tra_dac
              {FiltroTipo}
            GROUP BY tra_coest ORDER BY Total DESC")).ToList();

        // 5. Tendencia por bucket
        var trendRaw = (await conn.QueryAsync<(DateTime Bucket, string Estacion, int Total)>($@"
            SELECT {bucket} AS Bucket,
                   {EstacionCase} AS Estacion,
                   COUNT(*) AS Total
            FROM transitos t {DisjusJoin}
            WHERE {pw}
              AND t.tra_manua <> t.tra_dac
              {FiltroTipo}
            GROUP BY {bucket}, tra_coest
            ORDER BY Bucket ASC")).ToList();

        var trend = trendRaw
            .Select(r => new TrendPuntoDto(FormatBucket(r.Bucket, periodo), r.Estacion, r.Total))
            .ToList();

        // 6. Top 5 vías
        var topVias = (await conn.QueryAsync<ViaConteoDto>($@"
            SELECT TOP 5
                ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR(5))) AS Via,
                {EstacionCase} AS Estacion,
                COUNT(*) AS Total
            FROM transitos t {DisjusJoin}
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            WHERE {pw}
              AND t.tra_manua <> t.tra_dac
              {FiltroTipo}
            GROUP BY t.tra_coest, t.tra_nuvia, vd.via_nombr
            ORDER BY Total DESC")).ToList();

        return new DiscrepanciasResumenDto(
            total, totalTx, efectividad,
            topPares, porEstacion, trend, topVias);
    }

    public async Task<DiscrepanciasDetalleDto> GetDetalleAsync(
        string periodo, string? estacion, string? placa, int pagina, int porPagina)
    {
        await using var conn = new SqlConnection(_connStr);
        string pw = PeriodWhere(periodo);

        int? coest = estacion switch {
            "FORTALEZA" => 1, "HUARMEY" => 2, "402" => 3, "VIRU" => 4, "SANTA" => 5, _ => null
        };
        string? placaFiltro = string.IsNullOrWhiteSpace(placa) ? null : placa.Trim().ToUpper();

        string baseFrom = $@"
            FROM transitos t {DisjusJoin}
            LEFT JOIN tipope ON tra_tipop=tip_codig
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            LEFT JOIN catfau C1 ON t.tra_manua=C1.cfa_tarif AND C1.cfa_coest IS NULL
            LEFT JOIN catfau C2 ON t.tra_dac  =C2.cfa_tarif AND C2.cfa_coest IS NULL
            WHERE {pw}
              AND t.tra_manua <> t.tra_dac
              {FiltroTipo}
              AND (@coest IS NULL OR tra_coest = @coest)
              AND (@placa IS NULL OR tra_paten LIKE '%'+@placa+'%' OR tra_patocr LIKE '%'+@placa+'%')";

        var pFilter = new { coest, placa = placaFiltro };
        var totalCount = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) {baseFrom}", pFilter);

        int offset = (pagina - 1) * porPagina;
        var items = (await conn.QueryAsync<DiscrepanciaItemDto>($@"
            SELECT
                CONVERT(varchar(16), tra_fecha, 120) AS Fecha,
                ISNULL(vd.via_nombr, '')             AS Via,
                tra_ticke                            AS Ticket,
                ISNULL(tra_paten,  '')               AS PlacaTabulada,
                ISNULL(tra_patocr, '')               AS PlacaDetectada,
                t.tra_manua                          AS Tabulada,
                ISNULL(C1.cfa_catde, CAST(t.tra_manua AS VARCHAR(30))) AS CatTabulada,
                t.tra_dac                            AS Detectada,
                ISNULL(C2.cfa_catde, CAST(t.tra_dac AS VARCHAR(30)))   AS CatDetectada,
                tra_tipop                            AS TipoOperacion,
                CASE tra_coest
                    WHEN 1 THEN 'FORTALEZA' WHEN 2 THEN 'HUARMEY'
                    WHEN 3 THEN '402' WHEN 4 THEN 'VIRU' WHEN 5 THEN 'SANTA'
                END                                  AS Unidad,
                ISNULL(tra_id, '')                   AS Cobrador
            {baseFrom}
            ORDER BY tra_fecha DESC
            OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY",
            new { coest, placa = placaFiltro, offset, porPagina })).ToList();

        return new DiscrepanciasDetalleDto(totalCount, pagina, porPagina, items);
    }
}
