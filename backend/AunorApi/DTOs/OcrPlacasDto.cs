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

// Ranking de vías por errores OCR. Score = límite inferior de Wilson sobre la
// tasa de ERROR (0-100) — mientras más alto, más confiable es que la vía tenga
// una tasa de error genuinamente alta (no solo pocos tránsitos con mala suerte).
public record OcrViaDto(
    string  Estacion,
    string  Via,
    int     Total,
    int     Aciertos,
    int     NoReconocidas,
    int     Confusiones,
    decimal Efectividad,
    decimal Score
);

// Fila cruda de la agregación por vía (Dapper) — antes de calcular tasa/score
public record OcrViaCrudaDto(
    string Estacion,
    string Via,
    int    Total,
    int    Aciertos,
    int    NoReconocidas,
    int    Confusiones
);

// Mejores vías de referencia, respetando el período elegido en la pantalla
// (a diferencia de OcrMejorViaDto/tendencias, que usa siempre una ventana fija
// de 30 días). Score = límite inferior de Wilson sobre la tasa de acierto:
// pondera precisión y volumen juntos, para que una vía con pocos tránsitos y
// 0 errores no gane sobre una vía con muchos tránsitos y pocas discrepancias.
public record OcrMejorViaPeriodoDto(
    string  Estacion,
    string  Via,
    int     Total,
    int     Aciertos,
    decimal TasaError,
    decimal Score
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

// Una de las mejores vías de referencia + su perfil horario.
// Score = límite inferior de Wilson sobre la tasa de acierto (0-100): pondera
// precisión y volumen juntos, para que una vía con pocos tránsitos y 0 errores
// no desplace a una vía con miles de tránsitos y una tasa de error mínima.
public record OcrMejorViaDto(
    string Estacion, string Via,
    int Total, decimal TasaVia, decimal Score,
    List<OcrCeldaDto> PorHora
);

// ── Evolución de una vía específica en el tiempo ──────────────
public record OcrViaEvolucionDto(
    string Estacion, string Via, int Dias,
    List<OcrDiaViaDto> Diaria,
    List<OcrCeldaDto>  PorHora
);

public record OcrDiaViaDto(
    string Fecha, int Total, decimal TasaError,
    decimal TasaNoDetectada, decimal TasaReconocidaError);

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

// ── Tránsitos del mes en curso: volumen, forma de cobro y serie diaria ──
// FormaCobro sale de tra_tipop: E efectivo, T tag (prepago), O cobro por lectura de
// placa (OCR), S tarjeta de crédito, X exento, resto (M, etc.) otros. El total incluye X;
// los conteos OCR NO (a un exento no se le evalúa la lectura de placa).
public record TransitosMesDto(
    string Mes,
    int    DiasTranscurridos,
    int    DiasMes,
    int    Total,
    double PromedioDia,
    int    Proyeccion,
    int    Efectivo,
    int    Tag,
    int    PorPlaca,
    int    Tarjeta,
    int    Exento,
    int    Otros,
    int    OcrConPlaca,
    int    OcrAciertos,
    int    OcrErrores,
    int    OcrNoLegibles,
    List<TransitosDiaDto> PorDia
);

public record TransitosDiaDto(string Fecha, int Total, int OcrConPlaca, int OcrAciertos);
