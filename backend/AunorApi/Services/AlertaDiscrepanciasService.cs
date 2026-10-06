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

        var todas = await discrepanciasService.GetViasAsync("1h");

        // El % "a secas" engaña con poco tráfico: 1 discrepancia en 2 tránsitos es 50%. Se
        // alerta solo cuando el límite inferior del intervalo de Wilson (95%) supera el
        // umbral — es decir, cuando hay evidencia estadística de que la tasa REAL de la
        // vía está por encima. Con mucho volumen equivale casi al % normal.
        var vias = todas
            .Where(v => v.PctWilson > umbral)
            .OrderByDescending(v => v.PctWilson)
            .ToList();
        var excluidas = todas.Count(v => v.Pct > umbral && v.PctWilson <= umbral);

        if (vias.Count == 0)
        {
            log.LogDebug("Revisión de umbral de discrepancias: ninguna vía confirmada sobre {umbral}% ({excl} con % alto pero pocos tránsitos)",
                umbral, excluidas);
            return (true, excluidas > 0
                ? $"Sin vías confirmadas sobre el umbral en la última hora ({excluidas} superaron el % pero con muy pocos tránsitos)."
                : "Sin vías sobre el umbral en la última hora.");
        }

        var (ok, message) = await emailAlert.SendAlertaDiscrepanciasAsync(vias, umbral, destinatarios, excluidas);
        log.LogInformation("Alerta de discrepancias ({n} vías confirmadas sobre {umbral}%, {excl} descartadas por poco volumen): {ok} — {message}",
            vias.Count, umbral, excluidas, ok, message);
        return (ok, message);
    }

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs.ConnectionString).Options);
}
