using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/ocr")]
[Authorize]
public class OcrPlacasController(OcrPlacasService svc) : ControllerBase
{
    [HttpGet("resumen")]
    public async Task<IActionResult> Resumen([FromQuery] string periodo = "24h", [FromQuery] bool soloPrepago = false)
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo))
            return BadRequest("Período inválido");
        return Ok(await svc.GetResumenAsync(periodo, soloPrepago));
    }

    [HttpGet("analisis")]
    public async Task<IActionResult> Analisis([FromQuery] bool soloPrepago = false)
        => Ok(await svc.GetAnalisisAsync(soloPrepago));

    [HttpGet("tendencias")]
    public async Task<IActionResult> Tendencias([FromQuery] bool soloPrepago = false)
        => Ok(await svc.GetTendenciasAsync(soloPrepago));

    [HttpGet("via-evolucion")]
    public async Task<IActionResult> ViaEvolucion(
        [FromQuery] string estacion, [FromQuery] string via, [FromQuery] int dias = 60, [FromQuery] bool soloPrepago = false)
    {
        if (string.IsNullOrWhiteSpace(estacion) || string.IsNullOrWhiteSpace(via))
            return BadRequest("estacion y via son obligatorios");
        dias = Math.Clamp(dias, 7, 180);
        return Ok(await svc.GetViaEvolucionAsync(estacion, via, dias, soloPrepago));
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
