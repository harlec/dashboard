using AunorApi.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace AunorApi.Services;

// El JWT dura horas; esto garantiza que un usuario dado de baja (o con otro rol) pierda
// el acceso en segundos y no hasta que el token expire. Caché corta para no ir a BD en cada request.
public class SesionValidator(IMemoryCache cache)
{
    static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

    record Estado(bool Activo, string Rol);

    public async Task<bool> EsValidaAsync(int userId, string rolDelToken, AppDbContext db)
    {
        var est = await cache.GetOrCreateAsync($"sesion:{userId}", async e =>
        {
            e.AbsoluteExpirationRelativeToNow = Ttl;
            var u = await db.Usuarios.AsNoTracking()
                .Where(x => x.Id == userId)
                .Select(x => new Estado(x.Activo, x.Rol))
                .FirstOrDefaultAsync();
            return u ?? new Estado(false, "");
        });
        return est!.Activo && string.Equals(est.Rol, rolDelToken, StringComparison.Ordinal);
    }

    public void Invalidar(int userId) => cache.Remove($"sesion:{userId}");
}
