namespace AunorApi.Models;

public class CamaraHeartbeat
{
    public int Id { get; set; }
    public byte Camara { get; set; }
    public DateTime? UltimoEmail { get; set; }
    public string? Asunto { get; set; }
    public string? Remitente { get; set; }
    public DateTime Creado { get; set; }
    public DateTime Actualizado { get; set; }
}
