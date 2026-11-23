using AunorApi.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/auditoria")]
[Authorize(Roles = "admin")]
public class AuditoriaController(AppDbContext db) : ControllerBase
{
    // GET api/auditoria?usuario=&accion=&desde=&hasta=&limite=200
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? usuario, [FromQuery] string? accion,
        [FromQuery] DateTime? desde, [FromQuery] DateTime? hasta, [FromQuery] int limite = 200)
    {
        var q = db.AuditLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(usuario)) q = q.Where(a => a.Usuario == usuario);
        if (!string.IsNullOrWhiteSpace(accion))  q = q.Where(a => a.Accion == accion);
        if (desde.HasValue) q = q.Where(a => a.Fecha >= desde.Value);
        if (hasta.HasValue) q = q.Where(a => a.Fecha <  hasta.Value);
        return Ok(await q.OrderByDescending(a => a.Id).Take(Math.Clamp(limite, 1, 1000)).ToListAsync());
    }
}
