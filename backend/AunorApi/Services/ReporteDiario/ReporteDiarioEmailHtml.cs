using System.Globalization;
using System.Net;
using System.Text;
using AunorApi.DTOs;

namespace AunorApi.Services.ReporteDiario;

// HTML del correo del reporte diario. Compatible con clientes de correo (Outlook incluido):
// estilos en línea, tablas en vez de grid/flex, sin degradados ni sombras. Las barras son celdas de
// tabla con ancho en %, los gráficos son PNG incrustados por CID (ChartPng).
// Visual: versión clara del panel de Sigma (docs/Reporte diario Sigma@2x (2).png).
public static class ReporteDiarioEmailHtml
{
    // Paleta
    const string Menta = "#E7F4EF", Borde = "#D5E6DF", Tinta = "#14211E", Apagado = "#5E6E69", Tenue = "#8A9A95", Marca = "#0F6F5A";
    const string Ok = "#0F7A4A", Aviso = "#B26A00", Mal = "#C62828";
    // Misma fuente que el reporte anterior (se veía mejor en Outlook): Segoe UI → Arial
    const string Sans = "font-family:'Segoe UI',Arial,sans-serif;";
    const string Mono = "font-family:Consolas,'Courier New',monospace;";
    static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    // Tinte por tema: fondo, borde, color de etiqueta, barra, pista
    record Tema(string Bg, string Borde, string Label, string Barra, string Pista);
    static readonly Tema Naranja = new("#FDF1DD", "#F3DAAA", "#9A5B0B", "#F0A140", "#F4E2C4");
    static readonly Tema Morado  = new("#F1ECFA", "#DACEF1", "#6B46A8", "#8B5CC9", "#E1D7F2");
    static readonly Tema Verde   = new("#E5F5EA", "#BDE2C9", "#0F7A4A", "#14935B", "#C9E6D4");
    static readonly Tema Rosa    = new("#FCE8E8", "#F2C6C6", "#B3262F", "#E04B55", "#F2CFCF");
    static readonly Tema Celeste = new("#E2F3F8", "#BCE0EC", "#0E7490", "#1596B8", "#C5E4EE");

    public static (string Html, List<(string Cid, byte[] Png)> Imagenes) Construir(ReporteDiarioDto r, string? urlAbrir)
    {
        var img = new List<(string, byte[])>();
        var sb = new StringBuilder();
        var i = r.Indicadores;

        sb.Append($"<!DOCTYPE html><html lang='es' xmlns:v='urn:schemas-microsoft-com:vml' xmlns:o='urn:schemas-microsoft-com:office:office'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta http-equiv='X-UA-Compatible' content='IE=edge'><meta name='x-apple-disable-message-reformatting'><title>Sigma · Reporte diario</title>" +
          "<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>" +
          "<style>table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}img{-ms-interpolation-mode:bicubic;}</style><![endif]--></head>");
        sb.Append($"<body style='margin:0;padding:0;background:{Menta};'>");
        sb.Append($"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:{Menta};'><tr><td align='center' style='padding:24px 8px;'>");
        sb.Append($"<table role='presentation' width='900' cellpadding='0' cellspacing='0' style='width:900px;max-width:900px;{Sans}color:{Tinta};'><tr><td style='padding:4px 28px 8px 28px;'>");

        // ── Encabezado ────────────────────────────────────────────────
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>");
        sb.Append($"<td valign='middle' style='padding:6px 0 18px 0;'><span style='font-size:28px;font-weight:700;letter-spacing:0.32em;color:{Marca};'>SIGMA</span>" +
                  $"&nbsp;&nbsp;&nbsp;&nbsp;<span style='display:inline-block;padding:5px 12px;border:1px solid #BFE0D6;background:#DDF0EA;border-radius:999px;{Mono}font-size:11px;letter-spacing:0.12em;color:{Marca};'>REPORTE DIARIO</span></td>");
        sb.Append($"<td valign='middle' align='right' style='padding:6px 0 18px 0;{Mono}font-size:11.5px;color:{Apagado};line-height:1.6;'>{r.Desde:dd/MM/yyyy HH:mm} → {r.Hasta:dd/MM/yyyy HH:mm}<br>últimas 24 horas</td>");
        sb.Append("</tr></table>");

        // ── 1. Lectura rápida ─────────────────────────────────────────
        sb.Append(Tarjeta($"<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td width='4' bgcolor='#F0A140' style='background:#F0A140;font-size:1px;line-height:1px;mso-line-height-rule:exactly;'>&nbsp;</td>" +
                          $"<td style='padding:2px 0 2px 14px;font-size:14.5px;line-height:1.55;color:{Tinta};'><b>Lectura rápida.</b> {Esc(string.Join(" ", r.LecturaRapida))}</td></tr></table>", 16));
        sb.Append(Esp(14));

        // ── 2. Indicadores ────────────────────────────────────────────
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>");
        sb.Append(Kpi(Naranja, "DISCREPANCIA 24 H", Num(i.Discrepancia.Pct, "0.00"), "%",
            i.Discrepancia.Transitos is { } tx ? $"{tx.ToString("N0", Inv)} tránsitos" : "sin dato de tránsitos",
            Delta(i.Discrepancia.DeltaPt, " pt", " vs ayer", subeEsMalo: true), i.Discrepancia.Pct is { } d ? Math.Min(d / 15 * 100, 100) : null));
        sb.Append(Sp(10));
        sb.Append(Kpi(Morado, "ACIERTO OCR", Num(i.Ocr.Pct, "0.0"), "%", "placas reconocidas",
            Delta(i.Ocr.DeltaPt, " pt", " vs ayer", subeEsMalo: false), i.Ocr.Pct));
        sb.Append(Sp(10));
        sb.Append(Kpi(Verde, "EQUIPOS EN LÍNEA", i.Equipos.EnLinea?.ToString() ?? "sin dato", i.Equipos.Total is { } t ? $" de {t}" : "",
            i.Equipos.SinRespuesta is { } sr ? (sr == 0 ? "todos responden" : $"{sr} sin respuesta") : "sin dato",
            DeltaEntero(i.Equipos.DeltaSinRespuesta, " sin respuesta", " vs ayer"),
            i.Equipos.EnLinea is { } el && i.Equipos.Total is > 0 ? el * 100.0 / i.Equipos.Total : null));
        sb.Append(Sp(10));
        sb.Append(Kpi(Rosa, "INCIDENTES 7 D", i.Incidentes.Total.ToString(), "",
            $"{i.Incidentes.Activos} {(i.Incidentes.Activos == 1 ? "activo" : "activos")} · MTTR {(i.Incidentes.MttrMin is { } m ? $"{m:0} min" : "sin dato")}",
            DeltaEntero(i.Incidentes.DeltaTotal, "", " vs 7 d previos"), i.Incidentes.MttrMin is { } mt ? Math.Min(mt / 240 * 100, 100) : null));
        sb.Append(Sp(10));
        sb.Append(Kpi(Celeste, "DISPONIBILIDAD 30 D", Num(i.Disponibilidad.Pct, "0.00"), "%",
            i.Disponibilidad.Pct is { } dp ? $"{100 - dp:0.00} pp sin conexión" : "sin dato",
            Delta(i.Disponibilidad.DeltaPt, " pt", " vs ayer", subeEsMalo: false), i.Disponibilidad.Pct));
        sb.Append("</tr></table>");
        sb.Append(Esp(14));

        // ── 3. Tendencias 30 días ─────────────────────────────────────
        img.Add(("rd-tend-disc", ChartPng.Tendencia(r.TendenciaDiscrepancia.Puntos.Select(p => p.Valor).ToList(), r.TendenciaDiscrepancia.Promedio, 748, 220, "#B8650A", "#FDEBD0")));
        img.Add(("rd-tend-ocr", ChartPng.Tendencia(r.TendenciaOcr.Puntos.Select(p => p.Valor).ToList(), r.TendenciaOcr.Promedio, 748, 220, "#0F8A56", "#E3F3E9")));
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td width='50%' valign='top'>");
        sb.Append(Tarjeta(Tendencia("Discrepancia · 30 días", r.TendenciaDiscrepancia, "rd-tend-disc"), 20));
        sb.Append("</td>" + Sp(14) + "<td width='50%' valign='top'>");
        sb.Append(Tarjeta(Tendencia("Acierto OCR · 30 días", r.TendenciaOcr, "rd-tend-ocr"), 20));
        sb.Append("</td></tr></table>");
        sb.Append(Esp(14));

        // ── 4 y 5. Sin resolver + disponibilidad por plaza ────────────
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td width='55%' valign='top'>");
        sb.Append(Tarjeta(SinResolver(r.SinResolver), 20));
        sb.Append("</td>" + Sp(14) + "<td width='45%' valign='top'>");
        sb.Append(Tarjeta(DispPlazas(r.DisponibilidadPlazas), 20));
        sb.Append("</td></tr></table>");
        sb.Append(Esp(14));

        // ── 6. Incidentes 24 h ────────────────────────────────────────
        sb.Append(Tarjeta(Incidentes(r.Eventos), 20));
        sb.Append(Esp(14));

        // ── 7. Vías críticas ──────────────────────────────────────────
        sb.Append(Tarjeta(ViasCriticas(r.ViasCriticas, img), 20));
        sb.Append(Esp(14));

        // ── 8. OCR ────────────────────────────────────────────────────
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td width='42%' valign='top'>");
        sb.Append(Tarjeta(OcrCategorias(r.Ocr), 20));
        sb.Append("</td>" + Sp(14) + "<td width='58%' valign='top'>");
        sb.Append(Tarjeta(OcrPlazas(r.Ocr), 20));
        sb.Append("</td></tr></table>");
        sb.Append(Esp(14));

        // ── 9. Latencia ───────────────────────────────────────────────
        sb.Append(Tarjeta(Latencia(r.Latencia, r.UmbralLatenciaMs), 20));
        sb.Append(Esp(14));

        // ── Pie ───────────────────────────────────────────────────────
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>");
        sb.Append($"<td valign='middle' style='{Mono}font-size:10.5px;line-height:1.6;color:{Apagado};padding:4px 16px 12px 0;'>Generado {r.GeneradoEn:dd/MM/yyyy HH:mm} · ventana 08:00 → 08:00 (America/Lima).<br>“sin dato” = la fuente no tiene información; no equivale a 0.</td>");
        if (!string.IsNullOrWhiteSpace(urlAbrir))
            sb.Append($"<td valign='middle' align='right' style='padding:4px 0 12px 0;'><a href='{Esc(urlAbrir)}' style='display:inline-block;background:{Marca};color:#FFFFFF;{Sans}font-size:14px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:10px;'>Abrir en Sigma</a></td>");
        sb.Append("</tr></table>");

        sb.Append("</td></tr></table></td></tr></table></body></html>");
        return (sb.ToString(), img);
    }

    // ── Bloques ──────────────────────────────────────────────────────────
    static string Tarjeta(string interior, int pad) =>
        $"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#FFFFFF;border:1px solid {Borde};border-radius:14px;'><tr><td style='padding:{pad}px;'>{interior}</td></tr></table>";

    // Outlook ignora margin y las celdas vacías: el espacio es una celda con alto exacto
    static string Esp(int px) => $"<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td height='{px}' style='height:{px}px;font-size:1px;line-height:{px}px;mso-line-height-rule:exactly;'>&nbsp;</td></tr></table>";

    // Separador horizontal entre columnas
    static string Sp(int px) => $"<td width='{px}' style='width:{px}px;font-size:1px;line-height:1px;mso-line-height-rule:exactly;'>&nbsp;</td>";

    // Celda de barra con alto exacto (Outlook respeta font-size/line-height en px, no en 0)
    static string Celda(string ancho, string bg, int alto) =>
        $"<td {ancho} height='{alto}' bgcolor='{bg}' style='height:{alto}px;background:{bg};font-size:1px;line-height:{alto}px;mso-line-height-rule:exactly;'>&nbsp;</td>";

    static string Etiqueta(string t) => $"<div style='{Mono}font-size:10.5px;letter-spacing:0.16em;color:{Apagado};text-transform:uppercase;padding-bottom:12px;'>{Esc(t)}</div>";

    static string Titulo(string t, string? derecha = null) =>
        $"<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td style='font-size:17px;font-weight:600;color:{Tinta};padding-bottom:12px;'>{Esc(t)}</td>" +
        (derecha is null ? "" : $"<td align='right' style='{Mono}font-size:11px;color:{Apagado};padding-bottom:12px;'>{Esc(derecha)}</td>") + "</tr></table>";

    static string Kpi(Tema t, string label, string grande, string unidad, string sub, string delta, double? barraPct)
    {
        var sinDato = grande == "sin dato";
        return $"<td width='20%' valign='top' style='background:{t.Bg};border:1px solid {t.Borde};border-radius:14px;padding:14px 14px 14px 14px;'>" +
               $"<div style='{Mono}font-size:9.5px;letter-spacing:0.12em;color:{t.Label};line-height:1.4;height:28px;'>● {Esc(label)}</div>" +
               $"<div style='padding-top:4px;color:{(sinDato ? Tenue : Tinta)};line-height:1.1;'><span style='font-family:'Segoe UI',Arial,sans-serif;font-size:{(sinDato ? 22 : 38)}px;font-weight:normal;'>{Esc(grande)}</span><span style='font-size:{(unidad.StartsWith('%') ? 20 : 14)}px;color:{Apagado};'>{Esc(unidad)}</span></div>" +
               $"<div style='font-size:11.5px;color:{Apagado};padding-top:6px;'>{Esc(sub)}</div>" +
               $"<div style='font-size:11.5px;font-weight:700;padding-top:4px;padding-bottom:8px;'>{delta}</div>" +
               Barra(barraPct, t.Barra, t.Pista, 6) + "</td>";
    }

    // Barra de progreso: dos celdas con ancho en %. null = solo pista (sin dato)
    static string Barra(double? pct, string color, string pista, int alto)
    {
        var p = pct is null ? 0 : Math.Clamp(pct.Value, 0, 100);
        var fill = p <= 0 ? "" : Celda($"width='{p.ToString("0.##", Inv)}%'", color, alto);
        var rest = p >= 100 ? "" : Celda("", pista, alto);
        return $"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' bgcolor='{pista}' style='background:{pista};'><tr>{fill}{rest}</tr></table>";
    }

    static string Delta(double? v, string unidad, string sufijo, bool subeEsMalo)
    {
        if (v is null) return $"<span style='color:{Tenue};font-weight:400;'>sin dato{Esc(sufijo)}</span>";
        if (Math.Abs(v.Value) < 0.005) return $"<span style='color:{Apagado};'>= 0.0{Esc(unidad)}{Esc(sufijo)}</span>";
        var sube = v > 0;
        var color = sube == subeEsMalo ? Aviso : Ok;
        return $"<span style='color:{color};'>{(sube ? "▲" : "▼")} {Math.Abs(v.Value).ToString("0.0#", Inv)}{Esc(unidad)}{Esc(sufijo)}</span>";
    }

    // Para conteos donde subir es malo (equipos caídos, incidentes)
    static string DeltaEntero(int? v, string unidad, string sufijo)
    {
        if (v is null) return $"<span style='color:{Tenue};font-weight:400;'>sin dato{Esc(sufijo)}</span>";
        if (v == 0) return $"<span style='color:{Apagado};'>= 0{Esc(unidad)}{Esc(sufijo)}</span>";
        return $"<span style='color:{(v > 0 ? Mal : Ok)};'>{(v > 0 ? "▲" : "▼")} {Math.Abs(v.Value)}{Esc(unidad)}{Esc(sufijo)}</span>";
    }

    static string Tendencia(string titulo, RdTendencia t, string cid)
    {
        var hay = t.Puntos.Any(p => p.Valor.HasValue);
        return Titulo(titulo, t.Promedio is { } p ? $"prom. {p.ToString("0.0", Inv)}%" : "sin promedio") +
               (hay ? $"<img src='cid:{cid}' width='374' height='110' alt='{Esc(titulo)}' style='display:block;width:374px;height:110px;border:0;-ms-interpolation-mode:bicubic;'>"
                    : $"<div style='height:110px;{Mono}font-size:12px;color:{Tenue};padding-top:44px;text-align:center;'>sin dato</div>");
    }

    static string Duracion(int? min)
    {
        if (min is null) return "sin dato";
        if (min < 60) return $"{min} min";
        if (min < 48 * 60) return $"{min / 60} h";
        return $"{min / 1440} d {min % 1440 / 60} h";
    }

    static string SinResolver(List<RdPendiente> l)
    {
        var sb = new StringBuilder(Etiqueta("Equipos y servicios sin resolver"));
        if (l.Count == 0)
            return sb.Append($"<div style='font-size:14px;color:{Ok};font-weight:600;padding:6px 0;'>● Todo en línea — nada pendiente</div>").ToString();
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>");
        for (int k = 0; k < Math.Min(l.Count, 8); k++)
        {
            var p = l[k];
            var borde = k == 0 ? "" : $"border-top:1px solid {Borde};";
            var detalle = string.Join(" · ", new[] { p.Plaza, p.Via is null ? null : $"vía {p.Via}", p.SinDato ? "sin dato de monitoreo" : (p.Nota ?? "sin respuesta") }.Where(x => !string.IsNullOrEmpty(x)));
            sb.Append($"<tr><td width='18' valign='top' style='padding:12px 0;{borde}color:{(p.SinDato ? "#9AA5A2" : "#D64550")};font-size:13px;'>●</td>" +
                      $"<td valign='top' style='padding:10px 0;{borde}'><div style='font-size:15px;font-weight:600;'>{Esc(p.Nombre)}</div><div style='font-size:12.5px;color:{Apagado};padding-top:2px;'>{Esc(detalle)}</div></td>" +
                      $"<td align='right' valign='top' style='padding:10px 0;{borde}'>" +
                      (p.SinDato ? $"<span style='font-size:13px;color:{Tenue};'>sin dato</span>"
                                 : $"<div style='font-size:21px;font-weight:600;color:{Mal};'>{Duracion(p.MinutosSinServicio)}</div><div style='font-size:11.5px;color:{Apagado};'>sin servicio</div>") +
                      "</td></tr>");
        }
        sb.Append("</table>");
        if (l.Count > 8) sb.Append($"<div style='{Mono}font-size:11px;color:{Apagado};padding-top:8px;'>y {l.Count - 8} más — ver en Sigma</div>");
        return sb.ToString();
    }

    static string DispPlazas(List<RdPlazaDisp> l)
    {
        var sb = new StringBuilder(Etiqueta("Disponibilidad 30 d · por plaza"));
        if (l.Count == 0) return sb.Append($"<div style='font-size:13px;color:{Tenue};'>sin dato</div>").ToString();
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>");
        var w = 100 / l.Count;
        foreach (var p in l)
        {
            var borde = p.EsMenor ? "#F0A140" : Borde; var bg = p.EsMenor ? "#FDF1DD" : "#FFFFFF";
            sb.Append($"<td width='{w}%' align='center' style='padding:0 3px;'><table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:{bg};border:1.5px solid {borde};border-radius:10px;'><tr><td align='center' style='padding:10px 2px;'>" +
                      $"<div style='font-size:17px;font-weight:600;color:{(p.Pct is null ? Tenue : Tinta)};'>{Num(p.Pct, "0.00")}</div><div style='font-size:11px;color:{Apagado};padding-top:3px;'>{Esc(p.Plaza)}</div></td></tr></table></td>");
        }
        sb.Append("</tr></table>");
        var menor = l.FirstOrDefault(p => p.EsMenor);
        if (menor is not null) sb.Append($"<div style='font-size:13px;color:{Apagado};padding-top:14px;'>{Esc(menor.Plaza)} es la plaza con menor disponibilidad del mes.</div>");
        return sb.ToString();
    }

    static string Incidentes(List<RdEvento> eventos)
    {
        var sb = new StringBuilder(Etiqueta("Incidentes de las últimas 24 h"));
        if (eventos.Count == 0)
            return sb.Append($"<div style='font-size:14px;color:{Ok};font-weight:600;padding:6px 0;'>● Sin incidentes en las últimas 24 h</div>").ToString();

        foreach (var e in eventos.Where(x => x.EventoComun))
        {
            sb.Append($"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#FCE8E8;border:1px solid #F2C6C6;border-radius:10px;'><tr><td style='padding:14px 16px;'>" +
                      $"<div style='font-size:15px;font-weight:700;'>Evento común · {Esc(e.Plaza)} · {e.Inicio:HH:mm}{(e.Fin > e.Inicio ? $" a {e.Fin:HH:mm}" : "")}</div>" +
                      $"<div style='font-size:13.5px;color:#4A3A3A;padding-top:4px;line-height:1.5;'>{e.Equipos.Count} equipos reportaron a la vez. {Esc(e.Causa ?? "")}.{(e.DuracionPorConfirmar ? " Duración por confirmar." : "")}</div></td></tr></table>" + Esp(10));
            sb.Append(Grilla(e.Equipos.Select(q => (q.Nombre, $"{e.Plaza}{(q.Via is null ? "" : $" · vía {q.Via}")} · {q.Tipo}", q.Inicio)).ToList()));
        }
        var sueltos = eventos.Where(x => !x.EventoComun).SelectMany(e => e.Equipos.Select(q => (q.Nombre, $"{e.Plaza}{(q.Via is null ? "" : $" · vía {q.Via}")} · {q.Tipo}", q.Inicio))).ToList();
        if (sueltos.Count > 0)
        {
            if (eventos.Any(x => x.EventoComun)) sb.Append(Esp(8));
            sb.Append(Grilla(sueltos.Take(6).ToList()));
            if (sueltos.Count > 6) sb.Append($"<div style='{Mono}font-size:11px;color:{Apagado};padding-top:8px;'>y {sueltos.Count - 6} incidentes más — ver en Sigma</div>");
        }
        return sb.ToString();
    }

    static string Grilla(List<(string Nombre, string Sub, DateTime Inicio)> items)
    {
        var sb = new StringBuilder("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>");
        for (int k = 0; k < items.Count; k += 2)
        {
            sb.Append("<tr>");
            for (int c = 0; c < 2; c++)
            {
                if (k + c < items.Count)
                {
                    var it = items[k + c];
                    sb.Append($"<td width='50%' valign='top' style='padding:0 {(c == 0 ? "6px 8px 0" : "0 8px 6px")};'><table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border:1px solid {Borde};border-radius:10px;'><tr>" +
                              $"<td style='padding:10px 12px;'><div style='font-size:14px;font-weight:600;'>{Esc(it.Nombre)}</div><div style='font-size:12px;color:{Apagado};padding-top:2px;'>{Esc(it.Sub)}</div></td>" +
                              $"<td align='right' valign='top' style='padding:10px 12px;{Mono}font-size:11.5px;color:{Apagado};white-space:nowrap;'>{it.Inicio:dd/MM HH:mm}</td></tr></table></td>");
                }
                else sb.Append("<td width='50%'></td>");
            }
            sb.Append("</tr>");
        }
        return sb.Append("</table>").ToString();
    }

    static string ViasCriticas(List<RdViaCritica> vias, List<(string, byte[])> img)
    {
        var sb = new StringBuilder(Titulo("Vías más críticas", "cambio vs ayer · tendencia 7 días"));
        if (vias.Count == 0)
            return sb.Append($"<div style='font-size:13px;color:{Tenue};padding:8px 0;'>sin dato</div>").ToString();

        sb.Append($"<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr style='{Mono}font-size:10.5px;letter-spacing:0.12em;color:{Apagado};'>" +
                  "<td width='28' style='padding-bottom:8px;'>#</td><td width='150' style='padding-bottom:8px;'>VÍA</td><td style='padding-bottom:8px;'>% DISCREPANCIA</td>" +
                  "<td width='72' align='right' style='padding-bottom:8px;'></td><td width='96' align='right' style='padding-bottom:8px;'>VS AYER</td><td width='100' align='right' style='padding-bottom:8px;'>7 DÍAS</td></tr>");
        var max = vias.Max(v => v.Pct);
        for (int k = 0; k < vias.Count; k++)
        {
            var v = vias[k];
            var cid = $"rd-spark-{k}";
            var up = v.DeltaPt > 0.005;
            img.Add((cid, ChartPng.Spark(v.Tendencia7d.Select(p => p.Valor).ToList(), 168, 56, up ? "#C26A12" : v.DeltaPt < -0.005 ? "#0F8A56" : "#6E8A83")));
            var borde = $"border-top:1px solid {Borde};";
            sb.Append($"<tr><td style='padding:10px 0;{borde}color:{Apagado};font-weight:600;'>{k + 1}</td>" +
                      $"<td style='padding:10px 0;{borde}font-size:14.5px;'><b>{Esc(v.Via)}</b> <span style='color:{Apagado};'>· {Esc(v.Plaza)}</span></td>" +
                      $"<td style='padding:10px 12px 10px 0;{borde}'>{Barra(v.Pct / max * 100, v.Pct >= 15 ? "#E04B55" : "#F0A140", "#F8ECD8", 8)}</td>" +
                      $"<td align='right' style='padding:10px 0;{borde}font-size:14.5px;font-weight:700;color:{Aviso};'>{v.Pct.ToString("0.00", Inv)}%</td>" +
                      $"<td align='right' style='padding:10px 0;{borde}font-size:13px;font-weight:700;'>{Delta(v.DeltaPt, " pt", "", true)}</td>" +
                      $"<td align='right' style='padding:6px 0;{borde}'><img src='cid:{cid}' width='84' height='28' alt='' style='display:inline-block;width:84px;height:28px;border:0;-ms-interpolation-mode:bicubic;'></td></tr>");
        }
        return sb.Append("</table>").ToString();
    }

    static string OcrCategorias(RdOcr o)
    {
        var sb = new StringBuilder(Titulo("Lectura de placas · OCR"));
        string[] colores = [Ok, "#E04B55", "#F0A140", "#8A9A95"];
        if (o.Categorias.All(c => c.Pct is null))
            return sb.Append($"<div style='font-size:13px;color:{Tenue};padding:8px 0;'>sin dato</div>").ToString();
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>");
        for (int k = 0; k < o.Categorias.Count; k++)
            if (o.Categorias[k].Pct is { } p && p > 0)
                sb.Append(Celda($"width='{p.ToString("0.##", Inv)}%'", colores[k], 10));
        sb.Append("</tr></table>" + Esp(12) + "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>");
        for (int k = 0; k < o.Categorias.Count; k++)
        {
            var c = o.Categorias[k]; var borde = k == 0 ? "" : $"border-top:1px solid {Borde};";
            sb.Append($"<tr><td width='22' style='padding:9px 0;{borde}'><span style='display:inline-block;width:10px;height:10px;background:{colores[k]};'></span></td>" +
                      $"<td style='padding:9px 0;{borde}font-size:14px;'>{Esc(c.Nombre)}</td><td align='right' style='padding:9px 0;{borde}font-size:14px;font-weight:700;'>{(c.Pct is { } v ? v.ToString("0.0", Inv) + "%" : "sin dato")}</td></tr>");
        }
        return sb.Append("</table>").ToString();
    }

    static string OcrPlazas(RdOcr o)
    {
        var sb = new StringBuilder(Titulo("Acierto OCR por plaza", "vs ayer"));
        if (o.PorPlaza.Count == 0) sb.Append($"<div style='font-size:13px;color:{Tenue};padding:8px 0;'>sin dato</div>");
        else
        {
            sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>");
            foreach (var p in o.PorPlaza)
            {
                var color = p.Pct is null ? "#C9D6D2" : p.Pct >= 80 ? "#14935B" : p.Pct >= 70 ? "#F0A140" : "#E04B55";
                sb.Append($"<tr><td width='96' style='padding:7px 0;font-size:14.5px;font-weight:700;'>{Esc(p.Plaza)}</td>" +
                          $"<td style='padding:7px 12px 7px 0;'>{Barra(p.Pct, color, "#E9EFED", 8)}</td>" +
                          $"<td width='56' align='right' style='padding:7px 0;font-size:14px;font-weight:700;'>{(p.Pct is { } v ? Math.Round(v).ToString("0", Inv) + "%" : "sin dato")}</td>" +
                          $"<td width='100' align='right' style='padding:7px 0;font-size:13px;font-weight:700;'>{Delta(p.DeltaPt, " pt", "", false)}</td></tr>");
            }
            sb.Append("</table>");
        }

        sb.Append($"<div style='{Mono}font-size:10.5px;letter-spacing:0.14em;color:{Apagado};padding:16px 0 8px 0;'>PLACAS NO RECONOCIDAS FRECUENTES</div>");
        if (o.PlacasFrecuentes.Count == 0)
            return sb.Append($"<div style='font-size:13px;color:{Tenue};'>Sin placas repetidas en el período.</div>").ToString();
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>");
        for (int k = 0; k < 3; k++)
        {
            if (k < o.PlacasFrecuentes.Count)
            {
                var p = o.PlacasFrecuentes[k];
                // No hay imagen de la placa en el origen de datos: el recuadro muestra la placa y cuántas veces se repitió
                sb.Append($"<td width='33%' valign='top' style='padding:0 {(k == 2 ? 0 : 5)}px 0 {(k == 0 ? 0 : 5)}px;'><table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border:1px solid {Borde};border-radius:10px;'>" +
                          $"<tr><td align='center' style='background:#EAF2EF;border-radius:9px 9px 0 0;padding:16px 4px;{Mono}font-size:15px;font-weight:700;letter-spacing:0.08em;color:{Tinta};'>{Esc(p.Placa)}<div style='font-size:10.5px;font-weight:400;color:{Apagado};letter-spacing:0;padding-top:3px;'>{(p.ImagenUrl is null ? "× " + p.Veces + " veces" : "")}</div></td></tr>" +
                          $"<tr><td style='padding:9px 10px;'><div style='font-size:13px;font-weight:700;'>{Esc(p.Via)} · {Esc(p.Plaza)}</div><div style='font-size:12px;color:{Apagado};padding-top:2px;'>{Esc(p.Motivo ?? "motivo no disponible")}</div></td></tr></table></td>");
            }
            else sb.Append("<td width='33%'></td>");
        }
        return sb.Append("</tr></table>").ToString();
    }

    static string Latencia(List<RdLatencia> l, double umbral)
    {
        var sb = new StringBuilder(Titulo("Latencia por sitio", $"umbral {umbral:0} ms"));
        if (l.Count == 0) return sb.Append($"<div style='font-size:13px;color:{Tenue};'>sin dato</div>").ToString();
        var tope = Math.Max(umbral * 2, (l.Where(x => x.Ms.HasValue).Select(x => x.Ms!.Value).DefaultIfEmpty(0).Max()) * 1.1);
        sb.Append("<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>");
        foreach (var s in l)
        {
            var color = s.Ms is null ? Tenue : s.SuperaUmbral ? Mal : Ok;
            var fill = s.Ms is null ? 0 : Math.Min(s.Ms.Value / tope * 100, 100);
            var mk = umbral / tope * 100;
            // Barra segmentada: relleno hasta el umbral | marca del umbral | relleno restante | pista
            var segs = new StringBuilder();
            void Seg(double w, string bg) { if (w > 0.01) segs.Append(Celda($"width='{w.ToString("0.##", Inv)}%'", bg, 8)); }
            var barra = s.SuperaUmbral ? "#E04B55" : "#14935B";
            Seg(Math.Min(fill, mk), fill > 0 ? barra : "#ECF0EF");
            if (fill < mk) Seg(mk - fill, "#ECF0EF");
            Seg(0.6, "#5E6E69");
            if (fill > mk) Seg(fill - mk, barra);
            Seg(100 - Math.Max(fill, mk) - 0.6, "#ECF0EF");
            sb.Append($"<tr><td width='110' style='padding:8px 0;font-size:14.5px;font-weight:700;color:{color};'>{Esc(s.Sitio)}</td>" +
                      $"<td style='padding:8px 14px;'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>{segs}</tr></table></td>" +
                      $"<td width='80' align='right' style='padding:8px 0;font-size:14.5px;font-weight:700;color:{(s.Ms is null ? Tenue : Tinta)};'>{(s.Ms is { } ms ? $"{ms.ToString("0.#", Inv)} ms" : "sin dato")}{(s.EsActual ? $"<div style='font-size:10px;font-weight:400;color:{Apagado};'>actual</div>" : "")}</td></tr>");
        }
        return sb.Append("</table>").ToString();
    }

    // ── Utilidades ───────────────────────────────────────────────────────
    static string Num(double? v, string fmt) => v is { } x ? x.ToString(fmt, Inv) : "sin dato";
    static string Esc(string? s) => WebUtility.HtmlEncode(s ?? "");
}
