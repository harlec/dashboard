using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace AunorApi.Services;

public class EmailAlertService(IConfiguration config, ILogger<EmailAlertService> log)
{
    public async Task SendDownAlertAsync(string equipoNombre, string estacion, string ip)
    {
        await SendAsync(
            $"[ALERTA] {equipoNombre} CAÍDO — {estacion}",
            $"<p>El equipo <b>{equipoNombre}</b> ({ip}) en <b>{estacion}</b> está <span style='color:red'>CAÍDO</span>.</p>");
    }

    public async Task SendUpAlertAsync(string equipoNombre, string estacion, string ip, int duracionMin)
    {
        await SendAsync(
            $"[RECUPERADO] {equipoNombre} — {estacion}",
            $"<p>El equipo <b>{equipoNombre}</b> ({ip}) en <b>{estacion}</b> se ha <span style='color:green'>RECUPERADO</span> tras {duracionMin} minutos.</p>");
    }

    private async Task SendAsync(string subject, string htmlBody)
    {
        var smtpHost = Environment.GetEnvironmentVariable("SMTP_HOST") ?? config["Smtp:Host"] ?? "";
        var smtpPort = int.Parse(Environment.GetEnvironmentVariable("SMTP_PORT") ?? "587");
        var smtpUser = Environment.GetEnvironmentVariable("SMTP_USER") ?? "";
        var smtpPass = Environment.GetEnvironmentVariable("SMTP_PASS") ?? "";

        if (string.IsNullOrEmpty(smtpHost) || string.IsNullOrEmpty(smtpUser)) return;

        try
        {
            var msg = new MimeMessage();
            msg.From.Add(MailboxAddress.Parse(smtpUser));
            msg.To.Add(MailboxAddress.Parse(smtpUser));
            msg.Subject = subject;
            msg.Body    = new TextPart("html") { Text = htmlBody };

            using var client = new SmtpClient();
            await client.ConnectAsync(smtpHost, smtpPort, SecureSocketOptions.StartTls);
            await client.AuthenticateAsync(smtpUser, smtpPass);
            await client.SendAsync(msg);
            await client.DisconnectAsync(true);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error enviando alerta email: {subject}", subject);
        }
    }
}
