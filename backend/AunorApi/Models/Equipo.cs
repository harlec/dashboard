namespace AunorApi.Models;

public class Equipo
{
    public int Id { get; set; }
    public int ViaId { get; set; }
    public int TipoEquipoId { get; set; }
    public string Nombre { get; set; } = "";
    public string Ip { get; set; } = "";
    public string? Descripcion { get; set; }
    public string? CheckPort { get; set; }  // null = ICMP, "445" = un puerto, "8080,80" = varios en paralelo
    public bool Monitorear { get; set; } = true;
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
    public Via Via { get; set; } = null!;
    public TipoEquipo TipoEquipo { get; set; } = null!;
    public ICollection<PingLog> PingLogs { get; set; } = [];
    public ICollection<Incidente> Incidentes { get; set; } = [];
}
