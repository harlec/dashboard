using System.Text;
using AunorApi.Data;
using AunorApi.DTOs;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace AunorApi.Services;

public class EmailAlertService(IConnectionStringProvider cs, IWebHostEnvironment env, ILogger<EmailAlertService> log)
{
    private const string LogoContentId = "pulsovial-logo";
    private string LogoPath => Path.Combine(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "logo.png");
    public async Task<(bool ok, string message)> SendReporteSemanalAsync(
        List<SlaEquipoDto> equipos, List<SlaEstacionDto> porEstacion, DateTime desde, DateTime hasta, string destinatarios)
    {
        var lista = destinatarios.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        if (lista.Count == 0)
            return (false, "No hay destinatarios configurados (clave 'email_reporte_semanal').");
        if (equipos.Count == 0)
            return (false, "No hay equipos marcados como críticos.");

        const string brand = "#0F6F5A";
        const string ink = "#242120";
        const string muted = "#7a7470";
        const string border = "#e6e2dd";
        string Color(decimal pct) => pct >= 99 ? "#2E7D32" : pct >= 95 ? "#B26A00" : "#C62828";
        string Bg(decimal pct) => pct >= 99 ? "#EAF6EC" : pct >= 95 ? "#FFF4E5" : "#FDECEA";

        var promedio = Math.Round(equipos.Average(e => e.UptimePct), 2);
        var font = "font-family:Segoe UI,Arial,sans-serif;";

        var sb = new StringBuilder();
        sb.Append($"<div style='{font}background:#f4f2ef;padding:24px 12px;'>");
        sb.Append("<div style='max-width:680px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid " + border + ";'>");

        // Header con logo real
        sb.Append($"<div style='background:#ffffff;padding:24px 28px 18px;border-bottom:3px solid {brand};'>");
        sb.Append($"<img src='cid:{LogoContentId}' alt='Pulso Vial' height='34' style='display:block;height:34px;' />");
        sb.Append($"<div style='color:{muted};font-size:13px;font-weight:600;margin-top:10px;'>Reporte semanal de disponibilidad · equipos críticos</div>");
        sb.Append("</div>");

        sb.Append("<div style='padding:24px 28px;'>");
        sb.Append($"<div style='{font}color:{muted};font-size:13px;margin-bottom:16px;'>Período: <b style='color:{ink}'>{desde:dd/MM/yyyy HH:mm}</b> — <b style='color:{ink}'>{hasta:dd/MM/yyyy HH:mm}</b></div>");

        // KPI destacado
        sb.Append($"<div style='background:{Bg(promedio)};border-radius:8px;padding:16px 20px;margin-bottom:24px;'>");
        sb.Append($"<div style='font-size:32px;font-weight:800;color:{Color(promedio)};line-height:1;'>{promedio}%</div>");
        sb.Append($"<div style='{font}font-size:12px;color:{muted};text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-top:4px;'>Uptime promedio · {equipos.Count} equipos críticos</div>");
        sb.Append("</div>");

        sb.Append($"<div style='{font}font-size:15px;font-weight:700;color:{ink};margin-bottom:8px;'>Por estación</div>");
        sb.Append($"<table width='100%' cellpadding='0' cellspacing='0' style='{font}font-size:13px;border-collapse:collapse;margin-bottom:24px;'>");
        sb.Append($"<tr style='background:#faf9f7;'><th style='text-align:left;padding:8px 10px;color:{muted};font-size:11px;text-transform:uppercase;border-bottom:2px solid {border};'>Estación</th>" +
                   $"<th style='text-align:left;padding:8px 10px;color:{muted};font-size:11px;text-transform:uppercase;border-bottom:2px solid {border};'>Uptime</th>" +
                   $"<th style='text-align:left;padding:8px 10px;color:{muted};font-size:11px;text-transform:uppercase;border-bottom:2px solid {border};'>Equipos</th></tr>");
        foreach (var e in porEstacion)
            sb.Append($"<tr><td style='padding:8px 10px;border-bottom:1px solid {border};color:{ink};'>{e.Estacion}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{Color(e.UptimePct)};font-weight:700;'>{e.UptimePct}%</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{muted};'>{e.Total}</td></tr>");
        sb.Append("</table>");

        sb.Append($"<div style='{font}font-size:15px;font-weight:700;color:{ink};margin-bottom:8px;'>Detalle por equipo</div>");
        sb.Append($"<table width='100%' cellpadding='0' cellspacing='0' style='{font}font-size:12.5px;border-collapse:collapse;'>");
        sb.Append($"<tr style='background:#faf9f7;'>" +
                   string.Join("", new[] { "Estación", "Equipo", "Tipo", "Vía", "Uptime", "Min. caído", "Motivo" }
                       .Select(h => $"<th style='text-align:left;padding:7px 9px;color:{muted};font-size:10.5px;text-transform:uppercase;border-bottom:2px solid {border};'>{h}</th>")) +
                   "</tr>");
        foreach (var e in equipos)
        {
            sb.Append($"<tr><td style='padding:7px 9px;border-bottom:1px solid {border};color:{ink};'>{e.Estacion}</td>" +
                      $"<td style='padding:7px 9px;border-bottom:1px solid {border};color:{ink};'>{e.Nombre}</td>" +
                      $"<td style='padding:7px 9px;border-bottom:1px solid {border};color:{muted};'>{e.TipoNombre}</td>" +
                      $"<td style='padding:7px 9px;border-bottom:1px solid {border};color:{muted};'>{e.Via}</td>" +
                      $"<td style='padding:7px 9px;border-bottom:1px solid {border};color:{Color(e.UptimePct)};font-weight:700;'>{e.UptimePct}%</td>" +
                      $"<td style='padding:7px 9px;border-bottom:1px solid {border};color:{muted};'>{e.DownMin}</td>" +
                      $"<td style='padding:7px 9px;border-bottom:1px solid {border};color:{muted};'>{e.Motivos ?? "—"}</td></tr>");
        }
        sb.Append("</table>");
        sb.Append("</div>"); // padding wrapper

        // Footer
        sb.Append($"<div style='background:#faf9f7;border-top:1px solid {border};padding:14px 28px;{font}font-size:11px;color:{muted};'>");
        sb.Append($"Generado automáticamente por <b style='color:{brand}'>Pulso Vial</b> — dashboard de monitoreo de red vial.");
        sb.Append("</div>");

        sb.Append("</div></div>"); // card + outer

        var (ok, error) = await SendAsync($"🛣 [Pulso Vial] Reporte semanal de disponibilidad", sb.ToString(), lista);
        return ok
            ? (true, $"Enviado a {string.Join(", ", lista)}.")
            : (false, error ?? "Error al enviar — revisa la configuración SMTP y los logs del servidor.");
    }

    public async Task SendDownAlertAsync(string equipoNombre, string estacion, string ip, string? interpretacion = null)
    {
        var pie = interpretacion != null ? $"<p style='color:#7a7470;font-size:13px;'>ℹ {interpretacion}</p>" : "";
        await SendAsync(
            $"[ALERTA] {equipoNombre} CAÍDO — {estacion}",
            $"<p>El equipo <b>{equipoNombre}</b> ({ip}) en <b>{estacion}</b> está <span style='color:red'>CAÍDO</span>.</p>{pie}");
    }

    public async Task SendUpAlertAsync(string equipoNombre, string estacion, string ip, int duracionMin)
    {
        await SendAsync(
            $"[RECUPERADO] {equipoNombre} — {estacion}",
            $"<p>El equipo <b>{equipoNombre}</b> ({ip}) en <b>{estacion}</b> se ha <span style='color:green'>RECUPERADO</span> tras {duracionMin} minutos.</p>");
    }

    private async Task SendAsync(string subject, string htmlBody) =>
        await SendAsync(subject, htmlBody, null);

    private async Task<(string host, int port, string user, string pass)> GetCredencialesAsync()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(cs.ConnectionString).Options);

        var claves = new[] { "smtp_host", "smtp_puerto", "smtp_usuario", "smtp_password" };
        var config = await db.Configuraciones
            .Where(c => claves.Contains(c.Clave))
            .ToDictionaryAsync(c => c.Clave, c => c.Valor);

        var host = config.GetValueOrDefault("smtp_host", "");
        var port = int.TryParse(config.GetValueOrDefault("smtp_puerto", ""), out var p) ? p : 587;
        var user = config.GetValueOrDefault("smtp_usuario", "");
        var pass = config.GetValueOrDefault("smtp_password", "");

        // Fallback a variables de entorno (.env) por compatibilidad con despliegues previos
        if (string.IsNullOrWhiteSpace(host)) host = Environment.GetEnvironmentVariable("SMTP_HOST") ?? "";
        if (string.IsNullOrWhiteSpace(user)) user = Environment.GetEnvironmentVariable("SMTP_USER") ?? "";
        if (string.IsNullOrWhiteSpace(pass)) pass = Environment.GetEnvironmentVariable("SMTP_PASS") ?? "";
        if (port == 587 && int.TryParse(Environment.GetEnvironmentVariable("SMTP_PORT"), out var envPort))
            port = envPort;

        return (host, port, user, pass);
    }

    private async Task<(bool ok, string? error)> SendAsync(string subject, string htmlBody, List<string>? destinatarios)
    {
        var (smtpHost, smtpPort, smtpUser, smtpPass) = await GetCredencialesAsync();

        if (string.IsNullOrEmpty(smtpHost) || string.IsNullOrEmpty(smtpUser))
            return (false, "Falta configurar SMTP Host y/o SMTP Usuario en Configuración.");

        try
        {
            var msg = new MimeMessage();
            msg.From.Add(MailboxAddress.Parse(smtpUser));
            foreach (var to in (destinatarios is { Count: > 0 } ? destinatarios : [smtpUser]))
                msg.To.Add(MailboxAddress.Parse(to));
            msg.Subject = subject;

            var builder = new BodyBuilder { HtmlBody = htmlBody };
            if (htmlBody.Contains($"cid:{LogoContentId}") && File.Exists(LogoPath))
            {
                var logo = builder.LinkedResources.Add(LogoPath);
                logo.ContentId = LogoContentId;
            }
            msg.Body = builder.ToMessageBody();

            using var client = new SmtpClient();
            await client.ConnectAsync(smtpHost, smtpPort, SecureSocketOptions.StartTls);
            await client.AuthenticateAsync(smtpUser, smtpPass);
            await client.SendAsync(msg);
            await client.DisconnectAsync(true);
            return (true, null);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error enviando alerta email: {subject}", subject);
            return (false, $"Error SMTP: {ex.Message}");
        }
    }

    // Badge redondeado de %, coloreado según severidad — reutilizado por los
    // dos correos de discrepancias de abajo.
    private static string PctBadge(double pct, string colorOk, string colorWarn, string colorBad, decimal umbralWarn, decimal umbralBad)
    {
        var (fg, bg) = pct >= (double)umbralBad ? (colorBad, "#FDECEA")
                     : pct >= (double)umbralWarn ? (colorWarn, "#FFF4E5")
                     : (colorOk, "#EAF6EC");
        return $"<span style='display:inline-block;padding:3px 10px;border-radius:999px;font-weight:800;font-size:12.5px;color:{fg};background:{bg};'>{pct}%</span>";
    }

    // ── Reporte diario de discrepancias — vías ordenadas por % de error ───
    public async Task<(bool ok, string message)> SendReporteDiscrepanciasDiarioAsync(
        List<ViaConteoDto> vias, DateTime desde, DateTime hasta, string destinatarios)
    {
        var lista = destinatarios.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        if (lista.Count == 0)
            return (false, "No hay destinatarios configurados (clave 'email_reporte_discrepancias').");
        if (vias.Count == 0)
            return (false, "No hay tránsitos en el período — nada que reportar.");

        const string brand  = "#0F6F5A";
        const string ink    = "#242120";
        const string muted  = "#7a7470";
        const string border = "#e6e2dd";
        var font = "font-family:Segoe UI,Arial,sans-serif;";

        int totalDisc = vias.Sum(v => v.Total);
        int totalTx   = vias.Sum(v => v.TotalTransitos);
        double globalPct = totalTx > 0 ? Math.Round(totalDisc * 100.0 / totalTx, 2) : 0;
        var peor = vias[0]; // ya viene ordenado desc por Pct

        string GlobalColor(double p) => p >= 15 ? "#C62828" : p >= 5 ? "#B26A00" : "#2E7D32";
        string GlobalBg(double p)    => p >= 15 ? "#FDECEA" : p >= 5 ? "#FFF4E5" : "#EAF6EC";

        var sb = new StringBuilder();
        sb.Append($"<div style='{font}background:#f4f2ef;padding:24px 12px;'>");
        sb.Append("<div style='max-width:680px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid " + border + ";'>");

        // Header
        sb.Append($"<div style='background:#ffffff;padding:24px 28px 18px;border-bottom:3px solid {brand};'>");
        sb.Append($"<img src='cid:{LogoContentId}' alt='Pulso Vial' height='34' style='display:block;height:34px;' />");
        sb.Append($"<div style='color:{muted};font-size:13px;font-weight:600;margin-top:10px;'>📊 Reporte diario de discrepancias · últimas 24 horas</div>");
        sb.Append("</div>");

        sb.Append("<div style='padding:24px 28px;'>");
        sb.Append($"<div style='{font}color:{muted};font-size:13px;margin-bottom:20px;'>Período: <b style='color:{ink}'>{desde:dd/MM/yyyy HH:mm}</b> — <b style='color:{ink}'>{hasta:dd/MM/yyyy HH:mm}</b></div>");

        // KPI global + peor vía, lado a lado
        sb.Append("<table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:24px;'><tr>");
        sb.Append($"<td width='50%' style='padding-right:8px;'><div style='background:{GlobalBg(globalPct)};border-radius:8px;padding:16px 18px;'>" +
                   $"<div style='font-size:28px;font-weight:800;color:{GlobalColor(globalPct)};line-height:1;'>{globalPct}%</div>" +
                   $"<div style='{font}font-size:11px;color:{muted};text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-top:6px;'>Discrepancia global · {totalTx} tránsitos</div></div></td>");
        sb.Append($"<td width='50%' style='padding-left:8px;'><div style='background:#faf9f7;border:1px solid {border};border-radius:8px;padding:16px 18px;'>" +
                   $"<div style='font-size:16px;font-weight:800;color:{ink};line-height:1.3;'>{peor.Via} <span style='color:{muted};font-weight:600;font-size:12px;'>· {peor.Estacion}</span></div>" +
                   $"<div style='margin-top:6px;'>{PctBadge(peor.Pct, "#2E7D32", "#B26A00", "#C62828", 5, 15)}<span style='{font}font-size:11px;color:{muted};margin-left:8px;'>peor vía del período</span></div></div></td>");
        sb.Append("</tr></table>");

        sb.Append($"<div style='{font}font-size:15px;font-weight:700;color:{ink};margin-bottom:8px;'>Vías ordenadas por % de discrepancia</div>");
        sb.Append($"<table width='100%' cellpadding='0' cellspacing='0' style='{font}font-size:13px;border-collapse:collapse;'>");
        sb.Append("<tr style='background:#faf9f7;'>" +
                   string.Join("", new[] { "#", "Estación", "Vía", "% Discrepancia", "Discrepancias", "Tránsitos" }
                       .Select(h => $"<th style='text-align:left;padding:8px 10px;color:{muted};font-size:10.5px;text-transform:uppercase;border-bottom:2px solid {border};'>{h}</th>")) +
                   "</tr>");
        for (int i = 0; i < vias.Count; i++)
        {
            var v = vias[i];
            var rowBg = i % 2 == 1 ? "background:#fbfaf9;" : "";
            sb.Append($"<tr style='{rowBg}'>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{muted};font-weight:700;'>{i + 1}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{ink};'>{v.Estacion}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{ink};font-weight:600;'>{v.Via}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};'>{PctBadge(v.Pct, "#2E7D32", "#B26A00", "#C62828", 5, 15)}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{muted};'>{v.Total}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{muted};'>{v.TotalTransitos}</td></tr>");
        }
        sb.Append("</table>");
        sb.Append("</div>"); // padding wrapper

        sb.Append($"<div style='background:#faf9f7;border-top:1px solid {border};padding:14px 28px;{font}font-size:11px;color:{muted};'>");
        sb.Append($"Generado automáticamente por <b style='color:{brand}'>Pulso Vial</b> — dashboard de monitoreo de red vial.");
        sb.Append("</div>");

        sb.Append("</div></div>");

        var (ok, error) = await SendAsync("📊 [Pulso Vial] Reporte diario de discrepancias", sb.ToString(), lista);
        return ok
            ? (true, $"Enviado a {string.Join(", ", lista)}.")
            : (false, error ?? "Error al enviar — revisa la configuración SMTP y los logs del servidor.");
    }

    // ── Alerta: alguna vía superó el umbral de % de discrepancia ──────────
    public async Task<(bool ok, string message)> SendAlertaDiscrepanciasAsync(
        List<ViaConteoDto> vias, double umbral, string destinatarios)
    {
        var lista = destinatarios.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        if (lista.Count == 0)
            return (false, "No hay destinatarios configurados (clave 'email_alerta_discrepancias').");

        const string brand  = "#C62828";
        const string ink    = "#242120";
        const string muted  = "#7a7470";
        const string border = "#e6e2dd";
        var font = "font-family:Segoe UI,Arial,sans-serif;";
        var peor = vias[0];

        var sb = new StringBuilder();
        sb.Append($"<div style='{font}background:#f4f2ef;padding:24px 12px;'>");
        sb.Append("<div style='max-width:680px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid " + border + ";'>");

        // Header — banda roja de alerta
        sb.Append($"<div style='background:{brand};padding:20px 28px;'>");
        sb.Append($"<img src='cid:{LogoContentId}' alt='Pulso Vial' height='30' style='display:block;height:30px;filter:brightness(0) invert(1);' />");
        sb.Append($"<div style='color:#ffffff;font-size:15px;font-weight:800;margin-top:12px;'>⚠ {vias.Count} vía{(vias.Count == 1 ? "" : "s")} sobre el {umbral}% de discrepancia</div>");
        sb.Append($"<div style='color:#ffe8e6;font-size:12.5px;margin-top:2px;'>Detectado en la última hora</div>");
        sb.Append("</div>");

        sb.Append("<div style='padding:24px 28px;'>");

        // Callout de la peor vía
        sb.Append($"<div style='background:#FDECEA;border-radius:8px;padding:16px 18px;margin-bottom:20px;'>" +
                   $"<div style='font-size:16px;font-weight:800;color:{ink};line-height:1.3;'>{peor.Via} <span style='color:{muted};font-weight:600;font-size:12px;'>· {peor.Estacion}</span></div>" +
                   $"<div style='margin-top:6px;'>{PctBadge(peor.Pct, "#2E7D32", "#B26A00", brand, 5, (decimal)umbral)}<span style='{font}font-size:11px;color:{muted};margin-left:8px;'>la más crítica de este grupo</span></div></div>");

        sb.Append($"<table width='100%' cellpadding='0' cellspacing='0' style='{font}font-size:13px;border-collapse:collapse;'>");
        sb.Append("<tr style='background:#faf9f7;'>" +
                   string.Join("", new[] { "#", "Estación", "Vía", "% Discrepancia", "Discrepancias", "Tránsitos" }
                       .Select(h => $"<th style='text-align:left;padding:8px 10px;color:{muted};font-size:10.5px;text-transform:uppercase;border-bottom:2px solid {border};'>{h}</th>")) +
                   "</tr>");
        for (int i = 0; i < vias.Count; i++)
        {
            var v = vias[i];
            var rowBg = i % 2 == 1 ? "background:#fbfaf9;" : "";
            sb.Append($"<tr style='{rowBg}'>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{muted};font-weight:700;'>{i + 1}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{ink};'>{v.Estacion}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{ink};font-weight:600;'>{v.Via}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};'>{PctBadge(v.Pct, "#2E7D32", "#B26A00", brand, 5, (decimal)umbral)}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{muted};'>{v.Total}</td>" +
                      $"<td style='padding:8px 10px;border-bottom:1px solid {border};color:{muted};'>{v.TotalTransitos}</td></tr>");
        }
        sb.Append("</table>");
        sb.Append("</div>"); // padding wrapper

        sb.Append($"<div style='background:#faf9f7;border-top:1px solid {border};padding:14px 28px;{font}font-size:11px;color:{muted};'>");
        sb.Append($"Generado automáticamente por <b style='color:{brand}'>Pulso Vial</b> — dashboard de monitoreo de red vial.");
        sb.Append("</div>");

        sb.Append("</div></div>");

        var (ok, error) = await SendAsync($"⚠ [Pulso Vial] {vias.Count} vía(s) sobre {umbral}% de discrepancia", sb.ToString(), lista);
        return ok
            ? (true, $"Enviado a {string.Join(", ", lista)}.")
            : (false, error ?? "Error al enviar — revisa la configuración SMTP y los logs del servidor.");
    }
}
