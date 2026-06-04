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
    public async Task<IActionResult> Resumen([FromQuery] int horas = 8)
    {
        horas = horas is 1 or 4 or 8 or 12 ? horas : 8;
        return Ok(await svc.GetResumenAsync(horas));
    }

    [HttpGet("detalle")]
    public async Task<IActionResult> Detalle(
        [FromQuery] int    horas     = 8,
        [FromQuery] string? estacion = null,
        [FromQuery] string? placa    = null,
        [FromQuery] int    pagina    = 1,
        [FromQuery] int    porPagina = 50)
    {
        horas     = horas is 1 or 4 or 8 or 12 ? horas : 8;
        pagina    = Math.Max(1, pagina);
        porPagina = Math.Clamp(porPagina, 10, 100);
        return Ok(await svc.GetDetalleAsync(horas, estacion, placa, pagina, porPagina));
    }
}
