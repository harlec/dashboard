using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

public class ReporteSemanalService(
    IConnectionStringProvider cs,
    ReporteService reporteService,
    EmailAlertService emailAlert,
    ILogger<ReporteSemanalService> log) : BackgroundService
{
    private static DateTime ProximoLunes8am(DateTime desde)
    {
        var dias = ((int)DayOfWeek.Monday - (int)desde.DayOfWeek + 7) % 7;
        var candidato = desde.Date.AddDays(dias).AddHours(8);
        return candidato > desde ? candidato : candidato.AddDays(7);
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("ReporteSemanalService iniciado — próximo envío: {t}", ProximoLunes8am(DateTime.Now));

        while (!ct.IsCancellationRequested)
        {
            var proximo = ProximoLunes8am(DateTime.Now);
            var espera  = proximo - DateTime.Now;
            try
            {
                await Task.Delay(espera, ct);
            }
            catch (TaskCanceledException) { break; }

            try
            {
                await EnviarAsync(proximo.AddDays(-7), proximo, ct);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error generando reporte semanal de disponibilidad");
            }
        }
    }

    public async Task<(bool ok, string message)> EnviarAsync(DateTime desde, DateTime hasta, CancellationToken ct = default)
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(cs.ConnectionString).Options);

        var destinatarios = (await db.Configuraciones.FindAsync(["email_reporte_semanal"], ct))?.Valor ?? "";
        var equipos     = await reporteService.ComputeSlaAsync(desde, hasta, soloCriticos: true, ct: ct);
        var porEstacion = await reporteService.ComputeSlaPorEstacionAsync(desde, hasta, soloCriticos: true, ct: ct);

        var (ok, message) = await emailAlert.SendReporteSemanalAsync(equipos, porEstacion, desde, hasta, destinatarios);
        log.LogInformation("Reporte semanal de disponibilidad: {ok} — {message}", ok, message);
        return (ok, message);
    }
}
