using AunorApi.Services.ReporteDiario;
using Xunit;
using static AunorApi.Services.ReporteDiario.ReporteDiarioReglas;

namespace AunorApi.Tests;

public class ReporteDiarioReglasTests
{
    static readonly DateTime T0 = new(2026, 11, 25, 2, 40, 0);
    static CaidaEquipo C(int id, string plaza, int minDesdeT0, string tipo = "Real", DateTime? fin = null) =>
        new(id, $"Equipo {id}", plaza, "602", T0.AddMinutes(minDesdeT0), fin, tipo);

    // ── Disponibilidad ───────────────────────────────────────────────────
    [Fact]
    public void Disponibilidad_es_operativo_sobre_total()
    {
        // 30 días = 43 200 min; 150 min caídos → 99.65 %
        Assert.Equal(99.65, Disponibilidad(43_200, 150));
        Assert.Equal(100.0, Disponibilidad(1000, 0));
    }

    [Fact]
    public void Disponibilidad_sin_tiempo_monitoreado_es_sin_dato_no_cero()
    {
        Assert.Null(Disponibilidad(0, 0));
        Assert.Null(Disponibilidad(-5, 0));
    }

    [Fact]
    public void Disponibilidad_acota_los_minutos_caidos_al_total()
    {
        Assert.Equal(0.0, Disponibilidad(100, 500));
        Assert.Equal(100.0, Disponibilidad(100, -3));
    }

    // ── Deltas ───────────────────────────────────────────────────────────
    [Fact]
    public void Delta_es_hoy_menos_ayer_y_null_si_falta_un_dato()
    {
        Assert.Equal(0.9, DeltaPt(7.54, 6.64));
        Assert.Equal(-0.6, DeltaPt(11.25, 11.85));
        Assert.Null(DeltaPt(7.5, null));
        Assert.Null(DeltaPt(null, 7.5));
    }

    [Fact]
    public void Pct_sin_denominador_es_sin_dato()
    {
        Assert.Null(Pct(5, 0));
        Assert.Null(Pct(null, 10));
        Assert.Equal(50.0, Pct(5, 10));
    }

    [Fact]
    public void Promedio_ignora_dias_sin_dato()
    {
        Assert.Equal(6.0, Promedio([5.0, null, 7.0]));
        Assert.Null(Promedio([null, null]));
    }

    // ── Evento común ─────────────────────────────────────────────────────
    [Fact]
    public void Tres_equipos_de_la_misma_plaza_en_10_min_forman_un_evento_comun()
    {
        var ev = AgruparEventos([C(1, "KM 402", 0), C(2, "KM 402", 3), C(3, "KM 402", 8)], 3, 10);
        var e = Assert.Single(ev);
        Assert.True(e.EventoComun);
        Assert.Equal(3, e.Equipos.Count);
        Assert.Equal(T0, e.Inicio);
        Assert.Equal(T0.AddMinutes(8), e.Fin);
    }

    [Fact]
    public void Dos_equipos_no_alcanzan_el_minimo()
    {
        var ev = AgruparEventos([C(1, "KM 402", 0), C(2, "KM 402", 3)], 3, 10);
        Assert.Equal(2, ev.Count);
        Assert.All(ev, e => Assert.False(e.EventoComun));
    }

    [Fact]
    public void Fuera_de_la_ventana_no_se_agrupan()
    {
        var ev = AgruparEventos([C(1, "KM 402", 0), C(2, "KM 402", 6), C(3, "KM 402", 11)], 3, 10);
        Assert.DoesNotContain(ev, e => e.EventoComun);
    }

    [Fact]
    public void Plazas_distintas_no_se_mezclan()
    {
        var ev = AgruparEventos([C(1, "KM 402", 0), C(2, "Virú", 1), C(3, "KM 402", 2)], 3, 10);
        Assert.DoesNotContain(ev, e => e.EventoComun);
    }

    [Fact]
    public void El_mismo_equipo_cayendo_dos_veces_cuenta_una_sola_vez()
    {
        var ev = AgruparEventos([C(1, "KM 402", 0), C(1, "KM 402", 2), C(2, "KM 402", 4)], 3, 10);
        Assert.DoesNotContain(ev, e => e.EventoComun);
    }

    [Fact]
    public void Las_caidas_en_mantenimiento_no_cuentan_como_falla_comun()
    {
        var ev = AgruparEventos([C(1, "KM 402", 0), C(2, "KM 402", 1, "Mantenimiento"), C(3, "KM 402", 2, "Mantenimiento")], 3, 10);
        Assert.DoesNotContain(ev, e => e.EventoComun);
    }

    [Fact]
    public void Parametros_configurables_ventana_y_minimo()
    {
        var caidas = new[] { C(1, "Santa", 0), C(2, "Santa", 14) };
        Assert.Single(AgruparEventos(caidas, 2, 15), e => e.EventoComun);
        Assert.DoesNotContain(AgruparEventos(caidas, 2, 10), e => e.EventoComun);
    }

    [Fact]
    public void Evento_con_equipo_aun_caido_queda_con_duracion_por_confirmar()
    {
        var ev = AgruparEventos([C(1, "KM 402", 0, fin: T0.AddMinutes(30)), C(2, "KM 402", 1), C(3, "KM 402", 2, fin: T0.AddMinutes(20))], 3, 10);
        Assert.True(Assert.Single(ev).DuracionPorConfirmar);
    }

    [Fact]
    public void Un_evento_comun_no_se_come_las_caidas_sueltas_posteriores()
    {
        var ev = AgruparEventos([C(1, "KM 402", 0), C(2, "KM 402", 1), C(3, "KM 402", 2), C(4, "KM 402", 120)], 3, 10);
        Assert.Equal(2, ev.Count);
        Assert.True(ev[0].EventoComun);
        Assert.False(ev[1].EventoComun);
    }

    // ── Lectura rápida ───────────────────────────────────────────────────
    static EntradaLectura L(double? hoy = 7.54, double? prom = 6.4, int sinResp = 0, int? horas = null, CaidaEquipo[]? comun = null) =>
        new(hoy, prom, 1.0, ["KM 402", "Fortaleza"], sinResp, horas,
            comun is null ? null : AgruparEventos(comun, 3, 10).First(e => e.EventoComun));

    [Fact]
    public void Lectura_discrepancia_sobre_promedio_mas_un_punto()
    {
        var f = Assert.Single(LecturaRapida(L()));
        Assert.Contains("subió sobre el promedio", f);
        Assert.Contains("KM 402 y Fortaleza", f);
    }

    [Fact]
    public void Lectura_no_dice_que_subio_si_la_diferencia_es_menor_al_margen()
    {
        var f = Assert.Single(LecturaRapida(L(hoy: 7.0, prom: 6.4)));
        Assert.StartsWith("Sin novedades", f);
    }

    [Fact]
    public void Lectura_incluye_equipos_caidos_mas_de_24h_y_evento_comun_en_dos_frases()
    {
        var comun = new[] { C(1, "KM 402", 0), C(2, "KM 402", 1), C(3, "KM 402", 2), C(4, "KM 402", 3) };
        var frases = LecturaRapida(L(sinResp: 1, horas: 35, comun: comun));
        Assert.Equal(2, frases.Count);
        Assert.Contains("1 equipo sin respuesta hace más de 24 h", frases[1]);
        Assert.Contains("4 equipos de KM 402 cayeron juntos a las 02:40", frases[1]);
    }

    [Fact]
    public void Lectura_sin_dato_de_discrepancia_no_inventa_comparacion()
    {
        var f = Assert.Single(LecturaRapida(L(hoy: null)));
        Assert.StartsWith("Sin novedades", f);
    }
}

public class ChartPngTests
{
    [Fact]
    public void Genera_png_valido_con_huecos_sin_dato()
    {
        var png = ChartPng.Tendencia([5, 6, null, 7, 8, 9], 6.5, 200, 60, "#B8650A", "#FDEBD0");
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, png[..8]);
        Assert.True(png.Length > 100);
    }

    [Fact]
    public void Serie_vacia_no_revienta()
    {
        Assert.NotEmpty(ChartPng.Spark([null, null, null], 84, 28, "#0F8A56"));
        Assert.NotEmpty(ChartPng.Tendencia([], null, 100, 30, "#000000", "#EEEEEE"));
    }
}
