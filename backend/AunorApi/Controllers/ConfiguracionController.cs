using AunorApi.Data;
using AunorApi.Models;
using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/config")]
[Authorize]
public class ConfiguracionController(AppDbContext db, TelegramAlertService telegramAlert, IWebHostEnvironment env) : ControllerBase
{
    private static readonly string[] TiposTonoValidos = ["desconexion", "reconexion"];
    private const long MaxBytesTono = 15 * 1024 * 1024; // 15 MB

    private string AudioDir => Path.Combine(env.ContentRootPath, "audio");

    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.Configuraciones.OrderBy(c => c.Clave).ToListAsync());

    [HttpPut("{clave}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(string clave, [FromBody] ConfigRequest req)
    {
        var cfg = await db.Configuraciones.FindAsync(clave);
        if (cfg is null)
        {
            db.Configuraciones.Add(new Configuracion { Clave = clave, Valor = req.Valor });
        }
        else
        {
            cfg.Valor = req.Valor;
        }
        await db.SaveChangesAsync();
        return Ok(new { clave, valor = req.Valor });
    }

    [HttpPost("telegram/test")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> TestTelegram()
    {
        var (ok, message) = await telegramAlert.SendTestAsync();
        return ok ? Ok(new { ok, message }) : BadRequest(new { ok, message });
    }

    [HttpPost("tono/{tipo}")]
    [Authorize(Roles = "admin")]
    [RequestSizeLimit(MaxBytesTono)]
    public async Task<IActionResult> SubirTono(string tipo, IFormFile archivo)
    {
        if (!TiposTonoValidos.Contains(tipo))
            return BadRequest(new { error = "tipo debe ser 'desconexion' o 'reconexion'" });
        if (archivo is null || archivo.Length == 0)
            return BadRequest(new { error = "Debe adjuntar un archivo" });
        if (archivo.Length > MaxBytesTono)
            return BadRequest(new { error = "El archivo excede 15 MB" });

        var ext = Path.GetExtension(archivo.FileName);
        if (!string.Equals(ext, ".mp3", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Sólo se aceptan archivos .mp3" });

        var clave = $"tono_{tipo}_archivo";
        var cfg = await db.Configuraciones.FindAsync(clave);
        var anterior = cfg?.Valor;

        Directory.CreateDirectory(AudioDir);
        var nombreNuevo = $"{tipo}_{Guid.NewGuid():N}.mp3";
        var rutaNueva = Path.Combine(AudioDir, nombreNuevo);

        await using (var fs = System.IO.File.Create(rutaNueva))
            await archivo.CopyToAsync(fs);

        if (cfg is null)
            db.Configuraciones.Add(new Configuracion { Clave = clave, Valor = nombreNuevo });
        else
            cfg.Valor = nombreNuevo;

        try
        {
            await db.SaveChangesAsync();
        }
        catch
        {
            TryDeleteSafe(nombreNuevo);
            throw;
        }

        if (!string.IsNullOrWhiteSpace(anterior))
            TryDeleteSafe(anterior);

        return Ok(new { clave, valor = nombreNuevo, url = $"/api/audio/{nombreNuevo}" });
    }

    [HttpDelete("tono/{tipo}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> RestaurarTono(string tipo)
    {
        if (!TiposTonoValidos.Contains(tipo))
            return BadRequest(new { error = "tipo debe ser 'desconexion' o 'reconexion'" });

        var clave = $"tono_{tipo}_archivo";
        var cfg = await db.Configuraciones.FindAsync(clave);
        var anterior = cfg?.Valor;

        if (cfg is not null)
        {
            cfg.Valor = "";
            await db.SaveChangesAsync();
        }
        if (!string.IsNullOrWhiteSpace(anterior))
            TryDeleteSafe(anterior);

        return Ok(new { clave, valor = "" });
    }

    // ── Imagen de fondo del Dashboard (SIGMA) — se guarda junto a los tonos (volumen
    // audio/, servido sin auth en /api/audio) y su nombre en la clave fondo_imagen.
    private static readonly string[] ExtFondoValidas = [".jpg", ".jpeg", ".png", ".webp"];
    private const long MaxBytesFondo = 10 * 1024 * 1024; // 10 MB

    [HttpPost("fondo")]
    [Authorize(Roles = "admin")]
    [RequestSizeLimit(MaxBytesFondo)]
    public async Task<IActionResult> SubirFondo(IFormFile archivo)
    {
        if (archivo is null || archivo.Length == 0)
            return BadRequest(new { error = "Debe adjuntar un archivo" });
        if (archivo.Length > MaxBytesFondo)
            return BadRequest(new { error = "La imagen excede 10 MB" });
        var ext = Path.GetExtension(archivo.FileName).ToLowerInvariant();
        if (!ExtFondoValidas.Contains(ext))
            return BadRequest(new { error = "Sólo se aceptan imágenes .jpg, .png o .webp" });

        const string clave = "fondo_imagen";
        var cfg = await db.Configuraciones.FindAsync(clave);
        var anterior = cfg?.Valor;

        Directory.CreateDirectory(AudioDir);
        var nombreNuevo = $"fondo_{Guid.NewGuid():N}{ext}";
        await using (var fs = System.IO.File.Create(Path.Combine(AudioDir, nombreNuevo)))
            await archivo.CopyToAsync(fs);

        if (cfg is null) db.Configuraciones.Add(new Configuracion { Clave = clave, Valor = nombreNuevo });
        else cfg.Valor = nombreNuevo;
        try { await db.SaveChangesAsync(); }
        catch { TryDeleteSafe(nombreNuevo); throw; }

        if (!string.IsNullOrWhiteSpace(anterior)) TryDeleteSafe(anterior);
        return Ok(new { clave, valor = nombreNuevo, url = $"/api/audio/{nombreNuevo}" });
    }

    [HttpDelete("fondo")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> QuitarFondo()
    {
        var cfg = await db.Configuraciones.FindAsync("fondo_imagen");
        var anterior = cfg?.Valor;
        if (cfg is not null) { cfg.Valor = ""; await db.SaveChangesAsync(); }
        if (!string.IsNullOrWhiteSpace(anterior)) TryDeleteSafe(anterior);
        return Ok(new { clave = "fondo_imagen", valor = "" });
    }

    // Nunca confiar en el nombre crudo leído de BD (pudo escribirse vía el PUT
    // genérico /api/config/{clave}, que no valida el valor) — Path.GetFileName
    // evita que un valor con traversal termine borrando algo fuera de audio/.
    private void TryDeleteSafe(string nombreArchivo)
    {
        try
        {
            var nombreSeguro = Path.GetFileName(nombreArchivo);
            if (string.IsNullOrWhiteSpace(nombreSeguro)) return;
            var ruta = Path.Combine(AudioDir, nombreSeguro);
            if (System.IO.File.Exists(ruta)) System.IO.File.Delete(ruta);
        }
        catch { /* best-effort */ }
    }
}

public record ConfigRequest(string Valor);
