using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/reporte")]
[Authorize]
public class ReporteController(
    ReporteService reporteService, ReporteSemanalService reporteSemanal,
    ILogger<ReporteController> log) : ControllerBase
{
    [HttpGet("sla")]
    public async Task<IActionResult> Sla(
        [FromQuery] int? estacionId,
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta)
    {
        var desdeDate = desde ?? DateTime.Now.AddDays(-30);
        var hastaDate = hasta ?? DateTime.Now;
        return Ok(await reporteService.ComputeSlaAsync(desdeDate, hastaDate, soloCriticos: false, estacionId: estacionId));
    }

    [HttpGet("sla/por-estacion")]
    public async Task<IActionResult> SlaPorEstacion([FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
    {
        var desdeDate = desde ?? DateTime.Now.AddDays(-30);
        var hastaDate = hasta ?? DateTime.Now;
        return Ok(await reporteService.ComputeSlaPorEstacionAsync(desdeDate, hastaDate));
    }

    [HttpGet("semanal-critico")]
    public async Task<IActionResult> SemanalCritico([FromQuery] DateTime? desde, [FromQuery] DateTime? hasta)
    {
        var hastaDate = hasta ?? DateTime.Now;
        var desdeDate = desde ?? hastaDate.AddDays(-7);
        return Ok(await reporteService.ComputeSlaAsync(desdeDate, hastaDate, soloCriticos: true));
    }

    [HttpPost("semanal-critico/test")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> SemanalCriticoTest()
    {
        try
        {
            var hasta = DateTime.Now;
            var desde = hasta.AddDays(-7);
            var (ok, message) = await reporteSemanal.EnviarAsync(desde, hasta);
            return ok ? Ok(new { ok, message }) : BadRequest(new { ok, message });
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error en prueba de reporte semanal");
            return StatusCode(500, new { ok = false, message = $"Error interno: {ex.Message}" });
        }
    }
}
