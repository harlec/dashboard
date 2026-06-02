namespace AunorApi.Models;

public class PingLog
{
    public long Id { get; set; }
    public int EquipoId { get; set; }
    public DateTime Timestamp { get; set; }
    public string Estado { get; set; } = "";  // "UP" | "DOWN"
    public double? LatenciaMs { get; set; }
    public Equipo Equipo { get; set; } = null!;
}
