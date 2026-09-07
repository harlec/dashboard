using System.Security.Claims;
using AunorApi.Data;
using AunorApi.DTOs;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/mantenimiento")]
[Authorize]
public class MantenimientoController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool soloActivos = false)
    {
        var ahora = DateTime.Now;
        var items = await db.Mantenimientos
            .OrderByDescending(m => m.Desde)
            .ToListAsync();

        if (soloActivos)
            items = items.Where(m => m.Desde <= ahora && m.Hasta >= ahora).ToList();

        var estaciones = await db.Estaciones.ToDictionaryAsync(e => e.Id, e => e.Nombre);
        var vias = await db.Vias.ToDictionaryAsync(v => v.Id, v => v.Numero);
        var equipos = await db.Equipos.ToDictionaryAsync(e => e.Id, e => e.Nombre);

        var result = items.Select(m => new MantenimientoDto(
            m.Id,
            m.EstacionId, m.EstacionId.HasValue ? estaciones.GetValueOrDefault(m.EstacionId.Value) : null,
            m.ViaId, m.ViaId.HasValue ? vias.GetValueOrDefault(m.ViaId.Value) : null,
            m.EquipoId, m.EquipoId.HasValue ? equipos.GetValueOrDefault(m.EquipoId.Value) : null,
            m.Desde, m.Hasta, m.Motivo, m.CreadoPor, m.CreadoEn));

        return Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] MantenimientoRequest req)
    {
        var alcances = new[] { req.EstacionId, req.ViaId, req.EquipoId }.Count(x => x.HasValue);
        if (alcances != 1)
            return BadRequest(new { error = "Debe indicar exactamente uno: estacionId, viaId o equipoId" });
        if (string.IsNullOrWhiteSpace(req.Motivo))
            return BadRequest(new { error = "El motivo es obligatorio" });

        var desde = DateTime.Now;
        var hasta = req.Hasta ?? desde.AddHours(req.Horas ?? 2);
        if (hasta <= desde)
            return BadRequest(new { error = "La hora de fin debe ser posterior a ahora" });

        var mtto = new Mantenimiento
        {
            EstacionId = req.EstacionId,
            ViaId      = req.ViaId,
            EquipoId   = req.EquipoId,
            Desde      = desde,
            Hasta      = hasta,
            Motivo     = req.Motivo,
            CreadoPor  = User.FindFirstValue(ClaimTypes.Name) ?? "?",
            CreadoEn   = desde,
        };
        db.Mantenimientos.Add(mtto);
        await db.SaveChangesAsync();
        return Created($"/api/mantenimiento/{mtto.Id}", mtto);
    }

    [HttpPut("{id}/terminar")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Terminar(int id)
    {
        var mtto = await db.Mantenimientos.FindAsync(id);
        if (mtto is null) return NotFound();
        if (mtto.Hasta > DateTime.Now) mtto.Hasta = DateTime.Now;
        await db.SaveChangesAsync();
        return Ok(mtto);
    }
}

public record MantenimientoRequest(int? EstacionId, int? ViaId, int? EquipoId, DateTime? Hasta, int? Horas, string Motivo);
