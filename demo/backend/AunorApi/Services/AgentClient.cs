using System.Net.Http.Json;
using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

public class AgentClient(
    string apiKey,
    IConnectionStringProvider cs,
    IHttpClientFactory httpFactory,
    ILogger<AgentClient> log)
{
    public async Task<(bool ok, string message)> RestartServiceAsync(string ip, int puerto, string servicio)
    {
        var permitidos = await GetServiciosPermitidosAsync();
        if (!permitidos.Any(s => string.Equals(s, servicio, StringComparison.OrdinalIgnoreCase)))
            return (false, "Servicio no permitido.");

        try
        {
            var client = httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(70);
            client.DefaultRequestHeaders.Add("X-Api-Key", apiKey);

            var resp = await client.PostAsJsonAsync($"http://{ip}:{puerto}/restart-service", new { servicio });
            var body = await resp.Content.ReadFromJsonAsync<AgentResponse>();

            if (body is not null) return (body.ok, body.message);
            return (resp.IsSuccessStatusCode, resp.IsSuccessStatusCode ? "Reiniciado." : $"El agente respondió {(int)resp.StatusCode}.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error contactando al agente en {ip}:{puerto}", ip, puerto);
            return (false, $"No se pudo contactar al agente en {ip}: {ex.Message}");
        }
    }

    private async Task<string[]> GetServiciosPermitidosAsync()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(cs.ConnectionString).Options);

        var valor = await db.Configuraciones
            .Where(c => c.Clave == "agente_servicios_permitidos")
            .Select(c => c.Valor)
            .FirstOrDefaultAsync();

        return (valor ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private record AgentResponse(bool ok, string message);
}
