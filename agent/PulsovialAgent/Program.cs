using System.ServiceProcess;
using Microsoft.Extensions.Options;
using PulsovialAgent;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService(o => o.ServiceName = "PulsovialAgent");
builder.Services.Configure<AgentOptions>(builder.Configuration.GetSection("Agent"));

var app = builder.Build();

app.MapPost("/restart-service", (HttpContext ctx, RestartRequest req, IOptions<AgentOptions> opt, ILogger<Program> log) =>
{
    var apiKey = ctx.Request.Headers["X-Api-Key"].ToString();
    if (string.IsNullOrEmpty(opt.Value.ApiKey) || apiKey != opt.Value.ApiKey)
        return Results.Unauthorized();

    if (!opt.Value.ServiciosPermitidos.Any(s => string.Equals(s, req.Servicio, StringComparison.OrdinalIgnoreCase)))
        return Results.BadRequest(new { ok = false, message = "Servicio no permitido." });

    try
    {
        using var sc = new ServiceController(req.Servicio);
        sc.Refresh();
        if (sc.Status != ServiceControllerStatus.Stopped)
        {
            sc.Stop();
            sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
        }
        sc.Start();
        sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));

        return Results.Ok(new { ok = true, message = $"Servicio '{req.Servicio}' reiniciado correctamente." });
    }
    catch (InvalidOperationException)
    {
        return Results.NotFound(new { ok = false, message = "Servicio no encontrado en este equipo." });
    }
    catch (System.ServiceProcess.TimeoutException)
    {
        log.LogWarning("Timeout reiniciando servicio {servicio}", req.Servicio);
        return Results.Json(new { ok = false, message = "Tiempo de espera agotado al reiniciar el servicio." }, statusCode: 500);
    }
});

app.Run($"http://0.0.0.0:{builder.Configuration["Agent:Port"] ?? "6060"}");

namespace PulsovialAgent
{
    public record RestartRequest(string Servicio);

    public class AgentOptions
    {
        public int Port { get; set; } = 6060;
        public string ApiKey { get; set; } = "";
        public string[] ServiciosPermitidos { get; set; } = [];
    }
}
