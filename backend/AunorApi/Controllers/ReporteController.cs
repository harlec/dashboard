using AunorApi.Data;
using AunorApi.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/reporte")]
[Authorize]
public class ReporteController(AppDbContext db) : ControllerBase
{
    [HttpGet("sla")]
    public async Task<IActionResult> Sla(
        [FromQuery] int? estacionId,
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta)
    {
        var desdeDate = desde ?? DateTime.UtcNow.AddDays(-30);
        var hastaDate = hasta ?? DateTime.UtcNow;
        var totalMin  = (int)(hastaDate - desdeDate).TotalMinutes;

        var equipos = await db.Equipos
            .Include(e => e.TipoEquipo)
            .Include(e => e.Via).ThenInclude(v => v.Estacion)
            .Where(e => e.Activo && e.Monitorear
                && (estacionId == null || e.Via.EstacionId == estacionId))
            .ToListAsync();

        var result = new List<SlaEquipoDto>();

        foreach (var eq in equipos)
        {
            var downMin = await db.Incidentes
                .Where(i => i.EquipoId == eq.Id && i.Inicio <= hastaDate
                    && (i.Fin == null || i.Fin >= desdeDate))
                .SumAsync(i =>
                    Math.Min(
                        (int)(((DateTime)(i.Fin ?? hastaDate)) - (i.Inicio < desdeDate ? desdeDate : i.Inicio)).TotalMinutes,
                        totalMin));

            var uptime = totalMin > 0
                ? Math.Round(100m - (decimal)downMin / totalMin * 100, 2)
                : 100m;

            result.Add(new SlaEquipoDto(
                eq.Id, eq.Nombre, eq.TipoEquipo.Nombre,
                eq.Via.Numero, uptime, totalMin, downMin));
        }

        return Ok(result.OrderBy(r => r.Via).ThenBy(r => r.Nombre));
    }
}
