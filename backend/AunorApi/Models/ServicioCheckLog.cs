namespace AunorApi.Models;

public class ServicioCheckLog
{
    public long Id { get; set; }
    public int ServicioCheckId { get; set; }
    public DateTime Timestamp { get; set; }
    public string Estado { get; set; } = "";
    public double? LatenciaMs { get; set; }
    public string? Detalle { get; set; }
    public ServicioCheck ServicioCheck { get; set; } = null!;
}
