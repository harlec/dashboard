using AunorApi.Data;
using AunorApi.Models;
using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/usuarios")]
[Authorize(Roles = "admin")]
public class UsuariosController(AppDbContext db, AuditService audit, SesionValidator sesiones) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.Usuarios
            .OrderBy(u => u.Username)
            .Select(u => new { u.Id, u.Username, u.Nombre, u.Rol, u.Activo, u.CreadoEn, u.BloqueadoHasta })
            .ToListAsync());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UsuarioCreateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username))
            return BadRequest(new { error = "El usuario es obligatorio" });
        if (req.Rol is not ("admin" or "viewer"))
            return BadRequest(new { error = "Rol inválido" });
        if (PasswordPolicy.Validar(req.Password, req.Username) is { } motivo)
            return BadRequest(new { error = motivo });
        if (await db.Usuarios.AnyAsync(u => u.Username == req.Username))
            return Conflict(new { error = "El usuario ya existe" });

        var u = new Usuario
        {
            Username = req.Username,
            Password = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Nombre   = req.Nombre,
            Rol      = req.Rol
        };
        db.Usuarios.Add(u);
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("USUARIO_CREADO", $"usuario:{u.Username}", $"rol={u.Rol}");
        return Created($"/api/usuarios/{u.Id}", new { u.Id, u.Username, u.Nombre, u.Rol });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UsuarioUpdateRequest req)
    {
        var u = await db.Usuarios.FindAsync(id);
        if (u is null) return NotFound();
        if (req.Rol is not ("admin" or "viewer"))
            return BadRequest(new { error = "Rol inválido" });
        var cambio = $"rol {u.Rol}->{req.Rol}, activo {u.Activo}->{req.Activo}";
        u.Nombre = req.Nombre; u.Rol = req.Rol; u.Activo = req.Activo;
        await db.SaveChangesAsync();
        sesiones.Invalidar(u.Id);
        await audit.RegistrarAsync("USUARIO_MODIFICADO", $"usuario:{u.Username}", cambio);
        return Ok(new { u.Id, u.Username, u.Nombre, u.Rol, u.Activo });
    }

    [HttpPut("{id}/password")]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] PasswordRequest req)
    {
        var u = await db.Usuarios.FindAsync(id);
        if (u is null) return NotFound();
        if (PasswordPolicy.Validar(req.Password, u.Username) is { } motivo)
            return BadRequest(new { error = motivo });
        u.Password = BCrypt.Net.BCrypt.HashPassword(req.Password);
        u.IntentosFallidos = 0;
        u.BloqueadoHasta   = null;
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("USUARIO_PASSWORD_RESET", $"usuario:{u.Username}");
        return Ok();
    }

    [HttpPut("{id}/desbloquear")]
    public async Task<IActionResult> Desbloquear(int id)
    {
        var u = await db.Usuarios.FindAsync(id);
        if (u is null) return NotFound();
        u.IntentosFallidos = 0;
        u.BloqueadoHasta   = null;
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("USUARIO_DESBLOQUEADO", $"usuario:{u.Username}");
        return Ok();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var u = await db.Usuarios.FindAsync(id);
        if (u is null) return NotFound();
        u.Activo = false;
        await db.SaveChangesAsync();
        sesiones.Invalidar(u.Id);
        await audit.RegistrarAsync("USUARIO_DESACTIVADO", $"usuario:{u.Username}");
        return NoContent();
    }
}

public record UsuarioCreateRequest(string Username, string Password, string? Nombre, string Rol);
public record UsuarioUpdateRequest(string? Nombre, string Rol, bool Activo);
public record PasswordRequest(string Password);
