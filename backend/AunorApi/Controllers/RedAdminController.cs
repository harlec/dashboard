using AunorApi.Data;
using AunorApi.Models;
using AunorApi.Services;
using AunorApi.Services.NetMon;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

// Alta/edición de equipos de red (firewalls) y sus enlaces. Solo admin.
// La API key entra por aquí (campo ApiKey), se guarda cifrada y NUNCA se devuelve ni se audita.
[ApiController]
[Route("api/red/admin")]
[Authorize(Roles = "admin")]
public class RedAdminController(AppDbContext db, AuditService audit) : ControllerBase
{
    static readonly string[] Marcas = ["PaloAlto", "Fortinet"];
    static readonly string[] RolesHa = ["primario", "secundario", "ninguno"];
    static readonly string[] RolesEnlace = ["MPLS", "INTERNET", "LAN"];

    public record DeviceRequest(string Nombre, string Sitio, string Marca, string IpMgmt, string RolHa,
        string? GrupoHa, string? CertSha256, bool Activo, string? ApiKey);
    public record LinkRequest(int DeviceId, string Interfaz, string? Zona, string Rol,
        double? MbpsContratadoIn, double? MbpsContratadoOut, double UmbralWarnPct, double UmbralCritPct, bool MedirAlerta);

    static string? Validar(DeviceRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Nombre) || string.IsNullOrWhiteSpace(r.Sitio)) return "Nombre y sitio son obligatorios";
        if (!Marcas.Contains(r.Marca)) return "Marca no válida";
        if (!RolesHa.Contains(r.RolHa)) return "Rol HA no válido";
        if (!System.Net.IPAddress.TryParse(r.IpMgmt?.Trim(), out _)) return "IP de gestión no válida";
        var h = PaloAltoClient.NormalizarHuella(r.CertSha256 ?? "");
        if (h.Length != 0 && h.Length != 64) return "La huella SHA-256 debe tener 64 caracteres hexadecimales";
        return null;
    }

    string Secreto() => Environment.GetEnvironmentVariable("JWT_SECRET")
        ?? throw new InvalidOperationException("JWT_SECRET no configurado");

    // ── Equipos ──────────────────────────────────────────────
    [HttpGet("equipos")]
    public async Task<IActionResult> Equipos() =>
        Ok(await db.NetDevices.OrderBy(d => d.Sitio).ThenBy(d => d.Nombre)
            .Select(d => new
            {
                d.Id, d.Nombre, d.Sitio, d.Marca, d.IpMgmt, d.RolHa, d.GrupoHa, d.CertSha256, d.Activo,
                tieneKey = d.ApiKeyEnc != null,
            }).ToListAsync());

    [HttpPost("equipos")]
    public async Task<IActionResult> CrearEquipo([FromBody] DeviceRequest r)
    {
        if (Validar(r) is { } err) return BadRequest(err);
        var d = new NetDevice();
        Aplicar(d, r);
        db.NetDevices.Add(d);
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("NET_EQUIPO_CREADO", $"net_device:{d.Id}", $"{d.Nombre} {d.IpMgmt}" + (d.ApiKeyEnc != null ? " (key cargada)" : ""));
        return Ok(new { d.Id });
    }

    [HttpPut("equipos/{id:int}")]
    public async Task<IActionResult> EditarEquipo(int id, [FromBody] DeviceRequest r)
    {
        if (Validar(r) is { } err) return BadRequest(err);
        var d = await db.NetDevices.FindAsync(id);
        if (d is null) return NotFound();
        var cambiaKey = !string.IsNullOrWhiteSpace(r.ApiKey);
        Aplicar(d, r);
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("NET_EQUIPO_EDITADO", $"net_device:{d.Id}", $"{d.Nombre} {d.IpMgmt}" + (cambiaKey ? " (key actualizada)" : ""));
        return NoContent();
    }

    [HttpDelete("equipos/{id:int}")]
    public async Task<IActionResult> EliminarEquipo(int id)
    {
        var d = await db.NetDevices.FindAsync(id);
        if (d is null) return NotFound();
        if (await db.NetLinks.AnyAsync(l => l.DeviceId == id))
            return Conflict("El equipo tiene enlaces; desactívelo en lugar de eliminarlo (conservan su historial).");
        db.NetDevices.Remove(d);
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("NET_EQUIPO_ELIMINADO", $"net_device:{id}", d.Nombre);
        return NoContent();
    }

    // ApiKey vacía/null = no tocar la key guardada
    void Aplicar(NetDevice d, DeviceRequest r)
    {
        d.Nombre = r.Nombre.Trim(); d.Sitio = r.Sitio.Trim(); d.Marca = r.Marca; d.IpMgmt = r.IpMgmt.Trim();
        d.RolHa = r.RolHa; d.GrupoHa = string.IsNullOrWhiteSpace(r.GrupoHa) ? null : r.GrupoHa.Trim();
        d.Activo = r.Activo;
        var h = PaloAltoClient.NormalizarHuella(r.CertSha256 ?? "");
        d.CertSha256 = h.Length == 0 ? null : h;
        if (!string.IsNullOrWhiteSpace(r.ApiKey))
            d.ApiKeyEnc = SecretoCifrado.Cifrar(r.ApiKey.Trim(), Secreto());
    }

    // ── Enlaces ──────────────────────────────────────────────
    [HttpGet("enlaces")]
    public async Task<IActionResult> Enlaces() =>
        Ok(await db.NetLinks.Include(l => l.Device).OrderBy(l => l.Device.Sitio).ThenBy(l => l.Interfaz)
            .Select(l => new
            {
                l.Id, l.DeviceId, dispositivo = l.Device.Nombre, l.Interfaz, l.Zona, l.Rol,
                l.MbpsContratadoIn, l.MbpsContratadoOut, l.UmbralWarnPct, l.UmbralCritPct, l.MedirAlerta,
            }).ToListAsync());

    static string? Validar(LinkRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Interfaz)) return "La interfaz es obligatoria";
        if (!RolesEnlace.Contains(r.Rol)) return "Rol de enlace no válido";
        if (r.MbpsContratadoIn is < 0 || r.MbpsContratadoOut is < 0) return "El ancho contratado no puede ser negativo";
        if (r.UmbralWarnPct <= 0 || r.UmbralCritPct <= r.UmbralWarnPct || r.UmbralCritPct > 100)
            return "Umbrales no válidos (0 < aviso < crítico ≤ 100)";
        return null;
    }

    [HttpPost("enlaces")]
    public async Task<IActionResult> CrearEnlace([FromBody] LinkRequest r)
    {
        if (Validar(r) is { } err) return BadRequest(err);
        if (!await db.NetDevices.AnyAsync(d => d.Id == r.DeviceId)) return BadRequest("Equipo no existe");
        var l = new NetLink { DeviceId = r.DeviceId };
        Aplicar(l, r);
        db.NetLinks.Add(l);
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("NET_ENLACE_CREADO", $"net_link:{l.Id}", $"{l.Interfaz} {l.Rol}");
        return Ok(new { l.Id });
    }

    [HttpPut("enlaces/{id:int}")]
    public async Task<IActionResult> EditarEnlace(int id, [FromBody] LinkRequest r)
    {
        if (Validar(r) is { } err) return BadRequest(err);
        var l = await db.NetLinks.FindAsync(id);
        if (l is null) return NotFound();
        Aplicar(l, r);
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("NET_ENLACE_EDITADO", $"net_link:{id}",
            $"{l.Interfaz} in={l.MbpsContratadoIn} out={l.MbpsContratadoOut} warn={l.UmbralWarnPct} crit={l.UmbralCritPct}");
        return NoContent();
    }

    static void Aplicar(NetLink l, LinkRequest r)
    {
        l.Interfaz = r.Interfaz.Trim(); l.Zona = string.IsNullOrWhiteSpace(r.Zona) ? null : r.Zona.Trim();
        l.Rol = r.Rol; l.MbpsContratadoIn = r.MbpsContratadoIn; l.MbpsContratadoOut = r.MbpsContratadoOut;
        l.UmbralWarnPct = r.UmbralWarnPct; l.UmbralCritPct = r.UmbralCritPct; l.MedirAlerta = r.MedirAlerta;
    }
}
