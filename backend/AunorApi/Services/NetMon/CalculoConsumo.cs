namespace AunorApi.Services.NetMon;

public record LecturaContador(DateTime TsUtc, long InBytes, long OutBytes);
public record Consumo(double InBps, double OutBps);

// Lógica pura (sin I/O) del consumo a partir de dos lecturas de contadores acumulados.
public static class CalculoConsumo
{
    // null = muestra descartada: dt <= 0 (reloj raro) o contador que retrocede
    // (reinicio de contadores o failover del par HA). Nunca produce valores negativos.
    public static Consumo? Calcular(LecturaContador anterior, LecturaContador actual)
    {
        var dt = (actual.TsUtc - anterior.TsUtc).TotalSeconds;
        if (dt <= 0) return null;
        if (actual.InBytes < anterior.InBytes || actual.OutBytes < anterior.OutBytes) return null;

        return new Consumo(
            (actual.InBytes  - anterior.InBytes)  * 8 / dt,
            (actual.OutBytes - anterior.OutBytes) * 8 / dt);
    }

    // % de uso contra el ancho contratado; null si no hay ancho cargado (o es <= 0).
    public static double? UtilPct(double bps, double? mbpsContratado) =>
        mbpsContratado is > 0 ? bps / (mbpsContratado.Value * 1_000_000) * 100 : null;
}
