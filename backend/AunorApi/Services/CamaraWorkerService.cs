using AunorApi.Data;
using AunorApi.Hubs;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace AunorApi.Services;

public class CamaraWorkerService(
    IConnectionStringProvider cs,
    IHubContext<MonitorHub> hub,
    IConfiguration config,
    ILogger<CamaraWorkerService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var intervalMin = config.GetValue<int>("Camera:IntervalMinutes", 15);
        log.LogInformation("CamaraWorker iniciado — intervalo {min} min", intervalMin);

        while (!ct.IsCancellationRequested)
        {
            await RunCycle(ct);
            await Task.Delay(TimeSpan.FromMinutes(intervalMin), ct);
        }
    }

    private async Task RunCycle(CancellationToken ct)
    {
        var email1  = Environment.GetEnvironmentVariable("CAM_EMAIL")  ?? "";
        var pass1   = Environment.GetEnvironmentVariable("CAM_PASSWORD") ?? "";
        var email2  = Environment.GetEnvironmentVariable("CAM_EMAIL2") ?? "";
        var pass2   = Environment.GetEnvironmentVariable("CAM_PASSWORD2") ?? "";
        var imapHost = config["Camera:ImapHost"]!;
        var imapPort = config.GetValue<int>("Camera:ImapPort", 993);
        var subject  = config["Camera:Subject"]!;
        var ids1     = ParseIds(config["Camera:Account1Ids"] ?? "1-17");
        var ids2     = ParseIds(config["Camera:Account2Ids"] ?? "18-37,48,49");

        if (!string.IsNullOrEmpty(email1))
            await ProcessAccount(email1, pass1, imapHost, imapPort, subject, ids1, ct);

        if (!string.IsNullOrEmpty(email2))
            await ProcessAccount(email2, pass2, imapHost, imapPort, subject, ids2, ct);
    }

    private async Task ProcessAccount(
        string email, string password, string host, int port,
        string subjectFilter, HashSet<int> cameraIds, CancellationToken ct)
    {
        try
        {
            using var client = new ImapClient();
            await client.ConnectAsync(host, port, MailKit.Security.SecureSocketOptions.SslOnConnect, ct);
            await client.AuthenticateAsync(email, password, ct);

            var inbox = client.Inbox;
            await inbox.OpenAsync(FolderAccess.ReadOnly, ct);

            var since   = DateTime.UtcNow.AddHours(-25);
            var results = await inbox.SearchAsync(
                SearchQuery.And(
                    SearchQuery.DeliveredAfter(since),
                    SearchQuery.SubjectContains(subjectFilter)), ct);

            var opts = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlServer(cs.ConnectionString).Options;

            using var db = new AppDbContext(opts);

            foreach (var uid in results)
            {
                if (ct.IsCancellationRequested) break;

                var msg     = await inbox.GetMessageAsync(uid, ct);
                var body    = msg.TextBody ?? "";
                var camId   = ParseCameraId(body);
                if (camId <= 0 || !cameraIds.Contains(camId)) continue;

                var row = await db.CamarasHeartbeat.FirstOrDefaultAsync(
                    c => c.Camara == camId, ct);

                if (row != null)
                {
                    row.UltimoEmail = msg.Date.UtcDateTime;
                    row.Asunto      = msg.Subject;
                    row.Remitente   = msg.From.ToString();
                    row.Actualizado = DateTime.UtcNow;
                }

                await db.SaveChangesAsync(ct);

                int minDesde = (int)(DateTime.UtcNow - msg.Date.UtcDateTime).TotalMinutes;
                await hub.Clients.All.SendAsync("CamaraUpdated",
                    camId, msg.Date.UtcDateTime, minDesde, minDesde <= 70, ct);
            }

            await client.DisconnectAsync(true, ct);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error en CamaraWorker cuenta {email}", email);
        }
    }

    // Extrae ID de cámara del patrón "CAM_MON_[ID]" en el cuerpo del email
    private static int ParseCameraId(string body)
    {
        var m = System.Text.RegularExpressions.Regex.Match(body, @"CAM_MON_(\d+)");
        return m.Success ? int.Parse(m.Groups[1].Value) : 0;
    }

    private static HashSet<int> ParseIds(string spec)
    {
        var ids = new HashSet<int>();
        foreach (var part in spec.Split(','))
        {
            var p = part.Trim();
            if (p.Contains('-'))
            {
                var r = p.Split('-');
                if (int.TryParse(r[0], out var from) && int.TryParse(r[1], out var to))
                    for (int i = from; i <= to; i++) ids.Add(i);
            }
            else if (int.TryParse(p, out var single))
                ids.Add(single);
        }
        return ids;
    }
}
