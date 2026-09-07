using AunorApi.Data;
using AunorApi.DTOs;
using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/incidentes")]
[Authorize]
public class IncidentesController(AppDbContext db, ReportePdfService pdf) : ControllerBase
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
                DuracionMin   = i.DuracionMin,
                DetalleEstado = i.DetalleEstado,
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

        var cerrados = raw.Where(x => x.DuracionMin.HasValue).ToList();
        int? mttr = cerrados.Count > 0
            ? (int)Math.Round(cerrados.Average(x => x.DuracionMin!.Value))
            : null;

        var porHoraCounts = raw.GroupBy(x => x.Inicio.Hour).ToDictionary(g => g.Key, g => g.Count());
        var porHora = Enumerable.Range(0, 24)
            .Select(h => new HoraIncDto(h, porHoraCounts.GetValueOrDefault(h)))
            .ToList();

        var porCausa = raw
            .Select(x => PingWorkerService.InterpretarDetalle(x.DetalleEstado) ?? "Sin diagnóstico")
            .GroupBy(c => c)
            .Select(g => new CausaIncDto(g.Key, g.Count()))
            .OrderByDescending(c => c.Total)
            .Take(8)
            .ToList();

        return Ok(new IncidenteResumenDto(raw.Count, activos, porEstacion, topVias, tendencia, mttr, porHora, porCausa));
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
        var itemsRaw = await q
            .OrderByDescending(i => i.Inicio)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new {
                i.Id, i.EquipoId,
                EquipoNombre = i.Equipo.Nombre,
                Estacion     = i.Equipo.Via.Estacion.Nombre,
                Via          = i.Equipo.Via.Numero,
                i.Inicio, i.Fin, i.DuracionMin,
                i.Tipo, i.Motivo, i.DetalleEstado,
            })
            .ToListAsync();

        var items = itemsRaw.Select(i => new IncidenteDto(
            i.Id, i.EquipoId, i.EquipoNombre, i.Estacion, i.Via,
            i.Inicio, i.Fin, i.DuracionMin, i.Tipo, i.Motivo,
            i.DetalleEstado, PingWorkerService.InterpretarDetalle(i.DetalleEstado)))
            .ToList();

        return Ok(new { total, page, pageSize, items });
    }

    [HttpGet("{id}/detalle")]
    public async Task<IActionResult> Detalle(int id)
    {
        var inc = await db.Incidentes
            .Include(i => i.Equipo).ThenInclude(e => e.Via).ThenInclude(v => v.Estacion)
            .FirstOrDefaultAsync(i => i.Id == id);
        if (inc is null) return NotFound();

        var equipo      = inc.Equipo;
        var viaId       = equipo.ViaId;
        var estacionId  = equipo.Via.EstacionId;
        var ventanaIni  = inc.Inicio.AddMinutes(-30);
        var ventanaFin  = (inc.Fin ?? DateTime.Now).AddMinutes(15);

        var pingRaw = await db.PingLogs
            .Where(p => p.EquipoId == inc.EquipoId && p.Timestamp >= ventanaIni && p.Timestamp <= ventanaFin)
            .OrderBy(p => p.Timestamp)
            .Take(200)
            .ToListAsync();
        var pingWindow = pingRaw
            .Select(p => new PingHistDto(p.Timestamp, p.Estado, p.LatenciaMs, p.DetalleEstado,
                PingWorkerService.InterpretarDetalle(p.DetalleEstado)))
            .ToList();

        // enlace_eventos.equipo_id es el equipo "sonda" de la estación en ese momento —
        // se filtra por estación, no por el equipo puntual del incidente.
        var enlaceRaw = await db.EnlaceEventos
            .Where(e => e.Equipo.Via.EstacionId == estacionId
                && e.Inicio <= ventanaFin
                && (e.Fin == null || e.Fin >= ventanaIni))
            .OrderBy(e => e.Inicio)
            .ToListAsync();
        var enlaceWindow = enlaceRaw
            .Select(e => new EnlaceEventoDto(e.Inicio, e.Fin, e.Enlace, e.LatenciaMs))
            .ToList();

        var relacionadosRaw = await db.Incidentes
            .Include(i => i.Equipo).ThenInclude(e => e.Via).ThenInclude(v => v.Estacion)
            .Where(i => i.Id != inc.Id
                && (i.Equipo.ViaId == viaId || i.Equipo.Via.EstacionId == estacionId)
                && i.Inicio <= ventanaFin
                && (i.Fin == null || i.Fin >= ventanaIni))
            .OrderBy(i => i.Inicio)
            .Take(50)
            .ToListAsync();
        var relacionados = relacionadosRaw
            .Select(i => new IncidenteDto(
                i.Id, i.EquipoId, i.Equipo.Nombre, i.Equipo.Via.Estacion.Nombre, i.Equipo.Via.Numero,
                i.Inicio, i.Fin, i.DuracionMin, i.Tipo, i.Motivo, i.DetalleEstado,
                PingWorkerService.InterpretarDetalle(i.DetalleEstado)))
            .ToList();

        // Causa: primero el detalle guardado en el propio incidente; si es viejo y no lo
        // tiene, se busca el ping DOWN más cercano al inicio como respaldo.
        var causa = PingWorkerService.InterpretarDetalle(inc.DetalleEstado)
            ?? pingRaw.Where(p => p.Estado == "DOWN" && p.Timestamp <= inc.Inicio.AddMinutes(1))
                .OrderByDescending(p => p.Timestamp)
                .Select(p => PingWorkerService.InterpretarDetalle(p.DetalleEstado))
                .FirstOrDefault();

        var incDto = new IncidenteDto(
            inc.Id, inc.EquipoId, equipo.Nombre, equipo.Via.Estacion.Nombre, equipo.Via.Numero,
            inc.Inicio, inc.Fin, inc.DuracionMin, inc.Tipo, inc.Motivo, inc.DetalleEstado, causa);

        return Ok(new IncidenteDetalleDto(incDto, causa, pingWindow, enlaceWindow, relacionados));
    }

    [HttpGet("csv")]
    public async Task<IActionResult> Csv(
        [FromQuery] int?      equipoId     = null,
        [FromQuery] string?   estacion     = null,
        [FromQuery] DateTime? desde        = null,
        [FromQuery] DateTime? hasta        = null,
        [FromQuery] bool      soloAbiertos = false)
    {
        var q = db.Incidentes
            .Include(i => i.Equipo).ThenInclude(e => e.Via).ThenInclude(v => v.Estacion)
            .AsQueryable();

        if (equipoId.HasValue)              q = q.Where(i => i.EquipoId == equipoId);
        if (!string.IsNullOrEmpty(estacion)) q = q.Where(i => i.Equipo.Via.Estacion.Nombre == estacion);
        if (soloAbiertos)                   q = q.Where(i => i.Fin == null);
        if (desde.HasValue)                 q = q.Where(i => i.Inicio >= desde);
        if (hasta.HasValue)                 q = q.Where(i => i.Inicio <= hasta);

        var items = await q
            .OrderByDescending(i => i.Inicio)
            .Take(100_000)
            .Select(i => new {
                i.Equipo.Nombre,
                Estacion = i.Equipo.Via.Estacion.Nombre,
                Via      = i.Equipo.Via.Numero,
                i.Inicio, i.Fin, i.DuracionMin, i.Tipo, i.Motivo
            })
            .ToListAsync();

        var csv = CsvExport.Build(
            ["Equipo", "Estacion", "Via", "Inicio", "Fin", "Duracion Min", "Tipo", "Motivo"],
            items.Select(i => new object?[] { i.Nombre, i.Estacion, i.Via, i.Inicio, i.Fin, i.DuracionMin, i.Tipo, i.Motivo }));

        var desdeDate = desde ?? items.LastOrDefault()?.Inicio ?? DateTime.Now;
        var hastaDate = hasta ?? DateTime.Now;
        var nombre = $"incidentes_{desdeDate:yyyyMMdd}_{hastaDate:yyyyMMdd}.csv";
        return File(csv, "text/csv", nombre);
    }

    [HttpGet("pdf")]
    public async Task<IActionResult> Pdf(
        [FromQuery] string?   estacion     = null,
        [FromQuery] DateTime? desde        = null,
        [FromQuery] DateTime? hasta        = null,
        [FromQuery] bool      soloAbiertos = false)
    {
        var desdeDate = desde ?? DateTime.Now.AddDays(-30);
        var hastaDate = hasta ?? DateTime.Now;
        var bytes = await pdf.GenerarIncidentesAsync(desdeDate, hastaDate, estacion, soloAbiertos);
        var nombre = $"incidentes_{desdeDate:yyyyMMdd}_{hastaDate:yyyyMMdd}.pdf";
        return File(bytes, "application/pdf", nombre);
    }

    private static readonly string[] TiposValidos = ["Real", "Mantenimiento", "ReinicioForzado", "Otro"];

    [HttpPut("etiquetar")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Etiquetar([FromBody] EtiquetarRequest req)
    {
        if (!TiposValidos.Contains(req.Tipo))
            return BadRequest(new { error = "Tipo inválido" });
        if (req.Ids is null || req.Ids.Count == 0)
            return BadRequest(new { error = "Debe indicar al menos un incidente" });

        var incidentes = await db.Incidentes.Where(i => req.Ids.Contains(i.Id)).ToListAsync();
        foreach (var inc in incidentes)
        {
            inc.Tipo   = req.Tipo;
            inc.Motivo = req.Motivo;
        }
        await db.SaveChangesAsync();
        return Ok(new { actualizados = incidentes.Count });
    }
}

public record EtiquetarRequest(List<int> Ids, string Tipo, string? Motivo);
