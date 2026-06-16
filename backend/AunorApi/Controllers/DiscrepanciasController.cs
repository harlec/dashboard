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
