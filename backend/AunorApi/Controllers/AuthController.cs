using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AunorApi.Data;
using AunorApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, IConfiguration config, AuditService audit) : ControllerBase
{
    const int MaxIntentos     = 5;
    const int MinutosBloqueo  = 15;
    // Hash de relleno: el usuario inexistente tarda lo mismo en responder que uno real
    static readonly string HashFicticio = BCrypt.Net.BCrypt.HashPassword("relleno-sin-uso");

    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var user = await db.Usuarios.FirstOrDefaultAsync(u => u.Username == req.Username && u.Activo);

        if (user is { BloqueadoHasta: { } hasta } && hasta > DateTime.Now)
        {
            await audit.RegistrarAsync("LOGIN_BLOQUEADO", "usuario", null, req.Username);
            var min = (int)Math.Ceiling((hasta - DateTime.Now).TotalMinutes);
            return StatusCode(423, new { error = $"Cuenta bloqueada por intentos fallidos. Intente en {min} min." });
        }

        var ok = BCrypt.Net.BCrypt.Verify(req.Password ?? "", user?.Password ?? HashFicticio) && user is not null;
        if (!ok)
        {
            if (user is not null)
            {
                user.IntentosFallidos++;
                if (user.IntentosFallidos >= MaxIntentos)
                {
                    user.BloqueadoHasta   = DateTime.Now.AddMinutes(MinutosBloqueo);
                    user.IntentosFallidos = 0;
                }
                await db.SaveChangesAsync();
            }
            await audit.RegistrarAsync("LOGIN_FALLO", "usuario", null, req.Username);
            return Unauthorized(new { error = "Credenciales incorrectas" });
        }

        if (user!.IntentosFallidos != 0 || user.BloqueadoHasta is not null)
        {
            user.IntentosFallidos = 0;
            user.BloqueadoHasta   = null;
            await db.SaveChangesAsync();
        }
        await audit.RegistrarAsync("LOGIN_OK", "usuario", null, user.Username);

        var secret = Environment.GetEnvironmentVariable("JWT_SECRET")!;
        var key    = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds  = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiry = DateTime.UtcNow.AddHours(config.GetValue<int>("Jwt:ExpiryHours", 12));

        var token = new JwtSecurityToken(
            issuer:   config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims: [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name,  user.Username),
                new Claim("nombre", user.Nombre ?? user.Username),
                new Claim(ClaimTypes.Role,  user.Rol)
            ],
            expires:  expiry,
            signingCredentials: creds);

        var tokenStr = new JwtSecurityTokenHandler().WriteToken(token);

        Response.Cookies.Append("aunor_token", tokenStr, new CookieOptions
        {
            HttpOnly  = true,
            Secure    = config.GetValue<bool>("Jwt:CookieSecure"),  // true cuando se sirva por HTTPS
            SameSite  = SameSiteMode.Strict,
            Expires   = expiry
        });

        return Ok(new { user.Id, user.Username, user.Nombre, user.Rol });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await audit.RegistrarAsync("LOGOUT");
        Response.Cookies.Delete("aunor_token");
        return Ok();
    }

    [Authorize]
    [HttpGet("me")]
    public IActionResult Me()
    {
        var id       = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var username = User.FindFirstValue(ClaimTypes.Name);
        var nombre   = User.FindFirstValue("nombre");
        var rol      = User.FindFirstValue(ClaimTypes.Role);
        return Ok(new { id, username, nombre, rol });
    }
}

public record LoginRequest(string Username, string Password);
