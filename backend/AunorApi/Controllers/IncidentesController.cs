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
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int? equipoId,
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta,
        [FromQuery] bool soloAbiertos = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var q = db.Incidentes
            .Include(i => i.Equipo).ThenInclude(e => e.Via).ThenInclude(v => v.Estacion)
            .Include(i => i.Equipo).ThenInclude(e => e.TipoEquipo)
            .AsQueryable();

        if (equipoId.HasValue) q = q.Where(i => i.EquipoId == equipoId);
        if (soloAbiertos)      q = q.Where(i => i.Fin == null);
        if (desde.HasValue)    q = q.Where(i => i.Inicio >= desde);
        if (hasta.HasValue)    q = q.Where(i => i.Inicio <= hasta);

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
