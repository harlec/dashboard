using AunorApi.Data;
using AunorApi.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/config")]
[Authorize]
public class ConfiguracionController(AppDbContext db) : ControllerBase
{
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
}

public record ConfigRequest(string Valor);
