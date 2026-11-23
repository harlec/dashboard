using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/transitos")]
[Authorize]
public class TransitosController(TransitosViaService svc, ReportePdfService pdf) : ControllerBase
{
    // Catálogo de vías (estación + número + nombre) para el selector.
    [HttpGet("vias")]
    public async Task<IActionResult> Vias() => Ok(await svc.GetViasAsync());

    [HttpGet("via")]
    public async Task<IActionResult> Via(
        [FromQuery] string estacion, [FromQuery] int via,
        [FromQuery] string periodo = "30m", [FromQuery] int limite = 50,
        [FromQuery] string? desde = null, [FromQuery] string? hasta = null,
        [FromQuery] bool soloCobro = true)
    {
        if (TransitosViaService.CoestDe(estacion) is null) return BadRequest("estacion inválida");
        if (!TransitosViaService.EsPeriodoValido(periodo)) periodo = "30m";
        limite = Math.Clamp(limite, 10, 200);
        DateTime? d = null, h = null;
        if (periodo == "rango")
        {
            if (!DiscrepanciasService.TryRango(desde, hasta, out var dd, out var hh)) return BadRequest("rango inválido");
            d = dd; h = hh;
        }
        return Ok(await svc.GetViaAsync(estacion, via, periodo, limite, d, h, soloCobro));
    }

    // Exporta TODOS los tránsitos de la vía en el período (no solo los 50 de pantalla).
    // Excel hasta 100 000 renglones; el PDF se limita a 3 000 porque más páginas no se leen.
    [HttpGet("via/exportar")]
    public async Task<IActionResult> Exportar(
        [FromQuery] string estacion, [FromQuery] int via,
        [FromQuery] string periodo = "30m", [FromQuery] string formato = "xlsx",
        [FromQuery] string? desde = null, [FromQuery] string? hasta = null,
        [FromQuery] bool soloCobro = true)
    {
        if (TransitosViaService.CoestDe(estacion) is null) return BadRequest("estacion inválida");
        if (!TransitosViaService.EsPeriodoValido(periodo)) return BadRequest("periodo inválido");
        formato = formato.ToLowerInvariant();
        if (formato is not ("xlsx" or "pdf")) return BadRequest("formato inválido");
        DateTime? d = null, h = null;
        if (periodo == "rango")
        {
            if (!DiscrepanciasService.TryRango(desde, hasta, out var dd, out var hh)) return BadRequest("rango inválido");
            d = dd; h = hh;
        }

        int tope = formato == "pdf" ? 3_000 : 100_000;
        var data = await svc.GetViaAsync(estacion, via, periodo, tope, d, h, soloCobro);
        bool truncado = data.Total > data.Ultimos.Count;

        var subtitulo = $"Período: {PeriodoTxt(periodo, d, h)}   ·   Generado: {DateTime.Now:dd/MM/yyyy HH:mm}";
        var nombre = $"transitos_{data.Estacion}_{data.Via}_{periodo}_{DateTime.Now:yyyyMMddHHmm}"
            .Replace(' ', '_');

        if (formato == "pdf")
            return File(pdf.GenerarTransitosVia(data, subtitulo, truncado), "application/pdf", nombre + ".pdf");

        return File(TransitosViaExport.Xlsx(data, subtitulo, truncado),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nombre + ".xlsx");
    }

    private static string PeriodoTxt(string p, DateTime? d, DateTime? h) => p switch {
        "15m" => "últimos 15 minutos", "30m" => "últimos 30 minutos", "1h" => "última hora",
        "4h" => "últimas 4 horas", "12h" => "últimas 12 horas", "24h" => "últimas 24 horas",
        "ayer" => "ayer", "mes" => "mes actual", "mesant" => "mes anterior",
        "rango" when d != null && h != null => $"{d:dd/MM/yyyy} al {h.Value.AddDays(-1):dd/MM/yyyy}",
        _ => p,
    };
}
