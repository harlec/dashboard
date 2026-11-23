namespace AunorApi.Models;

// Firewall/router cuyos contadores de interfaz se sondean. Las dos unidades de un par HA
// son filas distintas con el mismo GrupoHa. La API key se guarda CIFRADA en ApiKeyEnc
// (nunca se devuelve por la API). SecretRef es respaldo: nombre de una variable de entorno.
public class NetDevice
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string Sitio { get; set; } = "";
    public string Marca { get; set; } = "PaloAlto";
    public string IpMgmt { get; set; } = "";
    public string RolHa { get; set; } = "ninguno";
    public string? GrupoHa { get; set; }
    public string? SecretRef { get; set; }
    public string? ApiKeyEnc { get; set; }
    public string? CertSha256 { get; set; }
    public bool Activo { get; set; } = true;
}
