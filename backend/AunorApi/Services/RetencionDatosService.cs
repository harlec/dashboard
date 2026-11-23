using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

// Retención de datos operativos: borra por antigüedad las tablas de bitácora que solo crecen.
// NO toca: incidentes (base de los reportes de SLA), audit_log (bitácora de seguridad: solo
// inserción para la app; su purga es una tarea administrativa) ni catálogos.
// Días configurables por variable de entorno; 0 = no purgar esa tabla.
public class RetencionDatosService(IServiceScopeFactory scopes, ILogger<RetencionDatosService> log) : BackgroundService
{
    const int LoteFilas = 5000;

    static int Dias(string variable, int porDefecto) =>
        int.TryParse(Environment.GetEnvironmentVariable(variable), out var d) && d >= 0 ? d : porDefecto;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // Espera inicial: no competir con el arranque de los workers de monitoreo
        try { await Task.Delay(TimeSpan.FromMinutes(5), ct); } catch (OperationCanceledException) { return; }

        while (!ct.IsCancellationRequested)
        {
            try { await PurgarAsync(ct); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogWarning(ex, "Retención: falló la purga"); }

            try { await Task.Delay(TimeSpan.FromHours(24), ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    async Task PurgarAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var diasPing = Dias("RETENCION_PING_DIAS", 365);
        if (diasPing > 0)
        {
            var corte = DateTime.Now.AddDays(-diasPing);
            await PurgarLotesAsync("ping_log",
                () => db.Database.ExecuteSqlInterpolatedAsync(
                    $"DELETE TOP ({LoteFilas}) FROM ping_log WHERE [timestamp] < {corte}", ct), ct);
        }

        var diasChecks = Dias("RETENCION_SERVICIO_CHECKS_DIAS", 365);
        if (diasChecks > 0)
        {
            var corte = DateTime.Now.AddDays(-diasChecks);
            await PurgarLotesAsync("servicio_check_logs",
                () => db.Database.ExecuteSqlInterpolatedAsync(
                    $"DELETE TOP ({LoteFilas}) FROM servicio_check_logs WHERE [timestamp] < {corte}", ct), ct);
        }

        await PurgarRedAsync(db, ct);
    }

    // Red: muestras crudas 90 días; antes de borrarlas se condensan en promedios/picos por hora.
    async Task PurgarRedAsync(AppDbContext db, CancellationToken ct)
    {
        var diasRed = Dias("RETENCION_NET_DIAS", 90);
        if (diasRed <= 0) return;

        // Corte alineado a la hora: no se condensa una hora a medias
        var ahora = DateTime.UtcNow.AddDays(-diasRed);
        var corte = new DateTime(ahora.Year, ahora.Month, ahora.Day, ahora.Hour, 0, 0, DateTimeKind.Utc);

        await db.Database.ExecuteSqlInterpolatedAsync($@"
            INSERT INTO net_sample_hora (link_id, hora_utc, in_bps_avg, out_bps_avg, in_bps_max, out_bps_max, util_max_pct)
            SELECT s.link_id, s.hora, AVG(s.in_bps), AVG(s.out_bps), MAX(s.in_bps), MAX(s.out_bps),
                   MAX(CASE WHEN s.util_in_pct >= s.util_out_pct OR s.util_out_pct IS NULL THEN s.util_in_pct ELSE s.util_out_pct END)
            FROM (SELECT link_id, DATEADD(HOUR, DATEDIFF(HOUR, 0, ts_utc), 0) AS hora,
                         in_bps, out_bps, util_in_pct, util_out_pct
                  FROM net_sample WHERE ts_utc < {corte}) s
            GROUP BY s.link_id, s.hora
            HAVING NOT EXISTS (SELECT 1 FROM net_sample_hora h WHERE h.link_id = s.link_id AND h.hora_utc = s.hora)", ct);

        await PurgarLotesAsync("net_sample",
            () => db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE TOP ({LoteFilas}) FROM net_sample WHERE ts_utc < {corte}", ct), ct);
    }

    async Task PurgarLotesAsync(string tabla, Func<Task<int>> borrarLote, CancellationToken ct)
    {
        var total = 0;
        int n;
        do
        {
            n = await borrarLote();
            total += n;
            if (n > 0) await Task.Delay(TimeSpan.FromMilliseconds(200), ct);   // no saturar la BD
        } while (n == LoteFilas && !ct.IsCancellationRequested);

        if (total > 0) log.LogInformation("Retención: {Total} filas borradas de {Tabla}", total, tabla);
    }
}
