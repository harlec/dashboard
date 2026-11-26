using AunorApi.DTOs;

namespace AunorApi.Services.ReporteDiario;

// Reglas puras del reporte diario (sin acceso a BD) — cubiertas por ReporteDiarioReglasTests.
public static class ReporteDiarioReglas
{
    // ── Disponibilidad ───────────────────────────────────────────────────
    //   Disponibilidad = tiempo operativo / tiempo total × 100
    //   tiempo operativo = tiempo total − minutos caídos
    //   · Se pondera por minutos monitoreados (no es el promedio simple de los % de cada equipo).
    //   · Por defecto las caídas de tipo Mantenimiento y ReinicioForzado NO restan (son paradas
    //     autorizadas); con incluirMantenimiento = true sí restan.
    //   · Un incidente abierto cuenta hasta el fin del período; el que empezó antes del período
    //     cuenta desde el inicio del período (recorte hecho en ReporteService.ComputeSlaAsync).
    //   · Sin tiempo monitoreado (totalMin <= 0) → null ("sin dato"), nunca 100 ni 0.
    // La implementación por equipo vive en ReporteService.ComputeSlaAsync; esto es la fórmula agregada.
    public static double? Disponibilidad(long totalMin, long minCaidos)
    {
        if (totalMin <= 0) return null;
        var caidos = Math.Clamp(minCaidos, 0, totalMin);
        return Math.Round((totalMin - caidos) * 100.0 / totalMin, 2);
    }

    // ── Deltas ───────────────────────────────────────────────────────────
    // Diferencia en puntos porcentuales; null si falta cualquiera de los dos datos.
    public static double? DeltaPt(double? hoy, double? ayer) =>
        hoy is null || ayer is null ? null : Math.Round(hoy.Value - ayer.Value, 2);

    public static double? Pct(int? parte, int? total) =>
        parte is null || total is null || total <= 0 ? null : Math.Round(parte.Value * 100.0 / total.Value, 2);

    // Promedio ignorando los días sin dato; null si ninguno tiene dato.
    public static double? Promedio(IEnumerable<double?> valores)
    {
        var v = valores.Where(x => x.HasValue).Select(x => x!.Value).ToList();
        return v.Count == 0 ? null : Math.Round(v.Average(), 2);
    }

    // ── Evento común ─────────────────────────────────────────────────────
    public record CaidaEquipo(int EquipoId, string Nombre, string Plaza, string? Via, DateTime Inicio, DateTime? Fin, string Tipo);

    // Si minEquipos o más equipos DISTINTOS de la misma plaza pasan a caído dentro de ventanaMin minutos
    // (contados desde la primera caída del grupo), se agrupan en UN evento común. Solo cuentan las caídas
    // de tipo "Real" (las de mantenimiento no son una falla). El resto se devuelve como evento individual.
    public static List<RdEvento> AgruparEventos(IEnumerable<CaidaEquipo> caidas, int minEquipos, int ventanaMin)
    {
        var eventos = new List<RdEvento>();
        foreach (var plaza in caidas.GroupBy(c => c.Plaza))
        {
            var lista = plaza.OrderBy(c => c.Inicio).ToList();
            var usados = new bool[lista.Count];
            for (int i = 0; i < lista.Count; i++)
            {
                if (usados[i]) continue;
                if (lista[i].Tipo == "Real" && minEquipos > 1)
                {
                    var tope = lista[i].Inicio.AddMinutes(ventanaMin);
                    var grupo = new List<int>();
                    for (int j = i; j < lista.Count && lista[j].Inicio <= tope; j++)
                        if (!usados[j] && lista[j].Tipo == "Real") grupo.Add(j);
                    if (grupo.Select(j => lista[j].EquipoId).Distinct().Count() >= minEquipos)
                    {
                        foreach (var j in grupo) usados[j] = true;
                        var miembros = grupo.Select(j => lista[j]).ToList();
                        eventos.Add(new RdEvento(true, plaza.Key, miembros.Min(m => m.Inicio), miembros.Max(m => m.Inicio),
                            miembros.Any(m => m.Fin is null), "Posible causa común: enlace o switch de la plaza",
                            miembros.Select(m => new RdEventoEquipo(m.Nombre, m.Via, m.Inicio, m.Tipo)).ToList()));
                        continue;
                    }
                }
                usados[i] = true;
                var c = lista[i];
                eventos.Add(new RdEvento(false, plaza.Key, c.Inicio, c.Inicio, c.Fin is null, null,
                    [new RdEventoEquipo(c.Nombre, c.Via, c.Inicio, c.Tipo)]));
            }
        }
        // Eventos comunes primero, luego por hora de inicio
        return eventos.OrderByDescending(e => e.EventoComun).ThenBy(e => e.Inicio).ToList();
    }

    // ── Lectura rápida ───────────────────────────────────────────────────
    public record EntradaLectura(
        double? DiscrepanciaHoy, double? DiscrepanciaPromedio30d, double MargenPt,
        List<string> PlazasConcentradas,
        int EquiposSinRespuestaMas24h, int? HorasMayorSinRespuesta,
        RdEvento? EventoComun);

    // 1 o 2 frases generadas con reglas simples:
    //  R1 discrepancia hoy > promedio 30 d + margen
    //  R2 equipos sin respuesta > 24 h
    //  R3 evento común detectado
    // Frase 1 = R1 (si aplica); frase 2 = R2 y R3 unidas. Sin reglas activas → una frase neutra.
    public static List<string> LecturaRapida(EntradaLectura e)
    {
        string? r1 = null;
        if (e.DiscrepanciaHoy is { } hoy && e.DiscrepanciaPromedio30d is { } prom && hoy > prom + e.MargenPt)
        {
            r1 = $"La discrepancia global ({hoy:0.0#}%) subió sobre el promedio de 30 días ({prom:0.0#}%)";
            if (e.PlazasConcentradas.Count > 0)
                r1 += $" y se concentra en {Lista(e.PlazasConcentradas)}";
            r1 += ".";
        }

        var partes = new List<string>();
        if (e.EquiposSinRespuestaMas24h > 0)
        {
            var n = e.EquiposSinRespuestaMas24h;
            var h = e.HorasMayorSinRespuesta is { } hh ? $" (el mayor, desde hace {hh} h)" : "";
            partes.Add(n == 1 ? $"hay 1 equipo sin respuesta hace más de 24 h{h}"
                              : $"hay {n} equipos sin respuesta hace más de 24 h{h}");
        }
        if (e.EventoComun is { } ev)
        {
            var n = ev.Equipos.Count;
            partes.Add($"{n} equipos de {ev.Plaza} cayeron juntos a las {ev.Inicio:HH:mm}, lo que apunta a una falla común (enlace o switch) y no a equipos sueltos");
        }

        var frases = new List<string>();
        if (r1 != null) frases.Add(r1);
        if (partes.Count > 0)
        {
            var s = string.Join(" y ", partes);
            frases.Add(char.ToUpper(s[0]) + s[1..] + ".");
        }
        if (frases.Count == 0) frases.Add("Sin novedades relevantes: la operación se mantuvo dentro de lo normal en las últimas 24 horas.");
        return frases;
    }

    private static string Lista(List<string> items) =>
        items.Count == 1 ? items[0] : string.Join(", ", items.Take(items.Count - 1)) + " y " + items[^1];
}
