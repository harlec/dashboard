using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/equipos")]
[Authorize]
public class EquiposController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int? viaId)
    {
        var q = db.Equipos.Where(e => e.Activo);
        if (viaId.HasValue) q = q.Where(e => e.ViaId == viaId);

        var result = await q
            .OrderBy(e => e.Via.Estacion.Nombre)
            .ThenBy(e => e.Via.Numero)
            .ThenBy(e => e.Nombre)
            .Select(e => new {
                e.Id, e.ViaId, e.TipoEquipoId,
                e.Nombre, e.Ip, e.Descripcion,
                e.Monitorear, e.Activo,
                tipoEquipo = new { e.TipoEquipo.Id, e.TipoEquipo.Nombre },
                via = new {
                    e.Via.Id, e.Via.Numero,
                    estacion = new { e.Via.Estacion.Id, e.Via.Estacion.Nombre }
                }
            })
            .ToListAsync();

        return Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] EquipoRequest req)
    {
        var eq = new Equipo
        {
            ViaId         = req.ViaId,
            TipoEquipoId  = req.TipoEquipoId,
            Nombre        = req.Nombre,
            Ip            = req.Ip,
            Descripcion   = req.Descripcion,
            CheckPort     = req.CheckPort,
            Monitorear    = req.Monitorear
        };
        db.Equipos.Add(eq);
        await db.SaveChangesAsync();
        return Created($"/api/equipos/{eq.Id}", eq);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromBody] EquipoRequest req)
    {
        var eq = await db.Equipos.FindAsync(id);
        if (eq is null) return NotFound();
        eq.ViaId = req.ViaId; eq.TipoEquipoId = req.TipoEquipoId;
        eq.Nombre = req.Nombre; eq.Ip = req.Ip;
        eq.Descripcion = req.Descripcion; eq.CheckPort = req.CheckPort;
        eq.Monitorear = req.Monitorear;
        await db.SaveChangesAsync();
        return Ok(eq);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var eq = await db.Equipos.FindAsync(id);
        if (eq is null) return NotFound();
        eq.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record EquipoRequest(
    int ViaId, int TipoEquipoId, string Nombre,
    string Ip, string? Descripcion, string? CheckPort, bool Monitorear);
