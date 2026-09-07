namespace AunorApi.Models;

public class PingLog
{
    public long Id { get; set; }
    public int EquipoId { get; set; }
    public DateTime Timestamp { get; set; }
    public string Estado { get; set; } = "";  // "UP" | "DOWN"
    public double? LatenciaMs { get; set; }
    public string? DetalleEstado { get; set; }  // IPStatus crudo (TimedOut, TtlExpired, etc.) o error de socket/TCP
    public Equipo Equipo { get; set; } = null!;
}
