using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/nvr")]
[Authorize]
public class NvrController(AppDbContext db) : ControllerBase
{
    static readonly string[] TiposValidos = ["OCR", "VALIDACION", "PTZ"];

    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.NvrPeajes.Where(n => n.Activo)
            .Include(n => n.Canales.Where(c => c.Activo))
            .OrderBy(n => n.CoestTransito).ToListAsync());

    [HttpPost]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Create([FromBody] NvrRequest r)
    {
        if (await db.NvrPeajes.AnyAsync(n => n.CoestTransito == r.CoestTransito))
            return Conflict("Ya existe un NVR para ese peaje");
        var n = new NvrPeaje();
        Aplicar(n, r);
        db.NvrPeajes.Add(n);
        await db.SaveChangesAsync();
        return Created($"/api/nvr/{n.Id}", n);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Update(int id, [FromBody] NvrRequest r)
    {
        var n = await db.NvrPeajes.FindAsync(id);
        if (n is null) return NotFound();
        Aplicar(n, r);
        await db.SaveChangesAsync();
        return Ok(n);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var n = await db.NvrPeajes.FindAsync(id);
        if (n is null) return NotFound();
        n.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id}/canales")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> CreateCanal(int id, [FromBody] CanalRequest r)
    {
        if (!await db.NvrPeajes.AnyAsync(n => n.Id == id)) return NotFound();
        var err = Validar(r);
        if (err is not null) return BadRequest(err);
        if (await db.NvrCanales.AnyAsync(c => c.NvrPeajeId == id && c.Canal == r.Canal))
            return Conflict($"El canal {r.Canal} ya está configurado en este NVR");
        var c = new NvrCanal { NvrPeajeId = id };
        Aplicar(c, r);
        db.NvrCanales.Add(c);
        await db.SaveChangesAsync();
        return Created($"/api/nvr/{id}/canales/{c.Id}", c);
    }

    [HttpPut("canales/{canalId}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> UpdateCanal(int canalId, [FromBody] CanalRequest r)
    {
        var c = await db.NvrCanales.FindAsync(canalId);
        if (c is null) return NotFound();
        var err = Validar(r);
        if (err is not null) return BadRequest(err);
        Aplicar(c, r);
        await db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpDelete("canales/{canalId}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> DeleteCanal(int canalId)
    {
        var c = await db.NvrCanales.FindAsync(canalId);
        if (c is null) return NotFound();
        c.Activo = false;
        await db.SaveChangesAsync();
        return NoContent();
    }

    // Cámaras sugeridas para un tránsito (peaje + vía + sentido): OCR y validación
    // de esa vía, más las PTZ que cubren ese sentido (o todas, si no tienen sentido).
    // GET api/nvr/camaras?coest=4&via=3&sentido=S
    [HttpGet("camaras")]
    public async Task<IActionResult> Camaras([FromQuery] int coest, [FromQuery] int via, [FromQuery] string? sentido = null)
    {
        var nvr = await db.NvrPeajes.Include(n => n.Canales.Where(c => c.Activo))
            .FirstOrDefaultAsync(n => n.CoestTransito == coest && n.Activo);
        if (nvr is null) return NotFound("No hay NVR configurado para ese peaje");

        var s = sentido?.Trim().ToUpperInvariant();
        var camaras = nvr.Canales
            .Where(c => c.Tipo == "PTZ"
                ? c.Sentido is null || s is null || c.Sentido.Equals(s, StringComparison.OrdinalIgnoreCase)
                : c.ViaNumero == via)
            .OrderBy(c => c.Tipo).ThenBy(c => c.Canal)
            .Select(c => new { c.Id, c.Canal, c.Tipo, c.ViaNumero, c.Sentido, c.Nombre });

        return Ok(new { nvr.Id, nvr.Peaje, nvr.RetencionDias, camaras });
    }

    static string? Validar(CanalRequest r)
    {
        if (!TiposValidos.Contains(r.Tipo)) return "Tipo debe ser OCR, VALIDACION o PTZ";
        if (r.Canal < 1) return "Canal inválido";
        if (r.Tipo != "PTZ" && r.ViaNumero is null) return "OCR y VALIDACION requieren la vía";
        return null;
    }

    static void Aplicar(NvrPeaje n, NvrRequest r)
    {
        n.CoestTransito = r.CoestTransito; n.Peaje = r.Peaje; n.Ip = r.Ip;
        n.PuertoHttp = r.PuertoHttp; n.Usuario = r.Usuario;
        n.PasswordRef = r.PasswordRef; n.RetencionDias = r.RetencionDias;
    }

    static void Aplicar(NvrCanal c, CanalRequest r)
    {
        c.Canal = r.Canal; c.Tipo = r.Tipo; c.Nombre = r.Nombre;
        c.ViaNumero = r.Tipo == "PTZ" ? null : r.ViaNumero;
        c.Sentido = string.IsNullOrWhiteSpace(r.Sentido) ? null : r.Sentido.Trim().ToUpperInvariant();
    }
}

public record NvrRequest(int CoestTransito, string Peaje, string Ip, int PuertoHttp,
                         string Usuario, string PasswordRef, int RetencionDias);
public record CanalRequest(int Canal, string Tipo, int? ViaNumero, string? Sentido, string Nombre);
