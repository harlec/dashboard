using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/reporte")]
[Authorize]
public class ReporteController(
    ReporteService reporteService, ReporteSemanalService reporteSemanal, ReportePdfService reportePdf,
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

    [HttpGet("sla/csv")]
    public async Task<IActionResult> SlaCsv(
        [FromQuery] int? estacionId,
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta)
    {
        var desdeDate = desde ?? DateTime.Now.AddDays(-30);
        var hastaDate = hasta ?? DateTime.Now;
        var datos = await reporteService.ComputeSlaAsync(desdeDate, hastaDate, soloCriticos: false, estacionId: estacionId);

        var csv = CsvExport.Build(
            ["Equipo", "Tipo", "Estacion", "Via", "Uptime %", "Total Min", "Down Min", "Motivos"],
            datos.Select(d => new object?[] { d.Nombre, d.TipoNombre, d.Estacion, d.Via, d.UptimePct, d.TotalMin, d.DownMin, d.Motivos }));

        var nombre = $"sla_{desdeDate:yyyyMMdd}_{hastaDate:yyyyMMdd}.csv";
        return File(csv, "text/csv", nombre);
    }

    [HttpGet("sla/pdf")]
    public async Task<IActionResult> SlaPdf(
        [FromQuery] int? estacionId,
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta)
    {
        var desdeDate = desde ?? DateTime.Now.AddDays(-30);
        var hastaDate = hasta ?? DateTime.Now;
        var bytes = await reportePdf.GenerarSlaAsync(desdeDate, hastaDate, estacionId);
        var nombre = $"sla_{desdeDate:yyyyMMdd}_{hastaDate:yyyyMMdd}.pdf";
        return File(bytes, "application/pdf", nombre);
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
