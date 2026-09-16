namespace AunorApi.Models;

public class Servicio
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string? Descripcion { get; set; }
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
    public ICollection<ServicioCheck> Checks { get; set; } = [];
}
