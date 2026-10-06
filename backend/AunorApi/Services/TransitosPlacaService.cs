using Dapper;
using Microsoft.Data.SqlClient;

namespace AunorApi.Services;

public record TransitoPlacaDto(
    string Fecha, string Estacion, int Via, string ViaNombre, string Sentido, string Ticket,
    string PlacaCajero, string PlacaOcr, string Categoria, string TipoOperacion, string TipoTransito);

// Búsqueda de tránsitos por placa + rango — base del módulo de oficios fiscales.
// A diferencia de los reportes de discrepancias NO filtra por tra_titra='TR' ni
// tipo de operación: un oficio pide "todo paso registrado", incluidas violaciones,
// cierres, etc.
public class TransitosPlacaService(ConsolidadoConnectionProvider consolidado)
{
    // Quita guiones/espacios y pasa a mayúsculas: "b1a-852" → "B1A852"
    public static string NormalizarPlaca(string p) =>
        new string(p.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();

    public async Task<List<TransitoPlacaDto>> BuscarAsync(
        string placa, DateTime desde, DateTime hasta, string? estacion)
    {
        var norm = NormalizarPlaca(placa);
        if (norm.Length < 5) throw new ArgumentException("Placa inválida");

        int? coest = estacion?.ToUpperInvariant() switch {
            "FORTALEZA" => 1, "HUARMEY" => 2, "402" => 3, "VIRU" => 4, "SANTA" => 5, _ => null
        };

        await using var conn = new SqlConnection(await consolidado.GetAsync());
        await conn.OpenAsync();
        await conn.ExecuteAsync("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED");

        var rows = await conn.QueryAsync<TransitoPlacaDto>(@"
            SELECT
                CONVERT(varchar(19), tra_fecha, 120) AS Fecha,
                CASE tra_coest
                    WHEN 1 THEN 'FORTALEZA' WHEN 2 THEN 'HUARMEY'
                    WHEN 3 THEN '402' WHEN 4 THEN 'VIRU' WHEN 5 THEN 'SANTA'
                END                                        AS Estacion,
                CAST(t.tra_nuvia AS INT)                   AS Via,   -- en la BD real es tinyint
                ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR)) AS ViaNombre,
                ISNULL(CAST(tra_senti AS VARCHAR(20)), '') AS Sentido,
                ISNULL(CAST(tra_ticke AS VARCHAR(20)), '') AS Ticket,
                ISNULL(tra_paten,  '')                     AS PlacaCajero,
                ISNULL(tra_patocr, '')                     AS PlacaOcr,
                ISNULL(C.cfa_catde, CAST(t.tra_tarif AS VARCHAR(30))) AS Categoria,
                ISNULL(tra_tipop,  '')                     AS TipoOperacion,
                ISNULL(tra_titra,  '')                     AS TipoTransito
            FROM transitos t
            LEFT JOIN viadef vd ON t.tra_coest = vd.via_coest AND t.tra_nuvia = vd.via_nuvia
            LEFT JOIN catfau C  ON t.tra_tarif = C.cfa_tarif AND C.cfa_coest IS NULL
            WHERE tra_fecha >= @desde AND tra_fecha < @hasta
              AND (@coest IS NULL OR tra_coest = @coest)
              AND (REPLACE(REPLACE(tra_paten,  '-', ''), ' ', '') = @placa
                OR REPLACE(REPLACE(tra_patocr, '-', ''), ' ', '') = @placa)
            ORDER BY tra_fecha",
            new { desde, hasta, coest, placa = norm }, commandTimeout: 90);

        return rows.ToList();
    }
}
