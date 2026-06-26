namespace AunorApi.DTOs;

// ── Resumen de efectividad OCR por período ────────────────────
public record OcrResumenDto(
    int    TotalConPlaca,
    int    Aciertos,
    int    SinDetectar,
    int    Errores,
    double TasaEfectividad,
    double TasaSinDetectar,
    double TasaError,
    List<OcrEstacionDto>   PorEstacion,
    List<OcrTipoErrorDto>  PorTipoError,
    List<OcrViaDto>        PorVia
);

// Ranking de vías por errores OCR
public record OcrViaDto(
    string  Estacion,
    string  Via,
    int     Total,
    int     Aciertos,
    int     NoReconocidas,
    int     Confusiones,
    decimal Efectividad
);

public record OcrEstacionDto(
    string  Estacion,
    int     Total,
    int     Aciertos,
    int     SinDetectar,
    int     Errores,
    decimal Efectividad
);

// Tipos: SUSTITUCIÓN / NO DETECTADA / CARÁCTER EXTRA / CARÁCTER PERDIDO
public record OcrTipoErrorDto(string TipoError, int Total);

// ── Análisis de confusión de caracteres (30 días) ─────────────
public record OcrAnalisisDto(
    List<OcrConfusionCaracterDto> TopConfusiones,   // char-by-char mismatch matrix
    List<OcrPorHoraDto>           PorHora,           // efectividad por hora del día
    List<OcrParDto>               TopPares            // pares (placa cajero, placa ocr) más repetidos
);

// "En posición 3, el cajero escribió 'O' y el OCR leyó '0' — 47 veces"
public record OcrConfusionCaracterDto(
    int    Posicion,
    string Esperado,
    string OcrLeyo,
    int    Casos
);

public record OcrPorHoraDto(
    int     Hora,
    int     Total,
    int     Aciertos,
    int     Errores,
    decimal Efectividad
);

// Par (placa_cajero, placa_ocr) más frecuente entre los errores
public record OcrParDto(
    string PlacaCajero,
    string PlacaOcr,
    string TipoError,
    int    Casos
);

// ── Tendencias (últimos 30 días, ventana fija) ────────────────
public record OcrTendenciasDto(
    List<OcrHeatmapRowDto>   Heatmap,
    List<OcrDiaTendenciaDto> TendenciaDiaria,
    List<OcrMejorViaDto>     MejoresVias
);

// Una celda del heatmap: la hora + volumen + tasa de error
public record OcrCeldaDto(int Hora, int Total, decimal TasaError);

// Una fila del heatmap: una vía con sus 24 celdas (solo las que tienen datos)
public record OcrHeatmapRowDto(
    string Estacion, string Via,
    int Total, decimal TasaVia,
    List<OcrCeldaDto> Horas
);

// Punto de la tendencia diaria: tasa de toda la red + tasa de las mejores vías ese día
public record OcrDiaTendenciaDto(
    string  Fecha,
    int     Total,
    decimal TasaRed,
    decimal TasaMejores
);

// Una de las mejores vías de referencia + su perfil horario
public record OcrMejorViaDto(
    string Estacion, string Via,
    int Total, decimal TasaVia,
    List<OcrCeldaDto> PorHora
);

// ── Detalle paginado ──────────────────────────────────────────
public record OcrDetalleDto(
    int               Total,
    int               Pagina,
    int               PorPagina,
    List<OcrItemDto>  Items
);

public record OcrItemDto(
    string Fecha,
    string Estacion,
    string Via,
    string Ticket,
    string PlacaCajero,
    string PlacaOcr,
    string TipoError
);
