using System.Security.Authentication;
using System.Security.Cryptography;
using System.Xml.Linq;
using AunorApi.Models;

namespace AunorApi.Services.NetMon;

// API XML de PAN-OS: show counter interface all. Solo ibytes/obytes (64 bits);
// ipackets/opackets/idrops son de 32 bits y se desbordan, no se usan.
//
// Seguridad:
//  - La key viaja en la URL (así lo exige PAN-OS): la URL NUNCA se registra ni se incluye
//    en mensajes de error. Por eso se usa HttpClient directo (el IHttpClientFactory loguea URLs)
//    y de las excepciones solo se reporta el tipo, no el mensaje.
//  - El certificado (autofirmado) se valida por huella SHA-256 configurada en net_device.
//    Sin huella el cliente se niega a conectar; no existe modo "aceptar todo".
public class PaloAltoClient(ILogger<PaloAltoClient> log) : IDeviceClient
{
    public string Marca => "PaloAlto";

    const int Intentos = 2;
    static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);
    const string Comando = "<show><counter><interface>all</interface></counter></show>";

    // Un HttpClient por equipo+huella (el handler fija la huella esperada).
    readonly Dictionary<string, HttpClient> clientes = new();
    readonly object candado = new();

    public async Task<IReadOnlyList<ContadorInterfaz>> LeerContadoresAsync(NetDevice device, CancellationToken ct)
    {
        var key = ResolverKey(device);
        if (string.IsNullOrWhiteSpace(key))
            throw new DeviceClientException($"{device.Nombre}: sin API key (cargarla en Admin → Red o definir la variable de entorno de respaldo)");
        if (string.IsNullOrWhiteSpace(device.CertSha256))
            throw new DeviceClientException($"{device.Nombre}: falta cert_sha256 (huella TLS); no se conecta sin validar el certificado");

        var http = ClienteDe(device);
        var url = $"https://{device.IpMgmt}/api/?type=op&cmd={Uri.EscapeDataString(Comando)}&key={Uri.EscapeDataString(key)}";

        DeviceClientException? ultimo = null;
        for (var i = 1; i <= Intentos; i++)
        {
            try
            {
                var xml = await http.GetStringAsync(url, ct);
                return Parsear(xml);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (DeviceClientException ex) { throw new DeviceClientException($"{device.Nombre}: {ex.Message}"); }
            catch (Exception ex)
            {
                // Se descarta ex.Message: puede incluir la URL con la key. Solo el tipo.
                var tipo = TipoSeguro(ex);
                ultimo = new DeviceClientException($"{device.Nombre}: sin respuesta ({tipo})");
                log.LogDebug("NetMon {dev}: intento {i}/{n} falló ({tipo})", device.Nombre, i, Intentos, tipo);
                if (i < Intentos) await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }
        }
        throw ultimo!;
    }

    static string TipoSeguro(Exception ex) => ex switch
    {
        TaskCanceledException => "timeout",
        HttpRequestException h when h.InnerException is AuthenticationException => "certificado no coincide con cert_sha256",
        HttpRequestException h => h.StatusCode is { } s ? $"HTTP {(int)s}" : "error de red/TLS",
        _ => ex.GetType().Name,
    };

    // Orden: key cifrada en BD (capturada en el admin) → variable de entorno de respaldo (secret_ref).
    static string? ResolverKey(NetDevice device)
    {
        if (!string.IsNullOrEmpty(device.ApiKeyEnc))
        {
            var secreto = Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
            return SecretoCifrado.Descifrar(device.ApiKeyEnc, secreto);
        }
        return string.IsNullOrWhiteSpace(device.SecretRef) ? null : Environment.GetEnvironmentVariable(device.SecretRef);
    }

    HttpClient ClienteDe(NetDevice device)
    {
        var huella = NormalizarHuella(device.CertSha256!);
        var id = $"{device.IpMgmt}|{huella}";
        lock (candado)
        {
            if (clientes.TryGetValue(id, out var c)) return c;
            var handler = new SocketsHttpHandler
            {
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
                SslOptions = new System.Net.Security.SslClientAuthenticationOptions
                {
                    // Pinning por huella: acepta SOLO el certificado cuyo SHA-256 coincide.
                    RemoteCertificateValidationCallback = (_, cert, _, _) =>
                        cert is not null &&
                        NormalizarHuella(cert.GetCertHashString(HashAlgorithmName.SHA256)) == huella,
                },
            };
            return clientes[id] = new HttpClient(handler) { Timeout = Timeout };
        }
    }

    public static string NormalizarHuella(string s) =>
        new string(s.Where(Uri.IsHexDigit).ToArray()).ToUpperInvariant();

    // /response/result/ifnet/ifnet/entry → name, ibytes, obytes. Entradas sin esos tres
    // campos o con valores no numéricos se omiten.
    public static IReadOnlyList<ContadorInterfaz> Parsear(string xml)
    {
        XDocument doc;
        try { doc = XDocument.Parse(xml); }
        catch (System.Xml.XmlException) { throw new DeviceClientException("respuesta no es XML válido"); }

        var resp = doc.Root;
        if (resp?.Name != "response") throw new DeviceClientException("respuesta inesperada del firewall");
        var status = resp.Attribute("status")?.Value;
        if (status != "success") throw new DeviceClientException($"el firewall respondió status='{status}'");

        var entradas = resp.Element("result")?.Element("ifnet")?.Element("ifnet")?.Elements("entry")
            ?? throw new DeviceClientException("respuesta sin /result/ifnet/ifnet");

        var lista = new List<ContadorInterfaz>();
        foreach (var e in entradas)
        {
            var nombre = e.Element("name")?.Value.Trim();
            if (string.IsNullOrEmpty(nombre)) continue;
            if (!long.TryParse(e.Element("ibytes")?.Value, out var i)) continue;
            if (!long.TryParse(e.Element("obytes")?.Value, out var o)) continue;
            lista.Add(new ContadorInterfaz(nombre, i, o));
        }
        return lista;
    }
}
