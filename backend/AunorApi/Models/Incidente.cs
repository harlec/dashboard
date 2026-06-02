namespace AunorApi.Models;

public class Incidente
{
    public int Id { get; set; }
    public int EquipoId { get; set; }
    public DateTime Inicio { get; set; }
    public DateTime? Fin { get; set; }
    public int? DuracionMin { get; set; }
    public Equipo Equipo { get; set; } = null!;
}
