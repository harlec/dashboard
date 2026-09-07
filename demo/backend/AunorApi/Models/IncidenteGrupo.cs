namespace AunorApi.Models;

// Incidente de sede (vía o peaje) — agrupa varias caídas simultáneas en un solo
// mensaje de Telegram que se va editando en vez de mandar uno por equipo.
public class IncidenteGrupo
{
    public int Id { get; set; }
    public string Tipo { get; set; } = "";  // "Via" | "Peaje"
    public int EstacionId { get; set; }
    public int? ViaId { get; set; }         // null cuando Tipo == "Peaje"
    public DateTime Inicio { get; set; }
    public DateTime? Fin { get; set; }
    public string? TelegramChatId { get; set; }
    public string? TelegramMessageId { get; set; }
    public int EquiposAfectados { get; set; }
    public int EquiposTotal { get; set; }
}
