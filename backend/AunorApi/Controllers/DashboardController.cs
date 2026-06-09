using AunorApi.Data;
using AunorApi.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController(AppDbContext db) : ControllerBase
{
    [HttpGet("live")]
    public async Task<IActionResult> Live()
    {
        var estaciones = await db.Estaciones
            .Where(e => e.Activo)
            .OrderBy(e => e.Nombre)
            .ToListAsync();

        var result = new List<EstacionLiveDto>();

        foreach (var est in estaciones)
        {
            var vias = await db.Vias
                .Where(v => v.EstacionId == est.Id && v.Activo)
                .OrderBy(v => v.Numero)
                .ToListAsync();

            var estData = new List<ViaLiveDto>();
            int total = 0, up = 0, down = 0, sin = 0;

            foreach (var via in vias)
            {
                var equipos = await db.Equipos
                    .Where(e => e.ViaId == via.Id && e.Activo)
                    .Include(e => e.TipoEquipo)
                    .OrderBy(e => e.TipoEquipo.Nombre).ThenBy(e => e.Nombre)
                    .ToListAsync();

                var eqDtos = new List<EquipoLiveDto>();
                foreach (var eq in equipos)
                {
                    var lastPing = await db.PingLogs
                        .Where(p => p.EquipoId == eq.Id)
                        .OrderByDescending(p => p.Timestamp)
                        .FirstOrDefaultAsync();

                    var incActivo = await db.Incidentes
                        .Where(i => i.EquipoId == eq.Id && i.Fin == null)
                        .OrderByDescending(i => i.Inicio)
                        .FirstOrDefaultAsync();

                    int? incMin = null;
                    if (incActivo != null)
                        incMin = (int)(DateTime.Now - incActivo.Inicio).TotalMinutes;

                    if (eq.Monitorear)
                    {
                        total++;
                        if (lastPing?.Estado == "UP")   up++;
                        else if (lastPing?.Estado == "DOWN") down++;
                        else sin++;
                    }

                    eqDtos.Add(new EquipoLiveDto(
                        eq.Id, eq.Nombre, eq.Ip,
                        eq.TipoEquipo.Nombre, eq.TipoEquipo.Icono,
                        lastPing?.Estado, lastPing?.LatenciaMs, lastPing?.Timestamp,
                        eq.Monitorear,
                        incActivo?.Inicio, incMin));
                }

                estData.Add(new ViaLiveDto(via.Id, via.Numero, via.Nombre, eqDtos));
            }

            result.Add(new EstacionLiveDto(est.Id, est.Nombre, est.Codigo, total, up, down, sin, estData));
        }

        var kpiRaw = await db.Equipos
            .Where(e => e.Activo && e.Monitorear)
            .Select(e => new {
                Estado = db.PingLogs
                    .Where(p => p.EquipoId == e.Id)
                    .OrderByDescending(p => p.Timestamp)
                    .Select(p => p.Estado)
                    .FirstOrDefault()
            }).ToListAsync();

        int kTotal = kpiRaw.Count;
        int kUps   = kpiRaw.Count(x => x.Estado == "UP");
        int kDowns = kpiRaw.Count(x => x.Estado == "DOWN");
        int kSin   = kpiRaw.Count(x => x.Estado == null);
        int kInc   = await db.Incidentes.CountAsync(i => i.Fin == null);
        int uptime = kTotal > 0 ? (int)Math.Round((double)kUps / kTotal * 100) : 0;

        var kpis = new KpiDto(kTotal, kUps, kDowns, kSin, kInc, uptime);
        return Ok(new LiveDashboardDto(kpis, result));
    }

    [HttpGet("equipo/{id}")]
    public async Task<IActionResult> EquipoDetail(int id)
    {
        var eq = await db.Equipos
            .Include(e => e.TipoEquipo)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (eq is null) return NotFound();

        var lastPing = await db.PingLogs
            .Where(p => p.EquipoId == id)
            .OrderByDescending(p => p.Timestamp)
            .FirstOrDefaultAsync();

        var incActivo = await db.Incidentes
            .Where(i => i.EquipoId == id && i.Fin == null)
            .FirstOrDefaultAsync();

        int? incMin = incActivo is null ? null
            : (int)(DateTime.Now - incActivo.Inicio).TotalMinutes;

        var hist = await db.PingLogs
            .Where(p => p.EquipoId == id)
            .OrderByDescending(p => p.Timestamp)
            .Take(50)
            .Select(p => new PingHistDto(p.Timestamp, p.Estado, p.LatenciaMs))
            .ToListAsync();

        return Ok(new EquipoDetailDto(
            eq.Id, eq.Nombre, eq.Ip, eq.TipoEquipo.Nombre,
            lastPing?.Estado, lastPing?.LatenciaMs, lastPing?.Timestamp,
            incActivo?.Inicio, incMin, hist));
    }
}
