namespace AunorApi.Models;

public class Servicio
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string? Descripcion { get; set; }
    // % de uptime cargado a mano mientras se define el monitoreo real de
    // servicios de plataforma (fase 2) — ver design_handoff_sigma.
    public decimal? UptimePct { get; set; }
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
    public ICollection<ServicioCheck> Checks { get; set; } = [];
}
