using AunorApi.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AunorApi.Services.ReporteDiario;

// Hoy no hay historial de latencia (equipos.ultima_latencia_ms solo guarda el último valor y ping_log
// solo graba cambios de estado). Cada 5 min toma el promedio por plaza de los equipos UP con ping reciente
// y lo guarda en snap_latencia_sitio — de ahí sale la sección "Latencia por sitio" del reporte.
// Es solo lectura sobre equipos/ping_log: no toca el worker de ping.
public class LatenciaSitioMuestreoService(IConnectionStringProvider cs, ILogger<LatenciaSitioMuestreoService> log) : BackgroundService
{
    private static readonly TimeSpan Intervalo = TimeSpan.FromMinutes(5);
    private const int RetencionDias = 40;
    private int _vueltas;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(1), ct); } catch (OperationCanceledException) { return; }
        while (!ct.IsCancellationRequested)
        {
            try { await MuestrearAsync(ct); }
            catch (OperationCanceledException) { break; }
            // La tabla puede no existir todavía (migración pendiente): no es un error del servicio
            catch (SqlException ex) when (ex.Number == 208) { log.LogDebug("snap_latencia_sitio aún no existe — falta migration_reporte_diario.sql"); }
            catch (Exception ex) { log.LogWarning(ex, "Muestreo de latencia por sitio falló"); }

            try { await Task.Delay(Intervalo, ct); } catch (OperationCanceledException) { break; }
        }
    }

    public async Task MuestrearAsync(CancellationToken ct)
    {
        await using var con = new SqlConnection(cs.ConnectionString);
        var ahora = DateTime.Now;
        // Solo equipos con último estado UP (en DOWN se conserva la última latencia buena, no es una medida actual)
        await con.ExecuteAsync(@"
            INSERT INTO snap_latencia_sitio (estacion_id, ts, ms_prom, equipos)
            SELECT es.id, @ahora, AVG(e.ultima_latencia_ms), COUNT(*)
            FROM equipos e
            JOIN vias v ON v.id = e.via_id
            JOIN estaciones es ON es.id = v.estacion_id
            OUTER APPLY (SELECT TOP 1 estado FROM ping_log p WHERE p.equipo_id = e.id ORDER BY p.[timestamp] DESC) u
            WHERE e.activo = 1 AND e.monitorear = 1 AND e.ultima_latencia_ms IS NOT NULL
              AND e.ultimo_ping_en >= DATEADD(MINUTE, -2, @ahora) AND u.estado = 'UP'
            GROUP BY es.id", new { ahora }, commandTimeout: 30);

        if (++_vueltas % 288 == 0) // ~1 vez al día
            await con.ExecuteAsync("DELETE FROM snap_latencia_sitio WHERE ts < @corte", new { corte = ahora.AddDays(-RetencionDias) });
    }
}
