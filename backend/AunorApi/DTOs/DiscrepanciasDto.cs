namespace AunorApi.DTOs;

public record ConfusionParDto(string Desde, string Hasta, int Total);
public record EstacionConteoDto(string Estacion, int Total);
public record TrendPuntoDto(string Bucket, string Estacion, int Total);
public record ViaConteoDto(string Via, string Estacion, int Total);

public record DiscrepanciasResumenDto(
    int    Total,
    int    TotalTransacciones,
    double Efectividad,
    List<ConfusionParDto>   TopPares,
    List<EstacionConteoDto> PorEstacion,
    List<TrendPuntoDto>     Trend,
    List<ViaConteoDto>      TopVias
);

public class DiscrepanciaItemDto
{
    public string Fecha          { get; set; } = "";
    public string Via            { get; set; } = "";
    public int?   Ticket         { get; set; }
    public string PlacaTabulada  { get; set; } = "";
    public string PlacaDetectada { get; set; } = "";
    public int    Tabulada       { get; set; }
    public string CatTabulada    { get; set; } = "";
    public int?   Detectada      { get; set; }
    public string CatDetectada   { get; set; } = "";
    public string TipoOperacion  { get; set; } = "";
    public string Unidad         { get; set; } = "";
    public string Cobrador       { get; set; } = "";
}

public record DiscrepanciasDetalleDto(
    int Total, int Pagina, int PorPagina,
    List<DiscrepanciaItemDto> Items
);
