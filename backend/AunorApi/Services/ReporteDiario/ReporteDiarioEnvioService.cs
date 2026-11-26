using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services.ReporteDiario;

// Envío programado del reporte diario Sigma (convive con ReporteDiscrepanciasDiarioService, que no se toca).
// Hora y destinatarios salen de `configuracion` y se releen en cada vuelta (sin reiniciar el backend).
// Apagado por defecto: no envía nada hasta que reporte_diario_activo = 1.
public class ReporteDiarioEnvioService(
    IConnectionStringProvider cs,
    ReporteDiarioService reporte,
    EmailAlertService email,
    ILogger<ReporteDiarioEnvioService> log) : BackgroundService
{
    private AppDbContext NewDb() => new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs.ConnectionString).Options);

    private async Task<string> CfgAsync(string clave, CancellationToken ct)
    {
        using var db = NewDb();
        return (await db.Configuraciones.AsNoTracking().FirstOrDefaultAsync(c => c.Clave == clave, ct))?.Valor ?? "";
    }

    public static List<string> ParseDestinatarios(string? s) =>
        (s ?? "").Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Where(x => x != "-").ToList();

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("ReporteDiarioEnvioService iniciado");
        // Espera inicial: que arranque el resto del backend
        try { await Task.Delay(TimeSpan.FromSeconds(30), ct); } catch (OperationCanceledException) { return; }

        // Precalentamiento: calcula los snapshots de 30 días en segundo plano para que la primera vista previa
        // no tenga que hacerlo (y no pase el límite de tiempo del proxy). No es fatal si falla.
        try
        {
            var c0 = await reporte.LeerConfigAsync(ct);
            var f0 = ReporteDiarioService.UltimoCorte(ReporteDiarioService.AhoraLima(), c0.HoraCorte).AddDays(-1).Add(-c0.HoraCorte).Date;
            await reporte.AsegurarSnapshotsAsync(f0, c0.HoraCorte, ct);
            log.LogInformation("Reporte diario: snapshots precalentados hasta {f:yyyy-MM-dd}", f0);
        }
        catch (OperationCanceledException) { return; }
        catch (Exception ex) { log.LogWarning(ex, "Reporte diario: no se pudo precalentar los snapshots"); }

        while (!ct.IsCancellationRequested)
        {
            DateTime proximo;
            try
            {
                var cfg = await reporte.LeerConfigAsync(ct);
                var ahora = ReporteDiarioService.AhoraLima();
                proximo = ReporteDiarioService.UltimoCorte(ahora, cfg.HoraCorte).AddDays(1);
                await Task.Delay(proximo - ahora, ct);
                await Task.Delay(TimeSpan.FromSeconds(2), ct); // evita despertar un instante antes del corte
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                log.LogError(ex, "Reporte diario: error calculando la próxima hora");
                try { await Task.Delay(TimeSpan.FromMinutes(5), ct); } catch (OperationCanceledException) { break; }
                continue;
            }

            try
            {
                if (await CfgAsync("reporte_diario_activo", ct) != "1") { log.LogInformation("Reporte diario desactivado (reporte_diario_activo != 1) — no se envía"); continue; }
                var (ok, msg) = await EnviarAsync(ParseDestinatarios(await CfgAsync("email_reporte_diario", ct)), proximo, ct);
                log.LogInformation("Reporte diario Sigma: {ok} — {msg}", ok, msg);
            }
            catch (Exception ex) { log.LogError(ex, "Error generando/enviando el reporte diario Sigma"); }
        }
    }

    // corte = fin de la ventana (null → último 08:00 cumplido)
    public async Task<(bool ok, string message)> EnviarAsync(List<string> destinatarios, DateTime? corte = null, CancellationToken ct = default)
    {
        if (destinatarios.Count == 0) return (false, "No hay destinatarios (clave 'email_reporte_diario').");
        var dto = await reporte.GenerarAsync(corte, ct);
        var (html, imgs) = ReporteDiarioEmailHtml.Construir(dto, await CfgAsync("reporte_diario_url", ct));
        return await email.SendHtmlConImagenesAsync($"Sigma · Reporte diario {dto.Hasta:dd/MM/yyyy}", html, destinatarios, imgs);
    }

    public async Task<(bool ok, string message)> EnviarAConfiguradosAsync(CancellationToken ct = default) =>
        await EnviarAsync(ParseDestinatarios(await CfgAsync("email_reporte_diario", ct)), null, ct);

    // HTML para abrir en el navegador (las imágenes CID se sustituyen por data URI)
    public async Task<string> PrevisualizarAsync(DateTime? corte, CancellationToken ct = default)
    {
        var dto = await reporte.GenerarAsync(corte, ct);
        var (html, imgs) = ReporteDiarioEmailHtml.Construir(dto, await CfgAsync("reporte_diario_url", ct));
        foreach (var (cid, png) in imgs) html = html.Replace($"cid:{cid}", $"data:image/png;base64,{Convert.ToBase64String(png)}");
        return html;
    }
}
