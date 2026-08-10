using System.Net.Http.Json;
using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

public class TelegramAlertService(
    IConnectionStringProvider cs,
    IHttpClientFactory httpFactory,
    ILogger<TelegramAlertService> log)
{
    public Task SendDownAlertAsync(string equipoNombre, string estacion, string ip) =>
        SendAsync($"🔴 <b>{equipoNombre}</b> CAÍDO — {estacion}\nIP: {ip}");

    public Task SendUpAlertAsync(string equipoNombre, string estacion, string ip, int duracionMin) =>
        SendAsync($"🟢 <b>{equipoNombre}</b> RECUPERADO — {estacion}\nIP: {ip}\nCaído durante {duracionMin} min");

    // Usado por el botón "Enviar prueba" en Configuración — a diferencia de las alertas
    // normales, reporta el resultado en vez de solo loguearlo.
    public async Task<(bool ok, string message)> SendTestAsync()
    {
        var (token, chatId) = await GetCredentialsAsync();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(chatId))
            return (false, "Falta configurar el Bot Token y/o el Chat ID.");

        return await PostAsync(token, chatId,
            "✅ Prueba de conexión — Pulsovial Dashboard\nSi ves este mensaje, las alertas de Telegram están configuradas correctamente.");
    }

    private async Task SendAsync(string html)
    {
        var (token, chatId) = await GetCredentialsAsync();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(chatId)) return;

        var (ok, message) = await PostAsync(token, chatId, html);
        if (!ok) log.LogWarning("Telegram sendMessage falló: {message}", message);
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

    private async Task<(bool ok, string message)> PostAsync(string token, string chatId, string html)
    {
        try
        {
            var client = httpFactory.CreateClient();
            var resp = await client.PostAsJsonAsync(
                $"https://api.telegram.org/bot{token}/sendMessage",
                new { chat_id = chatId, text = html, parse_mode = "HTML" });

            var body = await resp.Content.ReadAsStringAsync();
            if (resp.IsSuccessStatusCode) return (true, "Mensaje enviado correctamente.");

            return (false, $"Telegram respondió {(int)resp.StatusCode}: {body}");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error enviando mensaje a Telegram");
            return (false, $"Error de conexión: {ex.Message}");
        }
    }
}
