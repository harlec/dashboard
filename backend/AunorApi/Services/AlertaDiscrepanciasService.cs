using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

// Revisa cada hora, en punto, si alguna vía superó el % de discrepancia
// configurado en la última hora — a diferencia del reporte diario (que es
// informativo), esto es una alerta temprana de un problema puntual.
public class AlertaDiscrepanciasService(
    IConnectionStringProvider cs,
    DiscrepanciasService discrepanciasService,
    EmailAlertService emailAlert,
    ILogger<AlertaDiscrepanciasService> log) : BackgroundService
{
    private const string ClaveUmbral = "umbral_alerta_discrepancias";
    private const string ClaveEmail  = "email_alerta_discrepancias";
    private const double UmbralDefault = 20.0;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("AlertaDiscrepanciasService iniciado — revisa cada hora en punto");

        while (!ct.IsCancellationRequested)
        {
            var ahora   = DateTime.Now;
            var proximo = ahora.Date.AddHours(ahora.Hour + 1);
            try { await Task.Delay(proximo - ahora, ct); }
            catch (TaskCanceledException) { break; }

            try { await RevisarAsync(ct); }
            catch (Exception ex) { log.LogError(ex, "Error revisando umbral de discrepancias"); }
        }
    }

    public async Task<(bool ok, string message)> RevisarAsync(CancellationToken ct = default)
    {
        using var db = NewDb();
        var umbralValor   = (await db.Configuraciones.FindAsync([ClaveUmbral], ct))?.Valor;
        var umbral        = double.TryParse(umbralValor, out var u) ? u : UmbralDefault;
        var destinatarios = (await db.Configuraciones.FindAsync([ClaveEmail], ct))?.Valor ?? "";

        var vias = (await discrepanciasService.GetViasAsync("1h"))
            .Where(v => v.Pct > umbral)
            .ToList();

        if (vias.Count == 0)
        {
            log.LogDebug("Revisión de umbral de discrepancias: ninguna vía sobre {umbral}%", umbral);
            return (true, "Sin vías sobre el umbral en la última hora.");
        }

        var (ok, message) = await emailAlert.SendAlertaDiscrepanciasAsync(vias, umbral, destinatarios);
        log.LogInformation("Alerta de discrepancias ({n} vías sobre {umbral}%): {ok} — {message}",
            vias.Count, umbral, ok, message);
        return (ok, message);
    }

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs.ConnectionString).Options);
}
