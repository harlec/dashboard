using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/vias")]
[Authorize]
public class ViasController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int? estacionId)
    {
        var q = db.Vias.Where(v => v.Activo);
        if (estacionId.HasValue) q = q.Where(v => v.EstacionId == estacionId);

        var result = await q
            .OrderBy(v => v.Estacion.Nombre)
            .ThenBy(v => v.Numero)
            .Select(v => new {
                v.Id, v.EstacionId, v.Numero, v.Nombre, v.Activo,
                estacion = new { v.Estacion.Id, v.Estacion.Nombre }
            })
            .ToListAsync();

        return Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] ViaRequest req)
    {
        var via = new Via { EstacionId = req.EstacionId, Numero = req.Numero, Nombre = req.Nombre };
        db.Vias.Add(via);
        await db.SaveChangesAsync();
        return Created($"/api/vias/{via.Id}", via);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromBody] ViaRequest req)
    {
        var via = await db.Vias.FindAsync(id);
        if (via is null) return NotFound();
        via.EstacionId = req.EstacionId; via.Numero = req.Numero; via.Nombre = req.Nombre;
        await db.SaveChangesAsync();
        return Ok(via);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var via = await db.Vias.FindAsync(id);
        if (via is null) return NotFound();
        via.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record ViaRequest(int EstacionId, string Numero, string? Nombre);
