using AunorApi.Models;

namespace AunorApi.Services.NetMon;

// Contador acumulado de 64 bits de una interfaz (bytes recibidos / enviados).
public record ContadorInterfaz(string Nombre, long InBytes, long OutBytes);

// Un cliente por marca de equipo (PaloAlto hoy; Fortinet después) — el resto del módulo
// solo conoce esta interfaz.
public interface IDeviceClient
{
    string Marca { get; }

    // Lanza DeviceClientException (mensaje sin secretos ni URLs) si el equipo no responde
    // o la respuesta no es válida.
    Task<IReadOnlyList<ContadorInterfaz>> LeerContadoresAsync(NetDevice device, CancellationToken ct);
}

public class DeviceClientException(string message) : Exception(message);
