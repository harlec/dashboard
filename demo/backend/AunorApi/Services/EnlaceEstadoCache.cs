using System.Collections.Concurrent;

namespace AunorApi.Services;

public class EnlaceEstadoCache
{
    private readonly ConcurrentDictionary<int, string> _estados = new();

    public string Get(int estacionId) =>
        _estados.GetValueOrDefault(estacionId, "DESCONOCIDO");

    public void Set(int estacionId, string enlace) =>
        _estados[estacionId] = enlace;

    public bool EsStarlink(int estacionId) =>
        Get(estacionId) == "STARLINK";
}
