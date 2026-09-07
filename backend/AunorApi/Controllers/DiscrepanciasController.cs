using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/discrepancias")]
[Authorize]
public class DiscrepanciasController(DiscrepanciasService svc) : ControllerBase
{
    [HttpGet("resumen")]
    public async Task<IActionResult> Resumen([FromQuery] string periodo = "12h")
    {
        if (!DiscrepanciasService.EsPeriodoValido(periodo)) periodo = "12h";
        return Ok(await svc.GetResumenAsync(periodo));
    }

    [HttpGet("analisis")]
    public async Task<IActionResult> Analisis() =>
        Ok(await svc.GetAnalisisAsync());

    [HttpGet("vias")]
    public async Task<IActionResult> Vias([FromQuery] string periodo = "24h")
    {
        if (!DiscrepanciasService.EsPeriodoValido(periodo)) periodo = "24h";
        return Ok(await svc.GetViasAsync(periodo));
    }

    [HttpGet("via-evolucion")]
    public async Task<IActionResult> ViaEvolucion(
        [FromQuery] string estacion, [FromQuery] string via, [FromQuery] int dias = 30)
    {
        if (string.IsNullOrWhiteSpace(estacion) || string.IsNullOrWhiteSpace(via))
            return BadRequest("estacion y via son requeridos");
        dias = Math.Clamp(dias, 7, 90);
        return Ok(await svc.GetViaEvolucionAsync(estacion, via, dias));
    }

    [HttpGet("via-pares")]
    public async Task<IActionResult> ViaPares(
        [FromQuery] string estacion, [FromQuery] string via,
        [FromQuery] string periodo = "12h", [FromQuery] int top = 3)
    {
        if (string.IsNullOrWhiteSpace(estacion) || string.IsNullOrWhiteSpace(via))
            return BadRequest("estacion y via son requeridos");
        if (!DiscrepanciasService.EsPeriodoValido(periodo)) periodo = "12h";
        top = Math.Clamp(top, 1, 10);
        return Ok(await svc.GetTopParesViaAsync(estacion, via, periodo, top));
    }

    [HttpGet("detalle")]
    public async Task<IActionResult> Detalle(
        [FromQuery] string  periodo   = "12h",
        [FromQuery] string? estacion  = null,
        [FromQuery] string? placa     = null,
        [FromQuery] int     pagina    = 1,
        [FromQuery] int     porPagina = 50)
    {
        if (!DiscrepanciasService.EsPeriodoValido(periodo)) periodo = "12h";
        pagina    = Math.Max(1, pagina);
        porPagina = Math.Clamp(porPagina, 10, 100);
        return Ok(await svc.GetDetalleAsync(periodo, estacion, placa, pagina, porPagina));
    }
}
