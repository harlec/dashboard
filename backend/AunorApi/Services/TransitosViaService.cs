using Dapper;
using Microsoft.Data.SqlClient;

namespace AunorApi.Services;

public record ViaCatalogoDto(string Estacion, int Numero, string Nombre);
public record MedioPagoDto(string Codigo, string Nombre, int Total);
public record CategoriaConteoDto(string Categoria, int Total);
public record SeriePuntoDto(string Bucket, string Medio, int Total);
public record TransitoViaItemDto(
    int Numev, string Fecha, string Ticket, string Sentido, string Placa, string PlacaOcr,
    string Categoria, string Medio, string TipoTransito, bool Prepago, string Cobrador);
public record TipoTransitoDto(string Tipo, int Total);
public record TransitosViaDto(
    string Estacion, int ViaNumero, string Via, int Total, double? PorHora, string? UltimoTransito,
    int Prepago, List<MedioPagoDto> PorMedio, List<CategoriaConteoDto> PorCategoria,
    List<SeriePuntoDto> Serie, List<TransitoViaItemDto> Ultimos,
    bool SoloCobro = true, List<TipoTransitoDto>? PorTipo = null);

// Detalle de tránsitos de UNA vía en un período: volumen, medios de pago, categorías,
// serie en el tiempo y los últimos tránsitos registrados. Por defecto solo cuenta cobro
// real (tra_titra = 'TR'): las violaciones ('VI'), cierres, abortadas, etc. inflaban el
// conteo de vías que casi no se usan. Con soloCobro=false se ve todo paso registrado
// (igual que la búsqueda por placa de oficios). PorTipo siempre desglosa TODOS los tipos.
// No usa disjus, así que el total puede diferir del denominador de Discrepancias.
public class TransitosViaService(ConsolidadoConnectionProvider consolidado)
{
    // Períodos propios de esta vista (ventanas cortas) + los de Discrepancias.
    public static bool EsPeriodoValido(string p) =>
        p is "15m" or "30m" || DiscrepanciasService.EsPeriodoValido(p);

    public static int? CoestDe(string? estacion) => estacion?.ToUpperInvariant() switch {
        "FORTALEZA" => 1, "HUARMEY" => 2, "402" => 3, "VIRU" => 4, "SANTA" => 5, _ => null
    };

    // tra_tipop: E efectivo, T tag, O cobro por placa, S tarjeta, X exento, resto otros
    // (mismo criterio que OcrPlacasDto.TransitosMesDto).
    public static string NombreMedio(string codigo) => codigo switch {
        "E" => "Efectivo", "T" => "Tag", "O" => "Por placa", "S" => "Tarjeta",
        "X" => "Exento", "M" => "Otros (M)", "" => "Sin dato", _ => $"Otros ({codigo})"
    };

    private static string Where(string periodo, DateTime? d, DateTime? h) => periodo switch {
        "15m" => "tra_fecha >= DATEADD(MINUTE, -15, GETDATE())",
        "30m" => "tra_fecha >= DATEADD(MINUTE, -30, GETDATE())",
        _     => DiscrepanciasService.PeriodWhere(periodo, d, h),
    };

    // Cubetas más finas que en Discrepancias: aquí interesa ver los últimos minutos.
    private static string Bucket(string periodo, DateTime? d, DateTime? h) => periodo switch {
        "15m" or "30m" => "DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha), 0)",
        "1h"           => "DATEADD(MINUTE, DATEDIFF(MINUTE,0,tra_fecha)/5*5, 0)",
        _              => DiscrepanciasService.PeriodBucket(periodo, d, h),
    };

    private static double? MinutosVentana(string periodo, DateTime? d, DateTime? h) => periodo switch {
        "15m" => 15, "30m" => 30, "1h" => 60, "4h" => 240, "12h" => 720, "24h" or "ayer" => 1440,
        "rango" when d != null && h != null => (h.Value - d.Value).TotalMinutes,
        _ => null,
    };

    public async Task<List<ViaCatalogoDto>> GetViasAsync()
    {
        await using var conn = new SqlConnection(await consolidado.GetAsync());
        return (await conn.QueryAsync<ViaCatalogoDto>($@"
            SELECT {DiscrepanciasService.EstacionCase.Replace("tra_coest", "via_coest")} AS Estacion,
                   CAST(via_nuvia AS INT) AS Numero,
                   ISNULL(via_nombr, 'Via ' + CAST(via_nuvia AS VARCHAR)) AS Nombre
            FROM viadef
            WHERE via_coest BETWEEN 1 AND 5
            ORDER BY via_coest, via_nuvia", commandTimeout: 30)).ToList();
    }

    public async Task<TransitosViaDto> GetViaAsync(
        string estacion, int via, string periodo, int limite, DateTime? desde = null, DateTime? hasta = null,
        bool soloCobro = true)
    {
        int coest = CoestDe(estacion) ?? throw new ArgumentException("Estación inválida");
        string pw     = Where(periodo, desde, hasta);
        string bucket = Bucket(periodo, desde, hasta);
        var p = new { coest, via, limite };

        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");

        string filtroBase = $"{pw} AND t.tra_coest = @coest AND t.tra_nuvia = @via";
        string filtro = soloCobro ? $"{filtroBase} AND t.tra_titra = 'TR'" : filtroBase;

        var porTipo = (await conn.QueryAsync<TipoTransitoDto>($@"
            SELECT ISNULL(CAST(tra_titra AS VARCHAR(10)), '') AS Tipo, COUNT(*) AS Total
            FROM transitos t WHERE {filtroBase}
            GROUP BY ISNULL(CAST(tra_titra AS VARCHAR(10)), '')
            ORDER BY Total DESC", p, commandTimeout: 60)).ToList();

        var nombreVia = await conn.ExecuteScalarAsync<string?>(
            "SELECT TOP 1 via_nombr FROM viadef WHERE via_coest = @coest AND via_nuvia = @via", p)
            ?? $"Via {via}";

        var medios = (await conn.QueryAsync<(string Codigo, int Total, int Prepago)>($@"
            SELECT ISNULL(CAST(tra_tipop AS VARCHAR(5)), '') AS Codigo, COUNT(*) AS Total,
                   SUM(CASE WHEN tra_subfp = 1 THEN 1 ELSE 0 END) AS Prepago
            FROM transitos t WHERE {filtro}
            GROUP BY ISNULL(CAST(tra_tipop AS VARCHAR(5)), '')
            ORDER BY Total DESC", p, commandTimeout: 60)).ToList();

        var categorias = (await conn.QueryAsync<CategoriaConteoDto>($@"
            SELECT ISNULL(C.cfa_catde, CAST(t.tra_tarif AS VARCHAR(30))) AS Categoria, COUNT(*) AS Total
            FROM transitos t
            LEFT JOIN catfau C ON t.tra_tarif = C.cfa_tarif AND C.cfa_coest IS NULL
            WHERE {filtro}
            GROUP BY ISNULL(C.cfa_catde, CAST(t.tra_tarif AS VARCHAR(30)))
            ORDER BY Total DESC", p, commandTimeout: 60)).ToList();

        var serieRaw = (await conn.QueryAsync<(DateTime Bucket, string Medio, int Total)>($@"
            SELECT {bucket} AS Bucket, ISNULL(CAST(tra_tipop AS VARCHAR(5)), '') AS Medio, COUNT(*) AS Total
            FROM transitos t WHERE {filtro}
            GROUP BY {bucket}, ISNULL(CAST(tra_tipop AS VARCHAR(5)), '')
            ORDER BY Bucket", p, commandTimeout: 60)).ToList();

        var ultimos = (await conn.QueryAsync<TransitoViaItemDto>($@"
            SELECT TOP (@limite)
                CAST(t.tra_numev AS INT)                            AS Numev,
                CONVERT(varchar(19), tra_fecha, 120)                AS Fecha,
                ISNULL(CAST(tra_ticke AS VARCHAR(20)), '')          AS Ticket,
                ISNULL(CAST(tra_senti AS VARCHAR(20)), '')          AS Sentido,
                ISNULL(tra_paten,  '')                              AS Placa,
                ISNULL(tra_patocr, '')                              AS PlacaOcr,
                ISNULL(C.cfa_catde, CAST(t.tra_tarif AS VARCHAR(30))) AS Categoria,
                ISNULL(CAST(tra_tipop AS VARCHAR(5)), '')           AS Medio,
                ISNULL(tra_titra,  '')                              AS TipoTransito,
                CAST(CASE WHEN tra_subfp = 1 THEN 1 ELSE 0 END AS BIT) AS Prepago,
                ISNULL(tra_id, '')                                  AS Cobrador
            FROM transitos t
            LEFT JOIN catfau C ON t.tra_tarif = C.cfa_tarif AND C.cfa_coest IS NULL
            WHERE {filtro}
            ORDER BY tra_fecha DESC, t.tra_numev DESC", p, commandTimeout: 60)).ToList();

        int total = medios.Sum(m => m.Total);
        double? min = MinutosVentana(periodo, desde, hasta);

        return new TransitosViaDto(
            estacion.ToUpperInvariant(), via, nombreVia, total,
            min is > 0 ? Math.Round(total * 60.0 / min.Value, 1) : null,
            ultimos.FirstOrDefault()?.Fecha,
            medios.Sum(m => m.Prepago),
            medios.Select(m => new MedioPagoDto(m.Codigo, NombreMedio(m.Codigo), m.Total)).ToList(),
            categorias,
            serieRaw.Select(r => new SeriePuntoDto(
                DiscrepanciasService.FormatBucket(r.Bucket, periodo, desde, hasta), r.Medio, r.Total)).ToList(),
            ultimos, soloCobro, porTipo);
    }
}
