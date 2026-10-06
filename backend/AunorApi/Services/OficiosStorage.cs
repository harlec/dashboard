namespace AunorApi.Services;

// Carpeta de evidencia del módulo Oficios (fuera de wwwroot: solo se sirve por endpoints autenticados)
public static class OficiosStorage
{
    public static string Ruta =>
        Environment.GetEnvironmentVariable("OFICIOS_STORAGE") ?? "/app/oficios";

    // Días que se conservan los MP4 en el servidor antes de borrarse solos
    public static int Dias =>
        int.TryParse(Environment.GetEnvironmentVariable("OFICIOS_CLIPS_DIAS"), out var d) && d > 0 ? d : 3;
}

// Borra los clips (.mp4) más viejos que OficiosStorage.Dias, y los temporales
// (.dav de descargas fallidas, .zip de lotes) con más de 2 horas.
public class OficiosLimpiezaService(ILogger<OficiosLimpiezaService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { Barrer(); }
            catch (Exception ex) { log.LogWarning(ex, "Oficios: falló la limpieza de clips"); }

            try { await Task.Delay(TimeSpan.FromMinutes(30), ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    void Barrer()
    {
        var dir = OficiosStorage.Ruta;
        if (!Directory.Exists(dir)) return;

        var limiteClips = DateTime.UtcNow.AddDays(-OficiosStorage.Dias);
        var limiteTemp  = DateTime.UtcNow.AddHours(-2);

        foreach (var f in Directory.EnumerateFiles(dir))
        {
            // ".sha256" es el sidecar de hash de un .mp4 (ej. "clip.mp4.sha256"): misma retención que el clip
            var ext = f.EndsWith(".sha256", StringComparison.OrdinalIgnoreCase) ? ".sha256" : Path.GetExtension(f).ToLowerInvariant();
            if (ext is not (".mp4" or ".sha256" or ".dav" or ".zip")) continue;

            var limite = ext is ".mp4" or ".sha256" ? limiteClips : limiteTemp;
            if (File.GetLastWriteTimeUtc(f) >= limite) continue;

            File.Delete(f);
            log.LogInformation("Oficios: borrado por antigüedad {Archivo}", Path.GetFileName(f));
        }
    }
}
