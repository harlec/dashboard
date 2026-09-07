using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AunorApi.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace AunorApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, IConfiguration config) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var user = await db.Usuarios.FirstOrDefaultAsync(u => u.Username == req.Username && u.Activo);
        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.Password))
            return Unauthorized(new { error = "Credenciales incorrectas" });

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
            Secure    = false,  // true cuando uses HTTPS
            SameSite  = SameSiteMode.Strict,
            Expires   = expiry
        });

        return Ok(new { user.Id, user.Username, user.Nombre, user.Rol });
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
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
