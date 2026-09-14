using AunorApi.Data;
using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

// Backend del armador de Reportes (3 pasos: qué reporte, qué filtros, qué vas a
// descargar). La descarga en sí reusa los endpoints csv/pdf que ya tiene cada
// pantalla (/incidentes/csv, /reporte/sla/csv, /discrepancias/csv, /ocr/csv) —
// este controller solo resuelve "tipos" y "estimar", que antes no existían.
[ApiController]
[Route("api/reportes")]
[Authorize]
public class ReportesController(
    AppDbContext db,
    DiscrepanciasService discrepanciasService,
    OcrPlacasService ocrService) : ControllerBase
{
    private static readonly Dictionary<string, string[]> Columnas = new()
    {
        ["incidentes"]    = ["Equipo", "Estacion", "Via", "Inicio", "Fin", "Duracion Min", "Tipo", "Motivo"],
        ["sla"]           = ["Equipo", "Tipo", "Estacion", "Via", "Uptime %", "Total Min", "Down Min", "Motivos"],
        ["discrepancias"] = ["Fecha", "Via", "Ticket", "Placa Tabulada", "Placa Detectada", "Tabulada",
                              "Cat Tabulada", "Detectada", "Cat Detectada", "Tipo Operacion", "Estacion", "Cobrador"],
        ["ocr"]           = ["Fecha", "Estacion", "Via", "Ticket", "Placa Cajero", "Placa OCR", "Tipo Error"],
    };

    private static readonly Dictionary<string, (string Nombre, string Desc)> Info = new()
    {
        ["incidentes"]    = ("Incidentes", "Caídas de equipos detectadas por el monitoreo — cuándo, cuánto y por qué."),
        ["sla"]           = ("Reporte SLA", "Disponibilidad (uptime) por equipo, vía y estación."),
        ["discrepancias"] = ("Discrepancias DAC", "Diferencias entre lo tabulado por el cobrador y la clasificación automática."),
        ["ocr"]           = ("OCR de Placas", "Efectividad de lectura de placas por cámara vs. lo tabulado."),
    };

    [HttpGet("tipos")]
    public IActionResult Tipos() =>
        Ok(Info.Select(kv => new { tipo = kv.Key, nombre = kv.Value.Nombre, descripcion = kv.Value.Desc }));

    [HttpGet("estimar")]
    public async Task<IActionResult> Estimar(
        [FromQuery] string  tipo,
        [FromQuery] DateTime? desde, [FromQuery] DateTime? hasta,
        [FromQuery] string? periodo,
        [FromQuery] string? estacion, [FromQuery] int? estacionId,
        [FromQuery] bool soloActivos = false,
        [FromQuery] bool soloPrepago = false,
        [FromQuery] string? tipoError = null)
    {
        if (!Columnas.TryGetValue(tipo, out var cols))
            return BadRequest(new { error = "Tipo de reporte inválido" });

        int filas;
        string? aviso = null;

        switch (tipo)
        {
            case "incidentes":
            {
                var desdeDate = desde ?? DateTime.Now.AddDays(-30);
                var hastaDate = hasta ?? DateTime.Now;
                var q = db.Incidentes
                    .Include(i => i.Equipo).ThenInclude(e => e.Via).ThenInclude(v => v.Estacion)
                    .Where(i => i.Inicio >= desdeDate && i.Inicio <= hastaDate);
                if (!string.IsNullOrEmpty(estacion)) q = q.Where(i => i.Equipo.Via.Estacion.Nombre == estacion);
                if (soloActivos) q = q.Where(i => i.Fin == null);

                var raw = await q.Select(i => new { i.Inicio, Estacion = i.Equipo.Via.Estacion.Nombre }).ToListAsync();
                filas = raw.Count;

                var enRafaga = raw
                    .GroupBy(x => new DateTime(x.Inicio.Year, x.Inicio.Month, x.Inicio.Day, x.Inicio.Hour, x.Inicio.Minute, 0))
                    .Where(g => g.Select(x => x.Estacion).Distinct().Count() >= 3)
                    .ToList();
                if (enRafaga.Count > 0)
                {
                    var agrupado = filas - enRafaga.Sum(g => g.Count()) + enRafaga.Count;
                    aviso = $"El período incluye ráfagas de red (varias estaciones cayendo el mismo minuto). " +
                            $"Agrupadas serían {agrupado:N0} eventos en vez de {filas:N0} filas — el CSV exporta el detalle crudo, fila por incidente.";
                }
                break;
            }
            case "sla":
            {
                var q = db.Equipos.Where(e => e.Activo && e.Monitorear);
                if (estacionId.HasValue) q = q.Where(e => e.Via.EstacionId == estacionId);
                filas = await q.CountAsync();
                break;
            }
            case "discrepancias":
            {
                var p = periodo ?? "24h";
                if (!DiscrepanciasService.EsPeriodoValido(p)) p = "24h";
                filas = (await discrepanciasService.GetDetalleAsync(p, estacion, null, 1, 1)).Total;
                break;
            }
            case "ocr":
            {
                var p = periodo ?? "24h";
                if (!OcrPlacasService.EsPeriodoValido(p)) p = "24h";
                filas = (await ocrService.GetDetalleAsync(p, estacion, null, tipoError, 1, 10, soloPrepago)).Total;
                break;
            }
            default:
                return BadRequest(new { error = "Tipo de reporte inválido" });
        }

        // PDF sirve hasta ~500 filas; por encima, CSV es la única opción práctica.
        var pdfDisponible = tipo is "incidentes" or "sla";
        if (pdfDisponible && filas > 500)
            aviso = (aviso is null ? "" : aviso + " ") + "Con más de 500 filas el PDF deja de ser práctico — se recomienda CSV.";

        var bytesAprox = (long)filas * cols.Length * 12; // estimación gruesa, ~12 bytes/celda promedio
        return Ok(new { filas, columnas = cols.Length, columnasNombres = cols, bytesAprox, aviso, pdfDisponible });
    }
}
