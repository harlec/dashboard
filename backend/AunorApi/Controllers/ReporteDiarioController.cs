using AunorApi.Services.ReporteDiario;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/reporte-diario")]
[Authorize]
public class ReporteDiarioController(
    ReporteDiarioService reporte, ReporteDiarioEnvioService envio, ILogger<ReporteDiarioController> log) : ControllerBase
{
    // DTO del reporte (la vista web de React lo consume). corte opcional: fin de la ventana (yyyy-MM-ddTHH:mm).
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateTime? corte, CancellationToken ct)
    {
        try { return Ok(await reporte.GenerarAsync(corte, ct)); }
        catch (Exception ex) { log.LogError(ex, "Reporte diario: error generando"); return StatusCode(500, new { message = ex.Message }); }
    }

    // El mismo HTML del correo, para verlo en el navegador antes de mandarlo a nadie
    [HttpGet("preview")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Preview([FromQuery] DateTime? corte, CancellationToken ct)
    {
        try { return Content(await envio.PrevisualizarAsync(corte, ct), "text/html; charset=utf-8"); }
        catch (Exception ex) { log.LogError(ex, "Reporte diario: error en preview"); return StatusCode(500, new { message = ex.Message }); }
    }

    public record PruebaReq(string? Destinatarios, DateTime? Corte);

    // Prueba: envía SOLO a los correos indicados (no a la lista configurada)
    [HttpPost("enviar-prueba")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> EnviarPrueba([FromBody] PruebaReq req, CancellationToken ct)
    {
        var lista = ReporteDiarioEnvioService.ParseDestinatarios(req.Destinatarios);
        if (lista.Count == 0) return BadRequest(new { ok = false, message = "Indica al menos un correo de destino para la prueba." });
        var (ok, message) = await envio.EnviarAsync(lista, req.Corte, ct);
        return ok ? Ok(new { ok, message }) : BadRequest(new { ok, message });
    }

    // Envía ahora a los destinatarios configurados (email_reporte_diario)
    [HttpPost("enviar")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Enviar(CancellationToken ct)
    {
        var (ok, message) = await envio.EnviarAConfiguradosAsync(ct);
        return ok ? Ok(new { ok, message }) : BadRequest(new { ok, message });
    }

    public record BackfillReq(int Dias = 30);

    // Recalcula los snapshots de los últimos N días (máx. 90) desde el consolidado
    [HttpPost("snapshots/backfill")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Backfill([FromBody] BackfillReq req, CancellationToken ct)
    {
        var dias = Math.Clamp(req.Dias, 1, 90);
        var cfg = await reporte.LeerConfigAsync(ct);
        var hasta = ReporteDiarioService.UltimoCorte(ReporteDiarioService.AhoraLima(), cfg.HoraCorte);
        var f = hasta.AddDays(-1).Add(-cfg.HoraCorte).Date;
        await reporte.RecalcularAsync(f.AddDays(-(dias - 1)), f, cfg.HoraCorte, ct);
        return Ok(new { ok = true, message = $"Snapshots recalculados: {dias} día(s) hasta {f:yyyy-MM-dd}." });
    }
}
