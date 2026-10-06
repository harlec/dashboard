using System.Diagnostics;
using System.Net;
using AunorApi.Models;

namespace AunorApi.Services;

public class ClipException(string message) : Exception(message);

// Descarga de clips desde NVR Dahua vía loadfile.cgi (HTTP Digest estándar) y
// conversión .dav → .mp4 con ffmpeg (-c copy, sin recodificar).
// La contraseña nunca viene de la BD: NvrPeaje.PasswordRef es el NOMBRE de una
// variable de entorno.
public class DahuaVideoService(ILogger<DahuaVideoService> log)
{
    const string Fmt = "yyyy-MM-dd HH:mm:ss";

    static string Password(NvrPeaje nvr) =>
        Environment.GetEnvironmentVariable(nvr.PasswordRef)
        ?? throw new ClipException($"La variable de entorno '{nvr.PasswordRef}' no está definida en el servidor");

    static HttpClient Cliente(NvrPeaje nvr, Uri uri)
    {
        var cache = new CredentialCache { { new Uri(uri.GetLeftPart(UriPartial.Authority)), "Digest",
            new NetworkCredential(nvr.Usuario, Password(nvr)) } };
        var handler = new HttpClientHandler { Credentials = cache, PreAuthenticate = true };
        return new HttpClient(handler) { Timeout = TimeSpan.FromMinutes(15) };
    }

    // getSystemInfo simple para confirmar que el NVR responde antes de descargar
    public async Task<bool> ValidarConexionAsync(NvrPeaje nvr)
    {
        var uri = new Uri($"http://{nvr.Ip}:{nvr.PuertoHttp}/cgi-bin/magicBox.cgi?action=getSystemInfo");
        try
        {
            using var http = Cliente(nvr, uri);
            http.Timeout = TimeSpan.FromSeconds(10);
            using var resp = await http.GetAsync(uri);
            return resp.IsSuccessStatusCode;
        }
        catch (Exception ex) when (ex is not ClipException)
        {
            log.LogWarning(ex, "NVR {Peaje} no responde", nvr.Peaje);
            return false;
        }
    }

    // Retorna la ruta final del .mp4 dentro de outDir
    public async Task<string> DescargarClipAsync(
        NvrPeaje nvr, int canal, DateTime inicio, DateTime fin, string outDir, string baseName)
    {
        Directory.CreateDirectory(outDir);
        var dav = Path.Combine(outDir, baseName + ".dav");
        var mp4 = Path.Combine(outDir, baseName + ".mp4");

        var uri = new Uri($"http://{nvr.Ip}:{nvr.PuertoHttp}/cgi-bin/loadfile.cgi?action=startLoad" +
            $"&channel={canal}" +
            $"&startTime={Uri.EscapeDataString(inicio.ToString(Fmt))}" +
            $"&endTime={Uri.EscapeDataString(fin.ToString(Fmt))}&subtype=0");

        try
        {
            using var http = Cliente(nvr, uri);
            using var resp = await http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead);
            if (!resp.IsSuccessStatusCode)
                throw new ClipException($"El NVR respondió {(int)resp.StatusCode} {resp.ReasonPhrase}");

            await using (var fs = File.Create(dav))
                await resp.Content.CopyToAsync(fs);

            if (new FileInfo(dav).Length < 1024)
                throw new ClipException("El NVR devolvió un archivo vacío (¿sin grabación en ese rango o canal caído?)");

            await ConvertirAsync(dav, mp4);
            File.Delete(dav);
            return mp4;
        }
        catch
        {
            if (File.Exists(dav)) File.Delete(dav);
            throw;
        }
    }

    static async Task ConvertirAsync(string dav, string mp4)
    {
        // Copia directa (rápida, sin pérdida) — funciona cuando el .dav no tiene
        // pistas incompatibles con MP4.
        var (ok, err) = await Ejecutar(["-y", "-i", dav, "-c", "copy", mp4]);
        if (ok) return;

        // Algunas cámaras (ej. OCR) graban audio en PCM µ-law, que MP4 no admite
        // sin transcodificar. Reintentar copiando solo el video (sin pérdida) y
        // convirtiendo el audio a AAC.
        if (err.Contains("codec", StringComparison.OrdinalIgnoreCase))
        {
            var (ok2, err2) = await Ejecutar(["-y", "-i", dav, "-c:v", "copy", "-c:a", "aac", "-b:a", "64k", mp4]);
            if (ok2) return;
            err = err2;
        }

        throw new ClipException("ffmpeg falló: " + (err.Length > 400 ? err[^400..] : err));
    }

    static async Task<(bool Ok, string Error)> Ejecutar(string[] args)
    {
        var psi = new ProcessStartInfo("ffmpeg") { RedirectStandardError = true, RedirectStandardOutput = true };
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var p = Process.Start(psi) ?? throw new ClipException("No se pudo iniciar ffmpeg");
        var stderrTask = p.StandardError.ReadToEndAsync();
        _ = p.StandardOutput.ReadToEndAsync();
        await p.WaitForExitAsync();
        var stderr = await stderrTask;
        return (p.ExitCode == 0, stderr);
    }
}
