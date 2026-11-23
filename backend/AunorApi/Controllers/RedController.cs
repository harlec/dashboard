using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

// Monitoreo de saturación de enlaces WAN: estado actual, serie histórica y alertas.
// Las fechas salen como UTC con 'Z' (en BD son DateTime2 sin zona).
[ApiController]
[Route("api/red")]
[Authorize]
public class RedController(AppDbContext db, IConfiguration config) : ControllerBase
{
    static DateTime Utc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);
    static DateTime? Utc(DateTime? d) => d is null ? null : Utc(d.Value);

    // Una muestra más vieja que esto = el enlace se considera sin datos
    int MuestraVencidaSeg => config.GetValue("NetMon:IntervalSeconds", 60) * 3;

    [HttpGet("estado")]
    public async Task<IActionResult> Estado(CancellationToken ct)
    {
        var links = await db.NetLinks.Include(l => l.Device)
            .Where(l => l.Device.Activo).OrderBy(l => l.Device.Sitio).ThenBy(l => l.Interfaz).ToListAsync(ct);

        var ids = links.Select(l => l.Id).ToList();
        var abiertas = await db.NetAlerts.Where(a => ids.Contains(a.LinkId) && a.FinUtc == null).ToListAsync(ct);

        var ultimas = new Dictionary<int, NetSample>();
        foreach (var id in ids)
        {
            var s = await db.NetSamples.Where(x => x.LinkId == id).OrderByDescending(x => x.TsUtc).FirstOrDefaultAsync(ct);
            if (s is not null) ultimas[id] = s;
        }

        var ahora = DateTime.UtcNow;
        var res = links.Select(l =>
        {
            ultimas.TryGetValue(l.Id, out var s);
            var saturacion = abiertas.FirstOrDefault(a => a.LinkId == l.Id && a.Tipo == NetAlert.Saturacion);
            var sinDatosAlerta = abiertas.Any(a => a.LinkId == l.Id && a.Tipo == NetAlert.SinDatos);
            var vencida = s is null || (ahora - s.TsUtc).TotalSeconds > MuestraVencidaSeg;
            double? util = s is null || (s.UtilInPct is null && s.UtilOutPct is null)
                ? null : Math.Max(s.UtilInPct ?? 0, s.UtilOutPct ?? 0);

            // Semáforo: sin_datos > critico > warn > ok. Los informativos (sin umbral) → info.
            var estado = vencida || sinDatosAlerta ? "sin_datos"
                : !l.MedirAlerta || util is null ? "info"
                : util >= l.UmbralCritPct ? "critico"
                : util >= l.UmbralWarnPct ? "warn" : "ok";

            return new
            {
                l.Id, sitio = l.Device.Sitio, dispositivo = l.Device.Nombre, l.Interfaz, l.Zona, l.Rol,
                l.MbpsContratadoIn, l.MbpsContratadoOut, l.UmbralWarnPct, l.UmbralCritPct, l.MedirAlerta,
                estado,
                ts = s is null ? (DateTime?)null : Utc(s.TsUtc),
                inMbps  = s is null ? (double?)null : s.InBps  / 1e6,
                outMbps = s is null ? (double?)null : s.OutBps / 1e6,
                utilInPct = s?.UtilInPct, utilOutPct = s?.UtilOutPct,
                alertaSaturacion = saturacion is null ? null : new { inicio = Utc(saturacion.InicioUtc), pico = saturacion.ValorMaxPct },
                alertaSinDatos = sinDatosAlerta,
            };
        });
        return Ok(res);
    }

    // rango: 1h | 24h | 7d. Los rangos largos se promedian por cubos para no mandar miles de puntos.
    [HttpGet("serie")]
    public async Task<IActionResult> Serie([FromQuery] int linkId, [FromQuery] string rango = "1h", CancellationToken ct = default)
    {
        var (horas, cuboMin) = rango switch { "24h" => (24, 5), "7d" => (168, 30), _ => (1, 1) };
        var desde = DateTime.UtcNow.AddHours(-horas);

        var filas = await db.NetSamples.Where(s => s.LinkId == linkId && s.TsUtc >= desde)
            .OrderBy(s => s.TsUtc).ToListAsync(ct);

        var puntos = filas
            .GroupBy(s => new DateTime(s.TsUtc.Ticks - s.TsUtc.Ticks % TimeSpan.FromMinutes(cuboMin).Ticks))
            .Select(g => new
            {
                ts = Utc(g.Key),
                inMbps  = g.Average(x => x.InBps)  / 1e6,
                outMbps = g.Average(x => x.OutBps) / 1e6,
                utilInPct  = g.Any(x => x.UtilInPct  != null) ? g.Average(x => x.UtilInPct)  : null,
                utilOutPct = g.Any(x => x.UtilOutPct != null) ? g.Average(x => x.UtilOutPct) : null,
            });
        return Ok(puntos);
    }

    [HttpGet("alertas")]
    public async Task<IActionResult> Alertas([FromQuery] int dias = 30, CancellationToken ct = default)
    {
        var desde = DateTime.UtcNow.AddDays(-Math.Clamp(dias, 1, 365));
        var lista = await db.NetAlerts.Include(a => a.Link).ThenInclude(l => l.Device)
            .Where(a => a.InicioUtc >= desde || a.FinUtc == null)
            .OrderByDescending(a => a.InicioUtc).Take(200)
            .Select(a => new
            {
                a.Id, a.LinkId, enlace = a.Link.Device.Sitio + " " + a.Link.Rol, a.Link.Interfaz,
                a.Tipo, a.Severidad, a.InicioUtc, a.FinUtc, a.ValorMaxPct,
            }).ToListAsync(ct);

        return Ok(lista.Select(a => new
        {
            a.Id, a.LinkId, a.enlace, a.Interfaz, a.Tipo, a.Severidad,
            inicio = Utc(a.InicioUtc), fin = Utc(a.FinUtc), pico = a.ValorMaxPct,
        }));
    }
}
