using AunorApi.Data;
using AunorApi.Models;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services.NetMon;

// Abre/cierra alertas de red (net_alert) y notifica por Telegram. Estado en memoria por
// enlace (contador de muestras consecutivas); las alertas abiertas viven en BD.
// SATURACION y SIN_DATOS son alertas distintas: "sin datos" nunca se confunde con saturación.
public class NetAlertaService(TelegramAlertService telegram, ILogger<NetAlertaService> log)
{
    readonly Dictionary<int, EvaluadorSaturacion> evaluadores = new();

    public async Task EvaluarSaturacionAsync(AppDbContext db, NetLink link, double? utilPct, DateTime ahoraUtc, CancellationToken ct)
    {
        // LAN u otros enlaces informativos no alertan; sin ancho contratado no hay %.
        if (!link.MedirAlerta || utilPct is null) return;

        if (!evaluadores.TryGetValue(link.Id, out var ev))
        {
            ev = evaluadores[link.Id] = new EvaluadorSaturacion();
            ev.MarcarAbierta(await AbiertaAsync(db, link.Id, NetAlert.Saturacion, ct) is not null);
        }

        var accion = ev.Procesar(utilPct.Value, link.UmbralCritPct);
        var abierta = await AbiertaAsync(db, link.Id, NetAlert.Saturacion, ct);

        if (accion == AccionAlerta.Abrir && abierta is null)
        {
            db.NetAlerts.Add(new NetAlert
            {
                LinkId = link.Id, Tipo = NetAlert.Saturacion, Severidad = "CRITICA",
                InicioUtc = ahoraUtc, ValorMaxPct = utilPct,
            });
            await db.SaveChangesAsync(ct);
            log.LogWarning("NetMon: saturación en {link} ({pct:F0}%)", Nombre(link), utilPct);
            Avisar($"🔴 <b>Saturación de enlace</b> — {Nombre(link)}\nUso: {utilPct:F0}% del ancho contratado (umbral {link.UmbralCritPct:F0}%)");
            return;
        }

        if (abierta is null) return;

        if (utilPct > abierta.ValorMaxPct) abierta.ValorMaxPct = utilPct;
        if (accion == AccionAlerta.Cerrar)
        {
            abierta.FinUtc = ahoraUtc;
            log.LogInformation("NetMon: saturación cerrada en {link}", Nombre(link));
            Avisar($"🟢 <b>Enlace recuperado</b> — {Nombre(link)}\nPico durante la alerta: {abierta.ValorMaxPct:F0}%");
        }
        await db.SaveChangesAsync(ct);
    }

    // fallosConsecutivos = ciclos seguidos sin respuesta de TODAS las unidades del enlace.
    public async Task EvaluarSinDatosAsync(AppDbContext db, NetLink link, int fallosConsecutivos, int umbralFallos, DateTime ahoraUtc, CancellationToken ct)
    {
        var abierta = await AbiertaAsync(db, link.Id, NetAlert.SinDatos, ct);

        if (fallosConsecutivos >= umbralFallos && abierta is null)
        {
            db.NetAlerts.Add(new NetAlert
            {
                LinkId = link.Id, Tipo = NetAlert.SinDatos, Severidad = "AVISO", InicioUtc = ahoraUtc,
            });
            await db.SaveChangesAsync(ct);
            log.LogWarning("NetMon: sin datos de {link}", Nombre(link));
            Avisar($"⚠️ <b>Sin datos</b> — {Nombre(link)}\nEl firewall no responde ({fallosConsecutivos} intentos seguidos). No implica saturación.");
        }
        else if (fallosConsecutivos == 0 && abierta is not null)
        {
            abierta.FinUtc = ahoraUtc;
            await db.SaveChangesAsync(ct);
            log.LogInformation("NetMon: datos restablecidos de {link}", Nombre(link));
            Avisar($"🟢 <b>Datos restablecidos</b> — {Nombre(link)}");
        }
    }

    static Task<NetAlert?> AbiertaAsync(AppDbContext db, int linkId, string tipo, CancellationToken ct) =>
        db.NetAlerts.Where(a => a.LinkId == linkId && a.Tipo == tipo && a.FinUtc == null)
            .OrderByDescending(a => a.InicioUtc).FirstOrDefaultAsync(ct);

    static string Nombre(NetLink l) => $"{l.Device.Sitio} {l.Rol} ({l.Interfaz})";

    // Fire-and-forget: el envío real lo hace TelegramQueueWorker (con su propio throttle).
    void Avisar(string html) => _ = telegram.SendGrupoAsync(html);
}
