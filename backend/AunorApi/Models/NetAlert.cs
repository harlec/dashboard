namespace AunorApi.Models;

// Una alerta abierta por enlace y tipo. SATURACION = uso sobre el umbral crítico;
// SIN_DATOS = el firewall no responde (no se confunde con saturación).
public class NetAlert
{
    public const string Saturacion = "SATURACION";
    public const string SinDatos   = "SIN_DATOS";

    public int Id { get; set; }
    public int LinkId { get; set; }
    public string Tipo { get; set; } = Saturacion;
    public string Severidad { get; set; } = "CRITICA";
    public DateTime InicioUtc { get; set; }
    public DateTime? FinUtc { get; set; }
    public double? ValorMaxPct { get; set; }
    public NetLink Link { get; set; } = null!;
}
