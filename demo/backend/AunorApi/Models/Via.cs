namespace AunorApi.Models;

public class Via
{
    public int Id { get; set; }
    public int EstacionId { get; set; }
    public string Numero { get; set; } = "";
    public string? Nombre { get; set; }
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
    public Estacion Estacion { get; set; } = null!;
    public ICollection<Equipo> Equipos { get; set; } = [];
}
