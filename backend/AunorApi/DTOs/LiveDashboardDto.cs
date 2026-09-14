namespace AunorApi.DTOs;

public record KpiDto(int Total, int Ups, int Downs, int SinDatos, int IncActivos, int UptimePct);

public record EquipoLiveDto(
    int Id, string Nombre, string Ip,
    string TipoNombre, string? Icono, string? TipoDescripcion,
    string? UltimoEstado, double? LatenciaMs, DateTime? UltimoPing,
    bool Monitorear,
    DateTime? IncInicio, int? IncMin);

public record ViaLiveDto(int Id, string Numero, string? Nombre, List<EquipoLiveDto> Equipos);

public record EstacionLiveDto(
    int Id, string Nombre, string Codigo,
    int Total, int Up, int Down, int Sin,
    List<ViaLiveDto> Vias);

public record LiveDashboardDto(KpiDto Kpis, List<EstacionLiveDto> Estaciones);

public record EquipoDetailDto(
    int Id, string Nombre, string Ip, string TipoNombre, string? TipoDescripcion,
    string? UltimoEstado, double? LatenciaMs, DateTime? UltimoPing,
    DateTime? IncInicio, int? IncMin,
    List<PingHistDto> Historial);

public record PingHistDto(DateTime Timestamp, string Estado, double? LatenciaMs, string? DetalleEstado, string? Interpretacion);

public record IncidenteDto(
    int Id, int EquipoId, string EquipoNombre, string Estacion, string Via,
    DateTime Inicio, DateTime? Fin, int? DuracionMin,
    string Tipo, string? Motivo, string? DetalleEstado, string? Causa);

public record CamaraStatusDto(int Id, byte Camara, DateTime? UltimoEmail, int? MinDesdeEmail, bool Online);

public record SlaEquipoDto(
    int EquipoId, string Nombre, string TipoNombre,
    int EstacionId, string Estacion, string Via,
    decimal UptimePct, int TotalMin, int DownMin, string? Motivos, int Eventos);

public record SlaEstacionDto(int EstacionId, string Estacion, decimal UptimePct, int Total);
public record SlaTipoDto(string Tipo, decimal UptimePct, int Total);
public record MotivoDowntimeDto(string Causa, int Minutos, decimal Pct);

public record DiaDisponibilidadDto(string Fecha, decimal Pct);
public record DisponibilidadDiariaDto(List<DiaDisponibilidadDto> Dias, decimal MtbfDias, int Caidas);

public record MantenimientoDto(
    int Id, int? EstacionId, string? Estacion, int? ViaId, string? Via, int? EquipoId, string? Equipo,
    DateTime Desde, DateTime Hasta, string Motivo, string CreadoPor, DateTime CreadoEn);

public record EstacionIncDto(string Estacion, int Total);
public record ViaIncDto(string Via, string Estacion, int Total);
public record TendenciaIncDto(string Fecha, int Total);
public record HoraIncDto(int Hora, int Total);
public record CausaIncDto(string Causa, int Total);

// Ráfaga: incidentes que arrancaron en el mismo minuto en >=3 estaciones a la
// vez — es una caída de enlace, no N fallas independientes.
public record RafagaDto(DateTime Minuto, int Total, decimal PctDelPeriodo, int Estaciones);

public record IncidenteResumenDto(
    int Total, int Activos,
    List<EstacionIncDto> PorEstacion,
    List<ViaIncDto> TopVias,
    List<TendenciaIncDto> Tendencia,
    List<TendenciaIncDto> TendenciaAgrupada,
    int? MttrMin,
    List<HoraIncDto> PorHora,
    List<CausaIncDto> PorCausa,
    RafagaDto? RafagaDominante,
    int TotalAgrupado
);

public record EnlaceEventoDto(DateTime Inicio, DateTime? Fin, string Enlace, double? LatenciaMs);

public record IncidenteDetalleDto(
    IncidenteDto Incidente,
    string? Causa,
    List<PingHistDto> PingWindow,
    List<EnlaceEventoDto> EnlaceWindow,
    List<IncidenteDto> Relacionados
);
