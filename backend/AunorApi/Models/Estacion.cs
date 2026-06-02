namespace AunorApi.Models;

public class Estacion
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string Codigo { get; set; } = "";
    public string? Descripcion { get; set; }
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
    public ICollection<Via> Vias { get; set; } = [];
}
