using AunorApi.Data;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

// Cadena de conexión a la base "Consolidado" (OCR/Discrepancias) — se lee de
// Configuración (editable desde el panel, clave 'consolidado_conn') con la
// variable de entorno CONSOLIDADO_CONN como respaldo, igual que SMTP/Telegram.
public class ConsolidadoConnectionProvider(IConnectionStringProvider cs)
{
    public async Task<string> GetAsync()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(cs.ConnectionString).Options);

        var connStr = (await db.Configuraciones.FindAsync("consolidado_conn"))?.Valor;

        if (string.IsNullOrWhiteSpace(connStr))
            connStr = Environment.GetEnvironmentVariable("CONSOLIDADO_CONN");

        if (string.IsNullOrWhiteSpace(connStr))
            throw new InvalidOperationException(
                "La conexión a la base Consolidado no está configurada. Ve a Configuración → 'Consolidado (OCR/Discrepancias) Cadena de conexión'.");

        return connStr;
    }
}
