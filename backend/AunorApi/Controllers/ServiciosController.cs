using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/servicios")]
[Authorize]
public class ServiciosController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var result = await db.Servicios
            .Where(s => s.Activo)
            .OrderBy(s => s.Nombre)
            .Select(s => new { s.Id, s.Nombre, s.Descripcion, s.Activo })
            .ToListAsync();
        return Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] ServicioRequest req)
    {
        var s = new Servicio { Nombre = req.Nombre, Descripcion = req.Descripcion };
        db.Servicios.Add(s);
        await db.SaveChangesAsync();
        return Created($"/api/servicios/{s.Id}", s);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromBody] ServicioRequest req)
    {
        var s = await db.Servicios.FindAsync(id);
        if (s is null) return NotFound();
        s.Nombre = req.Nombre; s.Descripcion = req.Descripcion;
        await db.SaveChangesAsync();
        return Ok(s);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var s = await db.Servicios.FindAsync(id);
        if (s is null) return NotFound();
        s.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

[ApiController]
[Route("api/servicio-checks")]
[Authorize]
public class ServicioChecksController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int? servicioId)
    {
        var q = db.ServicioChecks.Where(c => c.Activo);
        if (servicioId.HasValue) q = q.Where(c => c.ServicioId == servicioId);

        var result = await q
            .OrderBy(c => c.Servicio.Nombre).ThenBy(c => c.Nombre)
            .Select(c => new {
                c.Id, c.ServicioId, c.Nombre, c.TipoCheck, c.Host, c.Puerto, c.Ubicacion,
                c.Monitorear, c.Activo,
                c.UltimoEstado, c.UltimaLatenciaMs, c.UltimoCheckEn,
                servicio = new { c.Servicio.Id, c.Servicio.Nombre },
            })
            .ToListAsync();

        return Ok(result);
    }

    // Historial crudo de un check — para "llamarlo cuando lo necesite" sin tener
    // que consultar la BD directamente.
    [HttpGet("{id}/historial")]
    public async Task<IActionResult> Historial(int id, [FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
    {
        var d = desde ?? DateTime.Now.AddDays(-7);
        var h = hasta ?? DateTime.Now;

        var logs = await db.ServicioCheckLogs
            .Where(l => l.ServicioCheckId == id && l.Timestamp >= d && l.Timestamp <= h)
            .OrderByDescending(l => l.Timestamp)
            .Select(l => new { l.Timestamp, l.Estado, l.LatenciaMs, l.Detalle })
            .ToListAsync();

        var incidentes = await db.ServicioIncidentes
            .Where(i => i.ServicioCheckId == id && i.Inicio <= h && (i.Fin == null || i.Fin >= d))
            .OrderByDescending(i => i.Inicio)
            .Select(i => new { i.Inicio, i.Fin, i.DuracionMin, i.DetalleEstado })
            .ToListAsync();

        return Ok(new { logs, incidentes });
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] ServicioCheckRequest req)
    {
        var c = new ServicioCheck
        {
            ServicioId  = req.ServicioId,
            Nombre      = req.Nombre,
            TipoCheck   = req.TipoCheck,
            Host        = req.Host,
            Puerto      = req.Puerto,
            Ubicacion   = req.Ubicacion,
            Monitorear  = req.Monitorear,
        };
        db.ServicioChecks.Add(c);
        await db.SaveChangesAsync();
        return Created($"/api/servicio-checks/{c.Id}", c);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromBody] ServicioCheckRequest req)
    {
        var c = await db.ServicioChecks.FindAsync(id);
        if (c is null) return NotFound();
        c.ServicioId = req.ServicioId; c.Nombre = req.Nombre; c.TipoCheck = req.TipoCheck;
        c.Host = req.Host; c.Puerto = req.Puerto; c.Ubicacion = req.Ubicacion;
        c.Monitorear = req.Monitorear;
        await db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var c = await db.ServicioChecks.FindAsync(id);
        if (c is null) return NotFound();
        c.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record ServicioRequest(string Nombre, string? Descripcion);

public record ServicioCheckRequest(
    int ServicioId, string Nombre, string TipoCheck,
    string Host, int? Puerto, string? Ubicacion, bool Monitorear);
