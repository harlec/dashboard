namespace AunorApi.Services;

// Consume la cola de TelegramAlertService uno a uno, con throttle (~15 msg/min,
// límite práctico de Telegram por grupo) y reintento del mismo envío/edición
// cuando Telegram responde 429, respetando el retry_after indicado.
// Telegram es transporte, no registro — la verdad de los incidentes vive en la BD;
// si un mensaje se demora por la cola, no afecta los timestamps ya guardados.
public class TelegramQueueWorker(TelegramAlertService telegram, ILogger<TelegramQueueWorker> log) : BackgroundService
{
    private static readonly TimeSpan IntervaloMinimo = TimeSpan.FromSeconds(4); // ~15/min
    private const int MaxReintentos429 = 5;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("TelegramQueueWorker iniciado — throttle {s}s entre mensajes", IntervaloMinimo.TotalSeconds);

        await foreach (var item in telegram.ColaLectura.ReadAllAsync(ct))
        {
            await EnviarConReintento(item, ct);
            try { await Task.Delay(IntervaloMinimo, ct); } catch (TaskCanceledException) { break; }
        }
    }

    private async Task EnviarConReintento(TelegramColaItem item, CancellationToken ct)
    {
        for (var intento = 0; intento <= MaxReintentos429; intento++)
        {
            var r = await telegram.ProcesarAsync(item);
            if (r.Ok) { item.Tcs.TrySetResult(r); return; }

            if (r.HttpStatus == 429 && r.RetryAfterSeg.HasValue && intento < MaxReintentos429)
            {
                var espera = TimeSpan.FromSeconds(r.RetryAfterSeg.Value + 1);
                log.LogWarning("Reintentando mensaje a Telegram en {s}s (intento {n}/{max})",
                    espera.TotalSeconds, intento + 1, MaxReintentos429);
                try { await Task.Delay(espera, ct); } catch (TaskCanceledException) { item.Tcs.TrySetResult(r); return; }
                continue;
            }

            // Error distinto a 429, o se agotaron los reintentos: ya quedó logueado en
            // ProcesarAsync, no seguimos insistiendo con este mensaje.
            item.Tcs.TrySetResult(r);
            return;
        }
    }
}
