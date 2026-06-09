using AunorApi.Data;
using AunorApi.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/incidentes")]
[Authorize]
public class IncidentesController(AppDbContext db) : ControllerBase
{
    [HttpGet("resumen")]
    public async Task<IActionResult> Resumen([FromQuery] int dias = 7)
    {
        dias = Math.Clamp(dias, 1, 90);
        var desde = DateTime.Now.AddDays(-dias);

        var raw = await db.Incidentes
            .Where(i => i.Inicio >= desde)
            .Select(i => new {
                Estacion = i.Equipo.Via.Estacion.Nombre,
                Via      = i.Equipo.Via.Numero,
                Inicio   = i.Inicio,
            }).ToListAsync();

        int activos = await db.Incidentes.CountAsync(i => i.Fin == null);

        var porEstacion = raw
            .GroupBy(x => x.Estacion)
            .Select(g => new EstacionIncDto(g.Key, g.Count()))
            .OrderByDescending(x => x.Total)
            .ToList();

        var topVias = raw
            .GroupBy(x => new { x.Via, x.Estacion })
            .Select(g => new ViaIncDto(g.Key.Via, g.Key.Estacion, g.Count()))
            .OrderByDescending(x => x.Total)
            .Take(10)
            .ToList();

        // Para 1 día: agrupar por hora; para el resto: por día
        List<TendenciaIncDto> tendencia;
        if (dias == 1)
        {
            tendencia = raw
                .GroupBy(x => new DateTime(x.Inicio.Year, x.Inicio.Month, x.Inicio.Day, x.Inicio.Hour, 0, 0))
                .OrderBy(g => g.Key)
                .Select(g => new TendenciaIncDto(g.Key.ToString("HH:mm"), g.Count()))
                .ToList();
        }
        else
        {
            tendencia = raw
                .GroupBy(x => x.Inicio.Date)
                .OrderBy(g => g.Key)
                .Select(g => new TendenciaIncDto(g.Key.ToString("dd/MM"), g.Count()))
                .ToList();
        }

        return Ok(new IncidenteResumenDto(raw.Count, activos, porEstacion, topVias, tendencia));
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int?      equipoId     = null,
        [FromQuery] string?   estacion     = null,
        [FromQuery] DateTime? desde        = null,
        [FromQuery] DateTime? hasta        = null,
        [FromQuery] bool      soloAbiertos = false,
        [FromQuery] int       page         = 1,
        [FromQuery] int       pageSize     = 50)
    {
        var q = db.Incidentes
            .Include(i => i.Equipo).ThenInclude(e => e.Via).ThenInclude(v => v.Estacion)
            .Include(i => i.Equipo).ThenInclude(e => e.TipoEquipo)
            .AsQueryable();

        if (equipoId.HasValue)              q = q.Where(i => i.EquipoId == equipoId);
        if (!string.IsNullOrEmpty(estacion)) q = q.Where(i => i.Equipo.Via.Estacion.Nombre == estacion);
        if (soloAbiertos)                   q = q.Where(i => i.Fin == null);
        if (desde.HasValue)                 q = q.Where(i => i.Inicio >= desde);
        if (hasta.HasValue)                 q = q.Where(i => i.Inicio <= hasta);

        var total = await q.CountAsync();
        var items = await q
            .OrderByDescending(i => i.Inicio)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new IncidenteDto(
                i.Id, i.EquipoId,
                i.Equipo.Nombre,
                i.Equipo.Via.Estacion.Nombre,
                i.Equipo.Via.Numero,
                i.Inicio, i.Fin, i.DuracionMin))
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }
}
