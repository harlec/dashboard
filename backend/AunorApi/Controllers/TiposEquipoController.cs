using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/tipos-equipo")]
[Authorize]
public class TiposEquipoController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.TiposEquipo.Where(t => t.Activo).OrderBy(t => t.Nombre).ToListAsync());

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] TipoEquipoRequest req)
    {
        var tipo = new TipoEquipo { Nombre = req.Nombre, Icono = req.Icono, Descripcion = req.Descripcion };
        db.TiposEquipo.Add(tipo);
        await db.SaveChangesAsync();
        return Created($"/api/tipos-equipo/{tipo.Id}", tipo);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromBody] TipoEquipoRequest req)
    {
        var tipo = await db.TiposEquipo.FindAsync(id);
        if (tipo is null) return NotFound();
        tipo.Nombre = req.Nombre; tipo.Icono = req.Icono; tipo.Descripcion = req.Descripcion;
        await db.SaveChangesAsync();
        return Ok(tipo);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var tipo = await db.TiposEquipo.FindAsync(id);
        if (tipo is null) return NotFound();
        tipo.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record TipoEquipoRequest(string Nombre, string? Icono, string? Descripcion);
