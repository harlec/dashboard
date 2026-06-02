using AunorApi.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/tipos-equipo")]
[Authorize]
public class TiposEquipoController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.TiposEquipo.Where(t => t.Activo).OrderBy(t => t.Nombre).ToListAsync());
}
