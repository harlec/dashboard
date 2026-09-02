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
    public bool EsCritico { get; set; } = false;
    public bool AgenteInstalado { get; set; } = false;
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
    // Se actualizan en CADA ciclo de ping (a diferencia de ping_log, que solo
    // graba en cambios de estado) — para que el dashboard muestre la latencia
    // real actual y no la congelada de la última vez que cambió de estado.
    public double? UltimaLatenciaMs { get; set; }
    public DateTime? UltimoPingEn { get; set; }
    public Via Via { get; set; } = null!;
    public TipoEquipo TipoEquipo { get; set; } = null!;
    public ICollection<PingLog> PingLogs { get; set; } = [];
    public ICollection<Incidente> Incidentes { get; set; } = [];
}
