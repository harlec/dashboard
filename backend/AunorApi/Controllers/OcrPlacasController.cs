using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/ocr")]
[Authorize]
public class OcrPlacasController(OcrPlacasService svc, ReportePdfService pdf) : ControllerBase
{
    [HttpGet("resumen")]
    public async Task<IActionResult> Resumen([FromQuery] string periodo = "24h", [FromQuery] bool soloPrepago = false)
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo))
            return BadRequest("Período inválido");
        return Ok(await svc.GetResumenAsync(periodo, soloPrepago));
    }

    [HttpGet("transitos-mes")]
    public async Task<IActionResult> TransitosMes() => Ok(await svc.GetTransitosMesAsync());

    [HttpGet("mejores-vias")]
    public async Task<IActionResult> MejoresVias([FromQuery] string periodo = "24h", [FromQuery] bool soloPrepago = false)
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo))
            return BadRequest("Período inválido");
        return Ok(await svc.GetMejoresViasAsync(periodo, soloPrepago));
    }

    [HttpGet("todas-vias")]
    public async Task<IActionResult> TodasVias([FromQuery] string periodo = "24h", [FromQuery] bool soloPrepago = false)
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo))
            return BadRequest("Período inválido");
        return Ok(await svc.GetTodasViasAsync(periodo, soloPrepago));
    }

    // Vías con menos tránsitos que esto se marcan como "pocos datos" (misma regla que la pestaña)
    private const int PocosDatos = 30;

    private static string PeriodoTxt(string p) => p switch {
        "1h" => "última hora", "4h" => "últimas 4 horas", "12h" => "últimas 12 horas",
        "24h" => "últimas 24 horas", "ayer" => "ayer", "mes" => "mes en curso", _ => p,
    };

    // Exporta la tabla "Todas las Vías" tal como se ve en pantalla: mismo período, mismo orden y
    // mismo filtro de estación. formato = csv | xlsx | pdf
    [HttpGet("todas-vias/exportar")]
    public async Task<IActionResult> ExportarTodasVias(
        [FromQuery] string  formato     = "csv",
        [FromQuery] string  periodo     = "24h",
        [FromQuery] bool    soloPrepago = false,
        [FromQuery] string  orden       = "mejor",
        [FromQuery] string? estacion    = null)
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo)) return BadRequest("Período inválido");
        formato = formato.ToLowerInvariant();
        if (formato is not ("csv" or "xlsx" or "pdf")) return BadRequest("Formato inválido");

        var todas = await svc.GetTodasViasAsync(periodo, soloPrepago);
        var filas = (string.IsNullOrWhiteSpace(estacion) ? todas : todas.Where(v => v.Estacion == estacion).ToList());
        filas = (orden == "peor"
            ? filas.OrderByDescending(v => v.ScoreError).ThenByDescending(v => v.Total)
            : filas.OrderByDescending(v => v.ScoreAcierto).ThenByDescending(v => v.Total)).ToList();

        var ordenTxt = orden == "peor" ? "Peor → mejor (error mín. seguro)" : "Mejor → peor (acierto mín. seguro)";
        var subtitulo = $"Período: {PeriodoTxt(periodo)}   ·   Orden: {ordenTxt}   ·   Estación: {(string.IsNullOrWhiteSpace(estacion) ? "todas" : estacion)}" +
                        (soloPrepago ? "   ·   Solo prepago" : "") + $"   ·   Generado: {DateTime.Now:dd/MM/yyyy HH:mm}";
        var nombre = $"ocr_todas_las_vias_{periodo}_{(orden == "peor" ? "peor" : "mejor")}_{DateTime.Now:yyyyMMddHHmm}";

        string[] cab = ["Posición", "Vía", "Estación", "Tránsitos", "Aciertos", "No legibles", "Confusiones",
                        "Acierto %", "Acierto mín. seguro % (Wilson 95%)", "Error mín. seguro % (Wilson 95%)", "Observación"];

        if (formato == "pdf")
            return File(pdf.GenerarOcrTodasVias(filas, subtitulo, PocosDatos), "application/pdf", nombre + ".pdf");

        if (formato == "csv")
        {
            var csv = CsvExport.Build(cab, filas.Select((v, i) => new object?[] {
                i + 1, v.Via, v.Estacion, v.Total, v.Aciertos, v.NoReconocidas, v.Confusiones,
                v.Efectividad, v.ScoreAcierto, v.ScoreError, v.Total < PocosDatos ? "pocos datos" : "" }));
            return File(csv, "text/csv", nombre + ".csv");
        }

        return File(OcrTodasViasExport.Xlsx(filas, subtitulo, cab, PocosDatos),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nombre + ".xlsx");
    }

    [HttpGet("analisis")]
    public async Task<IActionResult> Analisis([FromQuery] bool soloPrepago = false)
        => Ok(await svc.GetAnalisisAsync(soloPrepago));

    [HttpGet("tendencias")]
    public async Task<IActionResult> Tendencias([FromQuery] bool soloPrepago = false)
        => Ok(await svc.GetTendenciasAsync(soloPrepago));

    [HttpGet("via-evolucion")]
    public async Task<IActionResult> ViaEvolucion(
        [FromQuery] string estacion, [FromQuery] string via, [FromQuery] int dias = 60, [FromQuery] bool soloPrepago = false, [FromQuery] int horas = 0)
    {
        if (string.IsNullOrWhiteSpace(estacion) || string.IsNullOrWhiteSpace(via))
            return BadRequest("estacion y via son obligatorios");
        dias = Math.Clamp(dias, 7, 180);
        // horas > 0: ventana corta con serie por hora (la pantalla usa 24)
        horas = horas > 0 ? Math.Clamp(horas, 1, 72) : 0;
        return Ok(await svc.GetViaEvolucionAsync(estacion, via, dias, soloPrepago, horas));
    }

    [HttpGet("detalle")]
    public async Task<IActionResult> Detalle(
        [FromQuery] string  periodo     = "24h",
        [FromQuery] string? estacion    = null,
        [FromQuery] string? placa       = null,
        [FromQuery] string? tipoError   = null,
        [FromQuery] int     pagina      = 1,
        [FromQuery] int     porPagina   = 50,
        [FromQuery] bool    soloPrepago = false)
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo))
            return BadRequest("Período inválido");
        porPagina = Math.Clamp(porPagina, 10, 200);
        pagina    = Math.Max(1, pagina);
        return Ok(await svc.GetDetalleAsync(periodo, estacion, placa, tipoError, pagina, porPagina, soloPrepago));
    }

    [HttpGet("csv")]
    public async Task<IActionResult> Csv(
        [FromQuery] string  periodo     = "24h",
        [FromQuery] string? estacion    = null,
        [FromQuery] string? placa       = null,
        [FromQuery] string? tipoError   = null,
        [FromQuery] bool    soloPrepago = false)
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo))
            return BadRequest("Período inválido");

        var detalle = await svc.GetDetalleAsync(periodo, estacion, placa, tipoError, 1, 100_000, soloPrepago);
        var csv = CsvExport.Build(
            ["Fecha", "Estacion", "Via", "Ticket", "Placa Cajero", "Placa OCR", "Tipo Error"],
            detalle.Items.Select(i => new object?[] { i.Fecha, i.Estacion, i.Via, i.Ticket, i.PlacaCajero, i.PlacaOcr, i.TipoError }));

        var nombre = $"ocr_placas_{periodo}_{DateTime.Now:yyyyMMddHHmm}.csv";
        return File(csv, "text/csv", nombre);
    }
}
