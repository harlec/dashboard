namespace AunorApi.Models;

public class TipoEquipo
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string? Icono { get; set; }
    public string? Descripcion { get; set; }
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
    public ICollection<Equipo> Equipos { get; set; } = [];
}
