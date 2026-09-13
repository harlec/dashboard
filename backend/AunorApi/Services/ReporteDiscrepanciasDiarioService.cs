using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

public class ReporteDiscrepanciasDiarioService(
    IConnectionStringProvider cs,
    DiscrepanciasService discrepanciasService,
    EmailAlertService emailAlert,
    ILogger<ReporteDiscrepanciasDiarioService> log) : BackgroundService
{
    private const string ClaveHora  = "hora_reporte_discrepancias";
    private const string ClaveEmail = "email_reporte_discrepancias";
    private static readonly TimeSpan HoraDefault = new(8, 0, 0);

    private async Task<TimeSpan> LeerHoraAsync(CancellationToken ct)
    {
        using var db = NewDb();
        var valor = (await db.Configuraciones.FindAsync([ClaveHora], ct))?.Valor;
        return TimeSpan.TryParse(valor, out var hora) ? hora : HoraDefault;
    }

    private static DateTime ProximaHora(DateTime desde, TimeSpan hora)
    {
        var candidato = desde.Date.Add(hora);
        return candidato > desde ? candidato : candidato.AddDays(1);
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("ReporteDiscrepanciasDiarioService iniciado");

        while (!ct.IsCancellationRequested)
        {
            // Se relee la hora en cada vuelta — así un cambio en Configuración
            // aplica al día siguiente sin reiniciar el backend.
            var hora    = await LeerHoraAsync(ct);
            var proximo = ProximaHora(DateTime.Now, hora);
            try { await Task.Delay(proximo - DateTime.Now, ct); }
            catch (TaskCanceledException) { break; }

            try { await EnviarAsync(proximo.AddDays(-1), proximo, ct); }
            catch (Exception ex) { log.LogError(ex, "Error generando reporte diario de discrepancias"); }
        }
    }

    public async Task<(bool ok, string message)> EnviarAsync(DateTime desde, DateTime hasta, CancellationToken ct = default)
    {
        using var db = NewDb();
        var destinatarios = (await db.Configuraciones.FindAsync([ClaveEmail], ct))?.Valor ?? "";
        var vias = await discrepanciasService.GetViasAsync("24h");

        var (ok, message) = await emailAlert.SendReporteDiscrepanciasDiarioAsync(vias, desde, hasta, destinatarios);
        log.LogInformation("Reporte diario de discrepancias: {ok} — {message}", ok, message);
        return (ok, message);
    }

    private AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs.ConnectionString).Options);
}
