namespace AunorApi.Models;

// Historial de cambios de enlace (MPLS/STARLINK/SIN_CONEXION) por estación —
// EquipoId es el equipo "sonda" (el que se usó para el traceroute de 3 saltos)
// de esa estación en el momento del cambio.
public class EnlaceEvento
{
    public int Id { get; set; }
    public int EquipoId { get; set; }
    public DateTime Inicio { get; set; }
    public DateTime? Fin { get; set; }
    public int? DuracionMin { get; set; }
    public string Enlace { get; set; } = "MPLS";
    public double? LatenciaMs { get; set; }
    public int? Ttl { get; set; }
    public Equipo Equipo { get; set; } = null!;
}
