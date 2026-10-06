using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using AunorApi.Data;
using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/oficios")]
[Authorize(Roles = "admin")]   // evidencia de casos judiciales: solo admin
public partial class OficiosController(
    TransitosPlacaService transitos, DahuaVideoService dahua, AppDbContext db,
    ILogger<OficiosController> log) : ControllerBase
{
    const long MinLibreBytes = 2L * 1024 * 1024 * 1024;   // no descargar con menos de 2 GB libres

    [GeneratedRegex(@"^[A-Za-z0-9_\-]+\.mp4$")]
    private static partial Regex NombreSeguro();

    // GET api/oficios/transitos?placa=TFU-847&desde=2026-01-28T00:00:00&hasta=2026-01-29T00:00:00
    // "hasta" es exclusivo.
    [HttpGet("transitos")]
    public async Task<IActionResult> Transitos(
        [FromQuery] string placa,
        [FromQuery] DateTime desde,
        [FromQuery] DateTime hasta,
        [FromQuery] string? estacion = null)
    {
        if (string.IsNullOrWhiteSpace(placa)) return BadRequest("placa es obligatoria");
        if (hasta <= desde) return BadRequest("hasta debe ser posterior a desde");
        if ((hasta - desde).TotalDays > 31) return BadRequest("Rango máximo: 31 días");

        try { return Ok(await transitos.BuscarAsync(placa, desde, hasta, estacion)); }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    // POST api/oficios/clip  { coest, canal, fechaPaso, antesSegundos, despuesSegundos }
    // Descarga el clip del canal configurado: [paso - antes, paso + despues]. Por defecto 90 s + 90 s = 3 min.
    [HttpPost("clip")]
    public async Task<IActionResult> Clip([FromBody] ClipRequest r)
    {
        int antes = Math.Clamp(r.AntesSegundos ?? 90, 0, 1800);
        int despues = Math.Clamp(r.DespuesSegundos ?? 90, 0, 1800);
        if (antes + despues < 10) return BadRequest(new { estado = "Error", mensaje = "La duración mínima es de 10 segundos" });
        if (antes + despues > 1800) return BadRequest(new { estado = "Error", mensaje = "La duración máxima por clip es de 30 minutos" });

        var canal = await db.NvrCanales.Include(c => c.NvrPeaje)
            .FirstOrDefaultAsync(c => c.Activo && c.Canal == r.Canal
                                   && c.NvrPeaje.CoestTransito == r.Coest && c.NvrPeaje.Activo);
        if (canal is null)
            return NotFound(new { estado = "Error", mensaje = "Ese canal no está configurado para el peaje (ver configuración de NVR)" });
        var nvr = canal.NvrPeaje;

        // Retención primero: no se llama al NVR por fechas que sabemos que no existen
        if (r.FechaPaso < DateTime.Now.AddDays(-nvr.RetencionDias))
            return Conflict(new { estado = "FueraDeRetencion",
                mensaje = $"El NVR de {nvr.Peaje} retiene {nvr.RetencionDias} días; el paso es anterior." });

        Directory.CreateDirectory(OficiosStorage.Ruta);
        var libre = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(OficiosStorage.Ruta))!).AvailableFreeSpace;
        if (libre < MinLibreBytes)
            return StatusCode(507, new { estado = "Error",
                mensaje = "Queda poco espacio en el disco del servidor (menos de 2 GB). Descarga y borra clips antiguos." });

        var usuario = User.Identity?.Name ?? "?";
        try
        {
            if (!await dahua.ValidarConexionAsync(nvr))
                return StatusCode(502, new { estado = "Error", mensaje = $"El NVR de {nvr.Peaje} no responde" });

            var baseName = Regex.Replace(
                $"{nvr.Peaje}_c{canal.Canal}_{r.FechaPaso:yyyyMMdd_HHmmss}_{Guid.NewGuid().ToString("N")[..8]}",
                @"[^A-Za-z0-9_\-]", "");

            var ruta = await dahua.DescargarClipAsync(nvr, canal.Canal,
                r.FechaPaso.AddSeconds(-antes), r.FechaPaso.AddSeconds(despues), OficiosStorage.Ruta, baseName);

            var nombre = Path.GetFileName(ruta);
            var hash = CalcularSha256(ruta);
            // sha256sum-compatible: permite verificar con `sha256sum -c` quien reciba el video
            await System.IO.File.WriteAllTextAsync(ruta + ".sha256", $"{hash}  {nombre}\n");

            log.LogInformation("Oficios: {Usuario} descargó clip {Archivo} ({Peaje} canal {Canal}) sha256={Hash}",
                usuario, nombre, nvr.Peaje, canal.Canal, hash);
            return Ok(new { estado = "Completado", archivo = nombre, url = $"/api/oficios/clips/{nombre}",
                            tipo = canal.Tipo, nombre = canal.Nombre, diasConservacion = OficiosStorage.Dias,
                            sha256 = hash });
        }
        catch (ClipException ex)
        {
            log.LogWarning("Oficios: clip falló ({Peaje} c{Canal}): {Msg}", nvr.Peaje, canal.Canal, ex.Message);
            return StatusCode(502, new { estado = "Error", mensaje = ex.Message });
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Oficios: clip falló ({Peaje} c{Canal})", nvr.Peaje, canal.Canal);
            return StatusCode(502, new { estado = "Error", mensaje = ex.Message });
        }
    }

    // GET api/oficios/clips/{archivo}?borrar=true  (borrar = elimina el archivo del servidor al terminar de descargarlo)
    [HttpGet("clips/{archivo}")]
    public IActionResult Descargar(string archivo, [FromQuery] bool borrar = false)
    {
        if (!NombreSeguro().IsMatch(archivo)) return BadRequest("Nombre inválido");
        var ruta = Path.Combine(OficiosStorage.Ruta, archivo);
        if (!System.IO.File.Exists(ruta))
            return NotFound($"El clip ya no existe (se borran automáticamente a los {OficiosStorage.Dias} días)");

        log.LogInformation("Oficios: {Usuario} descargó {Archivo} (borrar={Borrar})", User.Identity?.Name, archivo, borrar);
        if (borrar) Response.OnCompleted(() => { BorrarSilencioso(ruta); BorrarSilencioso(ruta + ".sha256"); return Task.CompletedTask; });
        return PhysicalFile(ruta, "video/mp4", archivo);
    }

    // GET api/oficios/clips/{archivo}/sha256 — hash del MP4, calculado al exportarlo
    // (útil tras recargar la página, cuando ya no se tiene la respuesta del POST /clip)
    [HttpGet("clips/{archivo}/sha256")]
    public async Task<IActionResult> Hash(string archivo)
    {
        if (!NombreSeguro().IsMatch(archivo)) return BadRequest("Nombre inválido");
        var ruta = Path.Combine(OficiosStorage.Ruta, archivo) + ".sha256";
        if (!System.IO.File.Exists(ruta)) return NotFound();
        var linea = await System.IO.File.ReadAllTextAsync(ruta);
        return Ok(new { archivo, sha256 = linea.Split(' ', 2)[0] });
    }

    // GET api/oficios/zip?archivos=a.mp4,b.mp4&borrar=true — varios clips en un solo ZIP,
    // con manifest.txt (formato `sha256sum`) para verificar integridad de cada uno.
    [HttpGet("zip")]
    public IActionResult Zip([FromQuery] string archivos, [FromQuery] bool borrar = false)
    {
        var nombres = (archivos ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct().Take(200).ToList();
        if (nombres.Count == 0 || nombres.Any(n => !NombreSeguro().IsMatch(n)))
            return BadRequest("Lista de archivos inválida");

        var existentes = nombres.Where(n => System.IO.File.Exists(Path.Combine(OficiosStorage.Ruta, n))).ToList();
        if (existentes.Count == 0)
            return NotFound($"Los clips ya no existen (se borran automáticamente a los {OficiosStorage.Dias} días)");

        // Se arma en disco (Kestrel no permite escritura síncrona del ZIP directo a la respuesta).
        // Sin compresión: el MP4 ya está comprimido.
        var tmp = Path.Combine(OficiosStorage.Ruta, $"zip_{Guid.NewGuid():N}.zip");
        var manifest = new StringBuilder("# Verificar con: sha256sum -c manifest.txt\n");
        using (var zip = ZipFile.Open(tmp, ZipArchiveMode.Create))
        {
            foreach (var n in existentes)
            {
                zip.CreateEntryFromFile(Path.Combine(OficiosStorage.Ruta, n), n, CompressionLevel.NoCompression);
                var sidecar = Path.Combine(OficiosStorage.Ruta, n) + ".sha256";
                manifest.Append(System.IO.File.Exists(sidecar)
                    ? System.IO.File.ReadAllText(sidecar)
                    : $"# {n}: hash no disponible\n");
            }
            zip.CreateEntry("manifest.txt").Open().Write(Encoding.UTF8.GetBytes(manifest.ToString()));
        }

        log.LogInformation("Oficios: {Usuario} descargó ZIP de {N} clips (borrar={Borrar})", User.Identity?.Name, existentes.Count, borrar);
        Response.OnCompleted(() =>
        {
            BorrarSilencioso(tmp);
            if (borrar) foreach (var n in existentes)
            {
                BorrarSilencioso(Path.Combine(OficiosStorage.Ruta, n));
                BorrarSilencioso(Path.Combine(OficiosStorage.Ruta, n) + ".sha256");
            }
            return Task.CompletedTask;
        });
        return PhysicalFile(tmp, "application/zip", $"oficios_{DateTime.Now:yyyyMMdd_HHmm}.zip");
    }

    // DELETE api/oficios/clips/{archivo}
    [HttpDelete("clips/{archivo}")]
    public IActionResult Borrar(string archivo)
    {
        if (!NombreSeguro().IsMatch(archivo)) return BadRequest("Nombre inválido");
        var ruta = Path.Combine(OficiosStorage.Ruta, archivo);
        if (!System.IO.File.Exists(ruta)) return NotFound();
        System.IO.File.Delete(ruta);
        BorrarSilencioso(ruta + ".sha256");
        log.LogInformation("Oficios: {Usuario} borró {Archivo}", User.Identity?.Name, archivo);
        return NoContent();
    }

    static void BorrarSilencioso(string ruta)
    {
        try { System.IO.File.Delete(ruta); } catch { /* ya no existe o está en uso: la limpieza periódica lo recoge */ }
    }

    static string CalcularSha256(string ruta)
    {
        using var fs = System.IO.File.OpenRead(ruta);
        return Convert.ToHexString(SHA256.HashData(fs)).ToLowerInvariant();
    }
}

public record ClipRequest(int Coest, int Canal, DateTime FechaPaso, int? AntesSegundos, int? DespuesSegundos);
