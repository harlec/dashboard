namespace AunorApi.Models;

public class ServicioCheck
{
    public int Id { get; set; }
    public int ServicioId { get; set; }
    public string Nombre { get; set; } = "";
    public string TipoCheck { get; set; } = "Ping";  // Ping | Tcp | Http
    public string Host { get; set; } = "";           // IP/hostname (Ping,Tcp) o URL completa (Http)
    public int? Puerto { get; set; }                 // solo Tcp
    public string? Ubicacion { get; set; }            // texto libre: "Lima" / "Chimbote" — solo informativo
    public bool Monitorear { get; set; } = true;
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
    // Igual que Equipo.UltimaLatenciaMs/UltimoPingEn — se actualiza en cada ciclo
    // del worker para que la pantalla de admin muestre el estado actual sin tener
    // que consultar servicio_check_logs.
    public string? UltimoEstado { get; set; }
    public double? UltimaLatenciaMs { get; set; }
    public DateTime? UltimoCheckEn { get; set; }
    public Servicio Servicio { get; set; } = null!;
}
