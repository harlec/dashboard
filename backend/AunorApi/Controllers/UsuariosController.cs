using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/usuarios")]
[Authorize(Roles = "admin")]
public class UsuariosController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.Usuarios
            .OrderBy(u => u.Username)
            .Select(u => new { u.Id, u.Username, u.Nombre, u.Rol, u.Activo, u.CreadoEn })
            .ToListAsync());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UsuarioCreateRequest req)
    {
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
        return Created($"/api/usuarios/{u.Id}", new { u.Id, u.Username, u.Nombre, u.Rol });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UsuarioUpdateRequest req)
    {
        var u = await db.Usuarios.FindAsync(id);
        if (u is null) return NotFound();
        u.Nombre = req.Nombre; u.Rol = req.Rol; u.Activo = req.Activo;
        await db.SaveChangesAsync();
        return Ok(new { u.Id, u.Username, u.Nombre, u.Rol, u.Activo });
    }

    [HttpPut("{id}/password")]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] PasswordRequest req)
    {
        var u = await db.Usuarios.FindAsync(id);
        if (u is null) return NotFound();
        u.Password = BCrypt.Net.BCrypt.HashPassword(req.Password);
        await db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var u = await db.Usuarios.FindAsync(id);
        if (u is null) return NotFound();
        u.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record UsuarioCreateRequest(string Username, string Password, string? Nombre, string Rol);
public record UsuarioUpdateRequest(string? Nombre, string Rol, bool Activo);
public record PasswordRequest(string Password);
