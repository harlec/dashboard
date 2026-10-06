namespace AunorApi.Models;

// Un NVR por peaje. CoestTransito = tra_coest de la tabla transitos (Consolidado).
public class NvrPeaje
{
    public int Id { get; set; }
    public int CoestTransito { get; set; }
    public string Peaje { get; set; } = "";
    public string Ip { get; set; } = "";
    public int PuertoHttp { get; set; } = 80;
    public string Usuario { get; set; } = "";
    // Nombre de la variable de entorno con la contraseña — nunca la contraseña en sí
    public string PasswordRef { get; set; } = "";
    public int RetencionDias { get; set; } = 90;
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; } = DateTime.Now;
    public ICollection<NvrCanal> Canales { get; set; } = [];
}

public class NvrCanal
{
    public int Id { get; set; }
    public int NvrPeajeId { get; set; }
    public int Canal { get; set; }
    public string Tipo { get; set; } = "";   // OCR | VALIDACION | PTZ
    public int? ViaNumero { get; set; }      // tra_nuvia (OCR/VALIDACION)
    public string? Sentido { get; set; }     // PTZ: sentido que cubre; null = todos
    public string Nombre { get; set; } = "";
    public bool Activo { get; set; } = true;
    public NvrPeaje NvrPeaje { get; set; } = null!;
}
