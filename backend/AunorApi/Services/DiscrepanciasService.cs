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

    private static int BucketMin(int horas) => horas switch { 1 => 10, 4 => 20, 8 => 30, _ => 60 };

    // Usa GETDATE() del propio SQL Server para evitar desfase de zona horaria
    // entre el contenedor Docker (UTC) y la BD consolidado (hora local Perú)
    private const string FiltroBase = @"
        AND t.tra_manua <> t.tra_dac
        AND tra_tipop IN ('E','S','O','M','T')
        AND tra_titra = 'TR'
        AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)";

    private const string EstacionCase = @"CASE tra_coest
        WHEN 1 THEN 'FORTALEZA' WHEN 2 THEN 'HUARMEY'
        WHEN 3 THEN '402'       WHEN 4 THEN 'VIRU'   WHEN 5 THEN 'SANTA'
        END";

    public async Task<DiscrepanciasResumenDto> GetResumenAsync(int horas)
    {
        await using var conn = new SqlConnection(_connStr);
        var p = new { horas };
        int bm = BucketMin(horas);

        var total = await conn.ExecuteScalarAsync<int>($@"
            SELECT COUNT(*)
            FROM transitos t
            INNER JOIN disjus ON dis_coest=tra_coest AND dis_nuvia=tra_nuvia
                             AND dis_numev=tra_numev  AND dis_fecha=tra_fecha
            WHERE tra_fecha >= DATEADD(HOUR, -@horas, GETDATE())
            {FiltroBase}", p);

        var topPares = (await conn.QueryAsync<ConfusionParDto>($@"
            WITH cte AS (
                SELECT
                    ISNULL(C1.cfa_catde, CAST(t.tra_manua AS VARCHAR(30))) AS Desde,
                    ISNULL(C2.cfa_catde, CAST(t.tra_dac   AS VARCHAR(30))) AS Hasta
                FROM transitos t
                INNER JOIN disjus ON dis_coest=tra_coest AND dis_nuvia=tra_nuvia
                                 AND dis_numev=tra_numev  AND dis_fecha=tra_fecha
                LEFT JOIN catfau C1 ON t.tra_manua=C1.cfa_tarif AND C1.cfa_coest IS NULL
                LEFT JOIN catfau C2 ON t.tra_dac  =C2.cfa_tarif AND C2.cfa_coest IS NULL
                WHERE tra_fecha >= DATEADD(HOUR, -@horas, GETDATE())
                {FiltroBase}
            )
            SELECT TOP 15 Desde, Hasta, COUNT(*) AS Total
            FROM cte GROUP BY Desde, Hasta ORDER BY Total DESC", p)).ToList();

        var porEstacion = (await conn.QueryAsync<EstacionConteoDto>($@"
            SELECT {EstacionCase} AS Estacion, COUNT(*) AS Total
            FROM transitos t
            INNER JOIN disjus ON dis_coest=tra_coest AND dis_nuvia=tra_nuvia
                             AND dis_numev=tra_numev  AND dis_fecha=tra_fecha
            WHERE tra_fecha >= DATEADD(HOUR, -@horas, GETDATE())
            {FiltroBase}
            GROUP BY tra_coest ORDER BY Total DESC", p)).ToList();

        var trendRaw = (await conn.QueryAsync<(DateTime Bucket, string Estacion, int Total)>($@"
            SELECT DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha)/{bm}*{bm}, 0) AS Bucket,
                   {EstacionCase} AS Estacion,
                   COUNT(*) AS Total
            FROM transitos t
            INNER JOIN disjus ON dis_coest=tra_coest AND dis_nuvia=tra_nuvia
                             AND dis_numev=tra_numev  AND dis_fecha=tra_fecha
            WHERE tra_fecha >= DATEADD(HOUR, -@horas, GETDATE())
            {FiltroBase}
            GROUP BY DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha)/{bm}*{bm}, 0), tra_coest
            ORDER BY Bucket ASC", p)).ToList();

        var trend = trendRaw
            .Select(r => new TrendPuntoDto(r.Bucket.ToString("HH:mm"), r.Estacion, r.Total))
            .ToList();

        var topVias = (await conn.QueryAsync<ViaConteoDto>($@"
            SELECT TOP 5
                ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR(5))) AS Via,
                {EstacionCase} AS Estacion,
                COUNT(*) AS Total
            FROM transitos t
            INNER JOIN disjus ON dis_coest=tra_coest AND dis_nuvia=tra_nuvia
                             AND dis_numev=tra_numev  AND dis_fecha=tra_fecha
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            WHERE tra_fecha >= DATEADD(HOUR, -@horas, GETDATE())
            {FiltroBase}
            GROUP BY t.tra_coest, t.tra_nuvia, vd.via_nombr
            ORDER BY Total DESC", p)).ToList();

        return new DiscrepanciasResumenDto(total, topPares, porEstacion, trend, topVias);
    }

    public async Task<DiscrepanciasDetalleDto> GetDetalleAsync(
        int horas, string? estacion, string? placa, int pagina, int porPagina)
    {
        await using var conn = new SqlConnection(_connStr);

        int? coest = estacion switch {
            "FORTALEZA" => 1, "HUARMEY" => 2, "402" => 3, "VIRU" => 4, "SANTA" => 5, _ => null
        };
        string? placaFiltro = string.IsNullOrWhiteSpace(placa) ? null : placa.Trim().ToUpper();

        const string baseFrom = @"
            FROM transitos t
            INNER JOIN disjus ON dis_coest=tra_coest AND dis_nuvia=tra_nuvia
                             AND dis_numev=tra_numev  AND dis_fecha=tra_fecha
            LEFT JOIN tipope ON tra_tipop=tip_codig
            LEFT JOIN viadef vd ON t.tra_coest=vd.via_coest AND t.tra_nuvia=vd.via_nuvia
            LEFT JOIN catfau C1 ON t.tra_manua=C1.cfa_tarif AND C1.cfa_coest IS NULL
            LEFT JOIN catfau C2 ON t.tra_dac  =C2.cfa_tarif AND C2.cfa_coest IS NULL
            WHERE tra_fecha >= DATEADD(HOUR, -@horas, GETDATE())
              AND t.tra_manua <> t.tra_dac
              AND tra_tipop IN ('E','S','O','M','T')
              AND tra_titra = 'TR'
              AND (tra_tiobs = 'A' OR tra_tiobs IS NULL)
              AND (@coest IS NULL OR tra_coest = @coest)
              AND (@placa IS NULL OR tra_paten LIKE '%'+@placa+'%' OR tra_patocr LIKE '%'+@placa+'%')";

        var pFilter = new { horas, coest, placa = placaFiltro };
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
            new { horas, coest, placa = placaFiltro, offset, porPagina })).ToList();

        return new DiscrepanciasDetalleDto(totalCount, pagina, porPagina, items);
    }
}
