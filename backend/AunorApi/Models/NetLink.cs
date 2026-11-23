namespace AunorApi.Models;

// Enlace WAN/LAN medido: una interfaz del firewall. El % de uso se calcula contra el
// ancho CONTRATADO (no la velocidad física); null = sin ancho cargado, no hay %.
public class NetLink
{
    public int Id { get; set; }
    public int DeviceId { get; set; }
    public string Interfaz { get; set; } = "";
    public string? Zona { get; set; }
    public string Rol { get; set; } = "";
    public double? MbpsContratadoIn { get; set; }
    public double? MbpsContratadoOut { get; set; }
    public double UmbralWarnPct { get; set; } = 70;
    public double UmbralCritPct { get; set; } = 85;
    public bool MedirAlerta { get; set; } = true;
    public NetDevice Device { get; set; } = null!;
}
