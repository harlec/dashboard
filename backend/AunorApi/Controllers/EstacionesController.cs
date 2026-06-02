using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/estaciones")]
[Authorize]
public class EstacionesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.Estaciones.Where(e => e.Activo).OrderBy(e => e.Nombre).ToListAsync());

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] EstacionRequest req)
    {
        var est = new Estacion { Nombre = req.Nombre, Codigo = req.Codigo, Descripcion = req.Descripcion };
        db.Estaciones.Add(est);
        await db.SaveChangesAsync();
        return Created($"/api/estaciones/{est.Id}", est);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromBody] EstacionRequest req)
    {
        var est = await db.Estaciones.FindAsync(id);
        if (est is null) return NotFound();
        est.Nombre = req.Nombre; est.Codigo = req.Codigo; est.Descripcion = req.Descripcion;
        await db.SaveChangesAsync();
        return Ok(est);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var est = await db.Estaciones.FindAsync(id);
        if (est is null) return NotFound();
        est.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record EstacionRequest(string Nombre, string Codigo, string? Descripcion);
