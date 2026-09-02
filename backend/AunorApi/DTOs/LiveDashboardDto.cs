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
    string Tipo, string? Motivo);

public record CamaraStatusDto(int Id, byte Camara, DateTime? UltimoEmail, int? MinDesdeEmail, bool Online);

public record SlaEquipoDto(
    int EquipoId, string Nombre, string TipoNombre,
    int EstacionId, string Estacion, string Via,
    decimal UptimePct, int TotalMin, int DownMin, string? Motivos);

public record SlaEstacionDto(int EstacionId, string Estacion, decimal UptimePct, int Total);

public record MantenimientoDto(
    int Id, int? EstacionId, string? Estacion, int? ViaId, string? Via, int? EquipoId, string? Equipo,
    DateTime Desde, DateTime Hasta, string Motivo, string CreadoPor, DateTime CreadoEn);

public record EstacionIncDto(string Estacion, int Total);
public record ViaIncDto(string Via, string Estacion, int Total);
public record TendenciaIncDto(string Fecha, int Total);
public record IncidenteResumenDto(
    int Total, int Activos,
    List<EstacionIncDto> PorEstacion,
    List<ViaIncDto> TopVias,
    List<TendenciaIncDto> Tendencia
);
