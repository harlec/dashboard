namespace AunorApi.Models;

// Bitácora de seguridad: quién hizo qué y desde dónde. Solo se inserta, nunca se edita.
public class AuditLog
{
    public long     Id        { get; set; }
    public DateTime Fecha     { get; set; }
    public string?  Usuario   { get; set; }
    public string?  Ip        { get; set; }
    public string   Accion    { get; set; } = "";   // LOGIN_OK, LOGIN_FALLO, USUARIO_CREADO, OFICIO_CLIP...
    public string?  Entidad   { get; set; }
    public string?  Detalle   { get; set; }
}
