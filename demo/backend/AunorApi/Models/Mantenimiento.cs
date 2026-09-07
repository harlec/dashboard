namespace AunorApi.Models;

// Exactamente uno de EstacionId/ViaId/EquipoId define el alcance.
// Mientras Desde <= ahora <= Hasta: los incidentes que se abran en ese alcance
// se etiquetan solos como "Mantenimiento" y no disparan alertas Telegram/Email/sonido.
public class Mantenimiento
{
    public int Id { get; set; }
    public int? EstacionId { get; set; }
    public int? ViaId { get; set; }
    public int? EquipoId { get; set; }
    public DateTime Desde { get; set; }
    public DateTime Hasta { get; set; }
    public string Motivo { get; set; } = "";
    public string CreadoPor { get; set; } = "";
    public DateTime CreadoEn { get; set; }
}
