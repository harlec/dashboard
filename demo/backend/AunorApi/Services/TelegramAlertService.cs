using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

public record TelegramEnvioResultado(bool Ok, int? HttpStatus, int? RetryAfterSeg, string Detalle,
    string? MessageId = null, string? ChatId = null);

// Item de cola: mensaje nuevo (MessageId=null) o edición de uno existente.
// El Tcs se resuelve cuando el worker realmente lo envía — quien encola una
// alerta individual lo ignora (fire-and-forget); quien maneja un incidente de
// grupo sí lo espera para guardar el message_id y poder editarlo después.
public record TelegramColaItem(string Html, string? MessageId, TaskCompletionSource<TelegramEnvioResultado> Tcs);

public class TelegramAlertService(
    IConnectionStringProvider cs,
    IHttpClientFactory httpFactory,
    ILogger<TelegramAlertService> log)
{
    private readonly Channel<TelegramColaItem> cola = Channel.CreateUnbounded<TelegramColaItem>();
    public ChannelReader<TelegramColaItem> ColaLectura => cola.Reader;

    public Task SendDownAlertAsync(string equipoNombre, string estacion, string ip, string? interpretacion = null)
    {
        var pie = interpretacion != null ? $"\nℹ {interpretacion}" : "";
        Encolar($"🔴 <b>{equipoNombre}</b> CAÍDO — {estacion}\nIP: {ip}{pie}", null);
        return Task.CompletedTask;
    }

    public Task SendUpAlertAsync(string equipoNombre, string estacion, string ip, int duracionMin)
    {
        Encolar($"🟢 <b>{equipoNombre}</b> RECUPERADO — {estacion}\nIP: {ip}\nCaído durante {duracionMin} min", null);
        return Task.CompletedTask;
    }

    // Mensaje nuevo de incidente de grupo (vía/peaje) — espera la confirmación
    // real de envío para poder guardar el message_id y editarlo más adelante.
    public Task<TelegramEnvioResultado> SendGrupoAsync(string html) => Encolar(html, null);

    // Edita un mensaje de grupo ya enviado (el conteo de equipos cambió, o se resolvió).
    public Task<TelegramEnvioResultado> EditarGrupoAsync(string messageId, string html) => Encolar(html, messageId);

    private Task<TelegramEnvioResultado> Encolar(string html, string? messageId)
    {
        var tcs = new TaskCompletionSource<TelegramEnvioResultado>(TaskCreationOptions.RunContinuationsAsynchronously);
        cola.Writer.TryWrite(new TelegramColaItem(html, messageId, tcs));
        return tcs.Task;
    }

    // Usado por el botón "Enviar prueba" en Configuración — se manda directo (sin
    // pasar por la cola) porque el usuario espera una respuesta inmediata.
    public async Task<(bool ok, string message)> SendTestAsync()
    {
        var (token, chatId) = await GetCredentialsAsync();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(chatId))
            return (false, "Falta configurar el Bot Token y/o el Chat ID.");

        var r = await EjecutarAsync(token, chatId, null,
            "✅ Prueba de conexión — Pulsovial Dashboard\nSi ves este mensaje, las alertas de Telegram están configuradas correctamente.");
        return (r.Ok, r.Detalle);
    }

    // Usado por TelegramQueueWorker — ejecuta el envío/edición real y reporta
    // status/retry_after para que el worker decida throttle y reintento. Nunca lanza excepción.
    public async Task<TelegramEnvioResultado> ProcesarAsync(TelegramColaItem item)
    {
        var (token, chatId) = await GetCredentialsAsync();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(chatId))
            return new TelegramEnvioResultado(false, null, null, "Bot Token / Chat ID no configurados.");

        return await EjecutarAsync(token, chatId, item.MessageId, item.Html);
    }

    private async Task<(string token, string chatId)> GetCredentialsAsync()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(cs.ConnectionString).Options);

        var config = await db.Configuraciones
            .Where(c => c.Clave == "telegram_bot_token" || c.Clave == "telegram_chat_id")
            .ToDictionaryAsync(c => c.Clave, c => c.Valor);

        return (config.GetValueOrDefault("telegram_bot_token", ""),
                config.GetValueOrDefault("telegram_chat_id", ""));
    }

    private async Task<TelegramEnvioResultado> EjecutarAsync(string token, string chatId, string? messageId, string html)
    {
        var metodo = messageId is null ? "sendMessage" : "editMessageText";
        try
        {
            var client = httpFactory.CreateClient();
            object payload = messageId is null
                ? new { chat_id = chatId, text = html, parse_mode = "HTML" }
                : new { chat_id = chatId, message_id = messageId, text = html, parse_mode = "HTML" };

            var resp = await client.PostAsJsonAsync($"https://api.telegram.org/bot{token}/{metodo}", payload);
            var body = await resp.Content.ReadAsStringAsync();
            var status = (int)resp.StatusCode;

            if (resp.IsSuccessStatusCode)
            {
                log.LogInformation("Telegram {metodo} OK ({status})", metodo, status);
                string? nuevoMessageId = messageId;
                if (messageId is null)
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(body);
                        if (doc.RootElement.TryGetProperty("result", out var r) &&
                            r.TryGetProperty("message_id", out var mid))
                            nuevoMessageId = mid.GetInt64().ToString();
                    }
                    catch { /* no se pudo leer el message_id — la edición futura fallará, queda logueado */ }
                }
                return new TelegramEnvioResultado(true, status, null, "OK", nuevoMessageId, chatId);
            }

            int? retryAfter = null;
            if (status == 429)
            {
                try
                {
                    using var doc = JsonDocument.Parse(body);
                    if (doc.RootElement.TryGetProperty("parameters", out var p) &&
                        p.TryGetProperty("retry_after", out var ra))
                        retryAfter = ra.GetInt32();
                }
                catch { /* body no parseable, seguimos sin retryAfter */ }
            }

            log.LogWarning("Telegram {metodo} falló ({status}, retry_after={retryAfter}): {body}", metodo, status, retryAfter, body);
            return new TelegramEnvioResultado(false, status, retryAfter, $"Telegram respondió {status}: {body}");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error de conexión en Telegram {metodo}", metodo);
            return new TelegramEnvioResultado(false, null, null, $"Error de conexión: {ex.Message}");
        }
    }
}
