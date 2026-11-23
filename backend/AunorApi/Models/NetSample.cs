namespace AunorApi.Models;

public class NetSample
{
    public int LinkId { get; set; }
    public DateTime TsUtc { get; set; }
    public long InBps { get; set; }
    public long OutBps { get; set; }
    public double? UtilInPct { get; set; }
    public double? UtilOutPct { get; set; }
}

// Promedio/pico por hora: reemplaza a las muestras crudas cuando se purgan (90 días).
public class NetSampleHora
{
    public int LinkId { get; set; }
    public DateTime HoraUtc { get; set; }
    public long InBpsAvg { get; set; }
    public long OutBpsAvg { get; set; }
    public long InBpsMax { get; set; }
    public long OutBpsMax { get; set; }
    public double? UtilMaxPct { get; set; }
}
