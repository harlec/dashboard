using System.Security.Claims;
using AunorApi.Data;
using AunorApi.Models;

namespace AunorApi.Services;

public class AuditService(AppDbContext db, IHttpContextAccessor http, ILogger<AuditService> log)
{
    // IP del cliente: el nginx del frontend la manda en X-Real-IP (el backend no se publica al host)
    public static string? IpCliente(HttpContext? ctx)
    {
        if (ctx is null) return null;
        var ip = ctx.Request.Headers["X-Real-IP"].ToString();
        return string.IsNullOrWhiteSpace(ip) ? ctx.Connection.RemoteIpAddress?.ToString() : ip;
    }

    // `usuario` solo se pasa cuando aún no hay sesión (login). Un fallo al auditar no tumba la petición.
    public async Task RegistrarAsync(string accion, string? entidad = null, string? detalle = null, string? usuario = null)
    {
        try
        {
            var ctx = http.HttpContext;
            db.AuditLogs.Add(new AuditLog
            {
                Fecha   = DateTime.Now,
                Usuario = usuario ?? ctx?.User.FindFirstValue(ClaimTypes.Name),
                Ip      = IpCliente(ctx),
                Accion  = accion,
                Entidad = entidad,
                Detalle = detalle is { Length: > 500 } ? detalle[..500] : detalle
            });
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            log.LogError(ex, "No se pudo registrar auditoría {Accion}", accion);
        }
    }
}
