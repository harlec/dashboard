using AunorApi.Services.NetMon;
using Xunit;

namespace AunorApi.Tests;

public class PaloAltoParseoTests
{
    // XML de ejemplo de la spec (recortado): cada entry real trae más campos.
    const string Ejemplo = """
        <response status="success"><result><ifnet><ifnet>
          <entry><name>ethernet1/1</name><ibytes>46292831030742</ibytes><obytes>58198557287601</obytes></entry>
          <entry><name>ethernet1/2</name><ibytes>221576354061929</ibytes><obytes>32466402017385</obytes></entry>
        </ifnet></ifnet></result></response>
        """;

    [Fact]
    public void Parsea_nombre_y_contadores_de_64_bits()
    {
        var r = PaloAltoClient.Parsear(Ejemplo);

        Assert.Equal(2, r.Count);
        Assert.Equal(new ContadorInterfaz("ethernet1/1", 46292831030742, 58198557287601), r[0]);
        Assert.Equal(new ContadorInterfaz("ethernet1/2", 221576354061929, 32466402017385), r[1]);
    }

    [Fact]
    public void Ignora_campos_extra_y_entradas_incompletas()
    {
        var xml = """
            <response status="success"><result><ifnet><ifnet>
              <entry><name>ethernet1/1</name><ibytes>10</ibytes><obytes>20</obytes><ipackets>999</ipackets><idrops>5</idrops></entry>
              <entry><name>ethernet1/9</name><ibytes>abc</ibytes><obytes>20</obytes></entry>
              <entry><ibytes>1</ibytes><obytes>2</obytes></entry>
            </ifnet></ifnet></result></response>
            """;

        var r = PaloAltoClient.Parsear(xml);

        Assert.Single(r);
        Assert.Equal(new ContadorInterfaz("ethernet1/1", 10, 20), r[0]);
    }

    [Theory]
    [InlineData("no es xml")]
    [InlineData("<otra><cosa/></otra>")]
    [InlineData("<response status=\"error\"><msg>Invalid credentials</msg></response>")]
    [InlineData("<response status=\"success\"><result></result></response>")]
    public void Respuesta_invalida_lanza_DeviceClientException(string xml) =>
        Assert.Throws<DeviceClientException>(() => PaloAltoClient.Parsear(xml));

    [Theory]
    [InlineData("AB:CD:01:23", "ABCD0123")]
    [InlineData("ab cd 01 23", "ABCD0123")]
    [InlineData("abcd0123", "ABCD0123")]
    public void Huella_se_normaliza(string entrada, string esperado) =>
        Assert.Equal(esperado, PaloAltoClient.NormalizarHuella(entrada));
}

public class CalculoConsumoTests
{
    static readonly DateTime T0 = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Calcula_bps_con_el_reloj_no_con_un_intervalo_fijo()
    {
        // 75 MB recibidos y 30 MB enviados en 62 s reales
        var ant = new LecturaContador(T0, 1_000, 2_000);
        var act = new LecturaContador(T0.AddSeconds(62), 1_000 + 75_000_000, 2_000 + 30_000_000);

        var c = CalculoConsumo.Calcular(ant, act)!;

        Assert.Equal(75_000_000 * 8 / 62.0, c.InBps, 3);
        Assert.Equal(30_000_000 * 8 / 62.0, c.OutBps, 3);
    }

    [Fact]
    public void Contador_que_retrocede_descarta_la_muestra()
    {
        // reinicio de contadores o failover: nunca valores negativos
        var ant = new LecturaContador(T0, 5_000_000, 5_000_000);

        Assert.Null(CalculoConsumo.Calcular(ant, new LecturaContador(T0.AddSeconds(60), 100, 6_000_000)));
        Assert.Null(CalculoConsumo.Calcular(ant, new LecturaContador(T0.AddSeconds(60), 6_000_000, 100)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void Dt_no_positivo_descarta_la_muestra(int segundos)
    {
        var ant = new LecturaContador(T0, 100, 100);
        Assert.Null(CalculoConsumo.Calcular(ant, new LecturaContador(T0.AddSeconds(segundos), 200, 200)));
    }

    [Fact]
    public void Sin_trafico_es_cero_no_descarte()
    {
        var ant = new LecturaContador(T0, 100, 100);
        var c = CalculoConsumo.Calcular(ant, new LecturaContador(T0.AddSeconds(60), 100, 100))!;
        Assert.Equal(0, c.InBps);
        Assert.Equal(0, c.OutBps);
    }

    [Fact]
    public void Porcentaje_contra_ancho_contratado()
    {
        // 200 Mbps sobre 250 Mbps contratados = 80 %
        Assert.Equal(80, CalculoConsumo.UtilPct(200_000_000, 250)!.Value, 6);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0.0)]
    public void Sin_ancho_contratado_no_hay_porcentaje(double? mbps) =>
        Assert.Null(CalculoConsumo.UtilPct(100_000_000, mbps));
}

public class EvaluadorSaturacionTests
{
    const double Crit = 85;

    [Fact]
    public void Abre_solo_tras_cinco_muestras_consecutivas_sobre_el_umbral()
    {
        var ev = new EvaluadorSaturacion();
        for (var i = 0; i < 4; i++) Assert.Equal(AccionAlerta.Nada, ev.Procesar(90, Crit));
        Assert.Equal(AccionAlerta.Abrir, ev.Procesar(90, Crit));
        Assert.True(ev.Abierta);
    }

    [Fact]
    public void Una_muestra_baja_reinicia_la_cuenta()
    {
        var ev = new EvaluadorSaturacion();
        for (var i = 0; i < 4; i++) ev.Procesar(90, Crit);
        ev.Procesar(50, Crit);
        for (var i = 0; i < 4; i++) Assert.Equal(AccionAlerta.Nada, ev.Procesar(90, Crit));
        Assert.Equal(AccionAlerta.Abrir, ev.Procesar(90, Crit));
    }

    [Fact]
    public void No_alerta_exactamente_en_el_umbral()
    {
        var ev = new EvaluadorSaturacion();
        for (var i = 0; i < 10; i++) Assert.Equal(AccionAlerta.Nada, ev.Procesar(85, Crit));
    }

    [Fact]
    public void Histeresis_cierra_solo_bajo_critico_menos_diez()
    {
        var ev = new EvaluadorSaturacion();
        for (var i = 0; i < 5; i++) ev.Procesar(90, Crit);

        Assert.Equal(AccionAlerta.Nada,   ev.Procesar(80, Crit));   // bajó del crítico pero no de 75
        Assert.Equal(AccionAlerta.Nada,   ev.Procesar(75, Crit));   // 75 no es < 75
        Assert.True(ev.Abierta);
        Assert.Equal(AccionAlerta.Cerrar, ev.Procesar(74.9, Crit));
        Assert.False(ev.Abierta);
    }

    [Fact]
    public void Tras_cerrar_puede_abrir_otra()
    {
        var ev = new EvaluadorSaturacion();
        for (var i = 0; i < 5; i++) ev.Procesar(90, Crit);
        ev.Procesar(10, Crit);
        for (var i = 0; i < 4; i++) Assert.Equal(AccionAlerta.Nada, ev.Procesar(95, Crit));
        Assert.Equal(AccionAlerta.Abrir, ev.Procesar(95, Crit));
    }
}

public class SecretoCifradoTests
{
    [Fact]
    public void Cifra_y_descifra_con_el_mismo_secreto()
    {
        var c = SecretoCifrado.Cifrar("LUFRPT1-api-key", "jwt-secret");
        Assert.DoesNotContain("api-key", c);
        Assert.Equal("LUFRPT1-api-key", SecretoCifrado.Descifrar(c, "jwt-secret"));
    }

    [Fact]
    public void Cada_cifrado_es_distinto_por_el_nonce() =>
        Assert.NotEqual(SecretoCifrado.Cifrar("k", "s"), SecretoCifrado.Cifrar("k", "s"));

    [Fact]
    public void Secreto_distinto_o_dato_alterado_devuelve_null()
    {
        var c = SecretoCifrado.Cifrar("k", "s1");
        Assert.Null(SecretoCifrado.Descifrar(c, "s2"));
        Assert.Null(SecretoCifrado.Descifrar("no-es-base64!!", "s1"));
        var b = Convert.FromBase64String(c); b[^1] ^= 1;
        Assert.Null(SecretoCifrado.Descifrar(Convert.ToBase64String(b), "s1"));
    }
}
