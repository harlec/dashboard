namespace AunorApi.DTOs;

// DTO único del reporte diario Sigma. Convención: null = "sin dato" (nunca 0 ni valores inventados).
// Ventana: Desde → Hasta (08:00 → 08:00 America/Lima).
public record ReporteDiarioDto(
    DateTime Desde,
    DateTime Hasta,
    DateTime GeneradoEn,
    List<string> LecturaRapida,
    RdIndicadores Indicadores,
    RdTendencia TendenciaDiscrepancia,
    RdTendencia TendenciaOcr,
    List<RdPendiente> SinResolver,
    List<RdPlazaDisp> DisponibilidadPlazas,
    List<RdEvento> Eventos,
    List<RdViaCritica> ViasCriticas,
    RdOcr Ocr,
    List<RdLatencia> Latencia,
    double UmbralLatenciaMs);

public record RdIndicadores(
    RdDiscrepanciaKpi Discrepancia,
    RdOcrKpi Ocr,
    RdEquiposKpi Equipos,
    RdIncidentesKpi Incidentes,
    RdDisponibilidadKpi Disponibilidad);

public record RdDiscrepanciaKpi(double? Pct, int? Transitos, int? Discrepancias, double? DeltaPt);
public record RdOcrKpi(double? Pct, int? Reconocidas, int? Evaluables, double? DeltaPt);
// DeltaSinRespuesta = sin respuesta hoy − sin respuesta ayer (positivo = más equipos caídos)
public record RdEquiposKpi(int? EnLinea, int? Total, int? SinRespuesta, int? DeltaSinRespuesta);
// DeltaTotal = incidentes de los últimos 7 d − los 7 d anteriores a ayer. MttrMin sobre los ya cerrados.
public record RdIncidentesKpi(int Total, int Activos, double? MttrMin, int? DeltaTotal);
public record RdDisponibilidadKpi(double? Pct, double? DeltaPt);

public record RdPunto(DateTime Fecha, double? Valor);
public record RdTendencia(List<RdPunto> Puntos, double? Promedio);

// Equipo o servicio sin resolver. DesdeUtc/Desde null + SinDato=true → "sin dato de monitoreo".
public record RdPendiente(
    string Tipo,            // "Equipo" | "Servicio"
    string Nombre,
    string Plaza,
    string? Via,
    DateTime? Desde,
    int? MinutosSinServicio,
    bool SinDato,
    string? Nota);          // p. ej. "mantenimiento"

public record RdPlazaDisp(string Plaza, double? Pct, bool EsMenor);

public record RdEventoEquipo(string Nombre, string? Via, DateTime Inicio, string Tipo);
// EventoComun=true cuando ≥N equipos de la plaza cayeron dentro de la ventana
public record RdEvento(
    bool EventoComun,
    string Plaza,
    DateTime Inicio,
    DateTime Fin,           // inicio del último equipo del grupo
    bool DuracionPorConfirmar,
    string? Causa,
    List<RdEventoEquipo> Equipos);

public record RdViaCritica(
    string Via, string Plaza, double Pct, double? DeltaPt, int Transitos,
    List<RdPunto> Tendencia7d);

public record RdOcrCategoria(string Nombre, double? Pct, int? Cantidad);
public record RdOcrPlaza(string Plaza, double? Pct, double? DeltaPt);
public record RdPlacaFrecuente(string Placa, string Via, string Plaza, int Veces, string? Motivo, string? ImagenUrl);
public record RdOcr(List<RdOcrCategoria> Categorias, List<RdOcrPlaza> PorPlaza, List<RdPlacaFrecuente> PlacasFrecuentes);

// EsActual = no hay historial de la ventana; es la latencia de este momento
public record RdLatencia(string Sitio, double? Ms, bool SuperaUmbral, bool EsActual = false);
