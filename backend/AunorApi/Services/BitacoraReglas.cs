using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace AunorApi.Services;

// Reglas puras de la Bitácora (sin base de datos) — para poder probarlas con xUnit.
public static partial class BitacoraReglas
{
    public const int MaxDescripcion = 500;
    public const int MaxTexto       = 100;
    public const int MaxDuracionMin = 24 * 60;
    public const int DiasEdicion    = 7;
    public const byte EstadoHecho = 1, EstadoEnProceso = 2;

    public record Palabra(string Texto, int? SedeId, int? CategoriaId);
    public record Deteccion(IReadOnlyList<int> SedeIds, int? CategoriaId);

    public record Entrada(
        string? Descripcion, IReadOnlyCollection<int>? SedeIds, DateTime? Fecha,
        int? DuracionMin, string? Solicitante, string? EquipoRef, byte? Estado);

    // ── Normalización: minúsculas y sin tildes ─────────────────────────────
    public static string Normalizar(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        var d = s.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(d.Length);
        foreach (var c in d)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    [GeneratedRegex(@"[a-z0-9]+")]
    private static partial Regex Tokens();

    // ── Detección automática de sede y categoría ───────────────────────────
    // Compara PALABRAS COMPLETAS (también en plural simple: anexo → anexos). Así "santa" no
    // se confunde con "san" y "despliegue de anexos en todas las plazas" no marca sedes.
    // Categoría: gana la que acumule más coincidencias; en empate, la que aparece primero.
    public static Deteccion Detectar(string? texto, IEnumerable<Palabra> palabras)
    {
        var tokens = Tokens().Matches(Normalizar(texto)).Select(m => m.Value).ToList();
        if (tokens.Count == 0) return new Deteccion([], null);

        var sedes = new List<int>();
        var puntos = new Dictionary<int, (int n, int primera)>();
        foreach (var p in palabras)
        {
            var w = Normalizar(p.Texto);
            if (w.Length == 0) continue;
            var pos = tokens.FindIndex(t => t == w || t == w + "s" || t == w + "es");
            if (pos < 0) continue;
            if (p.SedeId is { } s && !sedes.Contains(s)) sedes.Add(s);
            if (p.CategoriaId is { } c)
                puntos[c] = puntos.TryGetValue(c, out var v) ? (v.n + 1, Math.Min(v.primera, pos)) : (1, pos);
        }
        int? cat = puntos.Count == 0 ? null
            : puntos.OrderByDescending(kv => kv.Value.n).ThenBy(kv => kv.Value.primera).First().Key;
        return new Deteccion(sedes, cat);
    }

    // ── Validación (devuelve mensajes; vacío = válido) ─────────────────────
    public static List<string> Validar(Entrada e, DateTime ahora)
    {
        var errores = new List<string>();
        var desc = e.Descripcion?.Trim() ?? "";
        if (desc.Length == 0) errores.Add("Escribe qué se hizo");
        else if (desc.Length > MaxDescripcion) errores.Add($"La descripción admite hasta {MaxDescripcion} caracteres");
        if (e.SedeIds is null || e.SedeIds.Count == 0) errores.Add("Elige al menos una sede");
        if (e.Fecha is { } f && f > ahora.AddMinutes(5)) errores.Add("La fecha no puede ser futura");
        if (e.DuracionMin is { } d && (d < 0 || d > MaxDuracionMin)) errores.Add($"La duración debe estar entre 0 y {MaxDuracionMin} minutos");
        if (e.Solicitante is { Length: > MaxTexto }) errores.Add($"El solicitante admite hasta {MaxTexto} caracteres");
        if (e.EquipoRef is { Length: > MaxTexto }) errores.Add($"La referencia de equipo admite hasta {MaxTexto} caracteres");
        if (e.Estado is { } es && es is not (EstadoHecho or EstadoEnProceso)) errores.Add("Estado inválido");
        return errores;
    }

    // ── Valores por defecto: un registro incompleto es mejor que ninguno ───
    public static DateTime FechaPorDefecto(DateTime? fecha, DateTime ahora) => fecha ?? ahora;
    public static byte EstadoPorDefecto(byte? estado) => estado ?? EstadoHecho;

    // ── Permisos: el admin edita todo; el resto solo lo suyo, hasta 7 días después ──
    public static bool PuedeEditar(int creadoPorUsuarioId, DateTime creadoEn, int usuarioId, bool esAdmin, DateTime ahora) =>
        esAdmin || (creadoPorUsuarioId == usuarioId && ahora - creadoEn <= TimeSpan.FromDays(DiasEdicion));
}
