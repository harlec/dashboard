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
    public async Task<IActionResult> Resumen([FromQuery] string periodo = "24h")
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo))
            return BadRequest("Período inválido");
        return Ok(await svc.GetResumenAsync(periodo));
    }

    [HttpGet("analisis")]
    public async Task<IActionResult> Analisis()
        => Ok(await svc.GetAnalisisAsync());

    [HttpGet("detalle")]
    public async Task<IActionResult> Detalle(
        [FromQuery] string  periodo    = "24h",
        [FromQuery] string? estacion   = null,
        [FromQuery] string? placa      = null,
        [FromQuery] string? tipoError  = null,
        [FromQuery] int     pagina     = 1,
        [FromQuery] int     porPagina  = 50)
    {
        if (!OcrPlacasService.EsPeriodoValido(periodo))
            return BadRequest("Período inválido");
        porPagina = Math.Clamp(porPagina, 10, 200);
        pagina    = Math.Max(1, pagina);
        return Ok(await svc.GetDetalleAsync(periodo, estacion, placa, tipoError, pagina, porPagina));
    }
}
