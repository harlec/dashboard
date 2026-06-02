using AunorApi.Data;
using AunorApi.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/camaras")]
[Authorize]
public class CamarasController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var rows = await db.CamarasHeartbeat
            .OrderBy(c => c.Camara)
            .ToListAsync();

        var now = DateTime.UtcNow;
        var result = rows.Select(c =>
        {
            int? min = c.UltimoEmail.HasValue
                ? (int)(now - c.UltimoEmail.Value).TotalMinutes
                : null;
            bool online = c.UltimoEmail.HasValue && min <= 70;
            return new CamaraStatusDto(c.Id, c.Camara, c.UltimoEmail, min, online);
        });

        return Ok(result);
    }
}
