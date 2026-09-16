namespace AunorApi.Models;

public class ServicioIncidente
{
    public int Id { get; set; }
    public int ServicioCheckId { get; set; }
    public DateTime Inicio { get; set; }
    public DateTime? Fin { get; set; }
    public int? DuracionMin { get; set; }
    public string? DetalleEstado { get; set; }
    public ServicioCheck ServicioCheck { get; set; } = null!;
}
