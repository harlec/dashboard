using AunorApi.Data;
using AunorApi.DTOs;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

public class ReporteService(IConnectionStringProvider cs)
{
    public async Task<List<SlaEquipoDto>> ComputeSlaAsync(
        DateTime desde, DateTime hasta, bool soloCriticos = false, int? estacionId = null, CancellationToken ct = default)
    {
        using var db = NewDb();
        var totalMin = (int)(hasta - desde).TotalMinutes;

        var query = db.Equipos
            .Include(e => e.TipoEquipo)
            .Include(e => e.Via).ThenInclude(v => v.Estacion)
            .Where(e => e.Activo && e.Monitorear);

        if (soloCriticos) query = query.Where(e => e.EsCritico);
        if (estacionId.HasValue) query = query.Where(e => e.Via.EstacionId == estacionId);

        var equipos = await query.ToListAsync(ct);
        var result = new List<SlaEquipoDto>();

        foreach (var eq in equipos)
        {
            // Traemos TODOS los incidentes del período (no solo "Real") porque el motivo de
            // uno justificado (Mantenimiento/ReinicioForzado) también debe verse en el reporte;
            // solo el downMin que afecta el uptime se calcula exclusivamente sobre los "Real".
            var incidentes = await db.Incidentes
                .Where(i => i.EquipoId == eq.Id && i.Inicio <= hasta
                    && (i.Fin == null || i.Fin >= desde))
                .Select(i => new { i.Inicio, i.Fin, i.Motivo, i.Tipo })
                .ToListAsync(ct);

            // Solo excluye del uptime las caídas explícitamente autorizadas/planeadas.
            // "Otro" (p.ej. falla de hardware confirmada) sí sigue contando — el equipo
            // realmente no estuvo disponible aunque alguien haya anotado la causa.
            var downMin = incidentes.Where(i => i.Tipo is not ("Mantenimiento" or "ReinicioForzado")).Sum(i =>
                Math.Min(
                    (int)(((DateTime)(i.Fin ?? hasta)) - (i.Inicio < desde ? desde : i.Inicio)).TotalMinutes,
                    totalMin));

            var motivos = string.Join("; ", incidentes
                .Select(i => i.Motivo).Where(m => !string.IsNullOrWhiteSpace(m)).Distinct());

            var uptime = totalMin > 0
                ? Math.Round(100m - (decimal)downMin / totalMin * 100, 2)
                : 100m;

            result.Add(new SlaEquipoDto(
                eq.Id, eq.Nombre, eq.TipoEquipo.Nombre,
                eq.Via.EstacionId, eq.Via.Estacion.Nombre, eq.Via.Numero,
                uptime, totalMin, downMin, string.IsNullOrEmpty(motivos) ? null : motivos));
        }

        return result.OrderBy(r => r.Estacion).ThenBy(r => r.Via).ThenBy(r => r.Nombre).ToList();
    }

    public async Task<List<SlaEstacionDto>> ComputeSlaPorEstacionAsync(
        DateTime desde, DateTime hasta, bool soloCriticos = false, CancellationToken ct = default)
    {
        var equipos = await ComputeSlaAsync(desde, hasta, soloCriticos, null, ct);
        return equipos
            .GroupBy(e => new { e.EstacionId, e.Estacion })
            .Select(g => new SlaEstacionDto(
                g.Key.EstacionId, g.Key.Estacion,
                Math.Round(g.Average(e => e.UptimePct), 2), g.Count()))
            .OrderBy(g => g.Estacion)
            .ToList();
    }

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs.ConnectionString).Options);
}
