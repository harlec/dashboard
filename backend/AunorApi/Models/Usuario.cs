namespace AunorApi.Models;

public class Usuario
{
    public int Id { get; set; }
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";  // bcrypt hash
    public string? Nombre { get; set; }
    public string Rol { get; set; } = "viewer";  // "admin" | "viewer"
    public bool Activo { get; set; } = true;
    public DateTime CreadoEn { get; set; }
}
