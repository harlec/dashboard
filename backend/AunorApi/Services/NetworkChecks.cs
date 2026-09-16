using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace AunorApi.Services;

// Chequeos de red compartidos por PingWorkerService (equipos de vía) y
// ServicioCheckWorkerService (servicios sin vía) — mismo comportamiento
// probado en producción, sin duplicar la lógica entre los dos workers.
public static class NetworkChecks
{
    // Prueba varios puertos en paralelo — UP si cualquiera responde
    public static async Task<(string estado, double? latencia, string? detalle)> TcpCheckMulti(
        string ip, List<int> ports, int timeoutMs)
    {
        var tasks = ports.Select(p => TcpCheckOne(ip, p, timeoutMs));
        var results = await Task.WhenAll(tasks);
        var first = results.FirstOrDefault(r => r.up);
        return first.up
            ? ("UP", first.ms, null)
            : ("DOWN", null, results.Select(r => r.detalle).FirstOrDefault(d => d != null) ?? "TcpError");
    }

    public static async Task<(bool up, double? ms, string? detalle)> TcpCheckOne(
        string ip, int port, int timeoutMs)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var cts    = new CancellationTokenSource(timeoutMs);
            using var client = new TcpClient();
            await client.ConnectAsync(ip, port, cts.Token);
            sw.Stop();
            return (true, (double)sw.ElapsedMilliseconds, null);
        }
        catch (SocketException sockEx) { return (false, null, sockEx.SocketErrorCode.ToString()); }
        catch (OperationCanceledException) { return (false, null, "TcpTimeout"); }
        catch (Exception ex) { return (false, null, ex.GetType().Name); }
    }

    // ICMP ping. El socket raw se limita con icmpSem (ver IcmpGate) para no tener
    // decenas abiertos a la vez — en Linux un socket raw recibe TODO el tráfico
    // ICMP del host, no solo el suyo, y eso genera cross-talk entre respuestas.
    public static async Task<(string estado, double? latencia, string? detalle)> IcmpPing(
        string ip, int timeoutMs, int count, SemaphoreSlim icmpSem)
    {
        double total = 0;
        int    ok    = 0;
        string? ultimoDetalle = null;

        for (int i = 0; i < count; i++)
        {
            await icmpSem.WaitAsync();
            try
            {
                using var ping  = new Ping();
                var reply = await ping.SendPingAsync(ip, timeoutMs);
                if (reply.Status == IPStatus.Success) { ok++; total += reply.RoundtripTime; }
                else ultimoDetalle = reply.Status.ToString();
            }
            catch (Exception ex) { ultimoDetalle = ex.GetType().Name; }
            finally { icmpSem.Release(); }
        }

        return ok == 0 ? ("DOWN", null, ultimoDetalle ?? "TimedOut") : ("UP", total / ok, null);
    }

    // Chequeo HTTP — usado por servicios tipo "página web". UP si responde 2xx/3xx;
    // cualquier otro código, timeout o error de conexión cuenta como caído.
    public static async Task<(string estado, double? latencia, string? detalle)> HttpCheck(
        HttpClient client, string url, int timeoutMs)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var cts = new CancellationTokenSource(timeoutMs);
            using var resp = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            sw.Stop();
            return (int)resp.StatusCode < 400
                ? ("UP", (double)sw.ElapsedMilliseconds, null)
                : ("DOWN", null, $"HTTP {(int)resp.StatusCode}");
        }
        catch (OperationCanceledException) { return ("DOWN", null, "HttpTimeout"); }
        catch (HttpRequestException ex) { return ("DOWN", null, ex.HttpRequestError.ToString()); }
        catch (Exception ex) { return ("DOWN", null, ex.GetType().Name); }
    }
}
