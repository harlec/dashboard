namespace AunorApi.DTOs;

public record KpiDto(int Total, int Ups, int Downs, int SinDatos, int IncActivos, int UptimePct);

public record EquipoLiveDto(
    int Id, string Nombre, string Ip,
    string TipoNombre, string? Icono,
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
    int Id, string Nombre, string Ip, string TipoNombre,
    string? UltimoEstado, double? LatenciaMs, DateTime? UltimoPing,
    DateTime? IncInicio, int? IncMin,
    List<PingHistDto> Historial);

public record PingHistDto(DateTime Timestamp, string Estado, double? LatenciaMs);

public record IncidenteDto(
    int Id, int EquipoId, string EquipoNombre, string Estacion, string Via,
    DateTime Inicio, DateTime? Fin, int? DuracionMin);

public record CamaraStatusDto(int Id, byte Camara, DateTime? UltimoEmail, int? MinDesdeEmail, bool Online);

public record SlaEquipoDto(int EquipoId, string Nombre, string TipoNombre, string Via, decimal UptimePct, int TotalMin, int DownMin);
