using System.IO.Compression;

namespace AunorApi.Services.ReporteDiario;

// Gráficos del correo como PNG generados en el servidor, sin dependencias nativas (ni SkiaSharp/GDI+):
// rasterizador propio con supersampling 3× + codificador PNG (zlib de .NET). Solo trazos y áreas, sin texto
// (las etiquetas van en HTML), así no hace falta ninguna fuente en el contenedor.
// Los valores null (días sin dato) cortan la línea: nunca se interpolan ni se dibujan como 0.
public static class ChartPng
{
    public readonly record struct Rgb(byte R, byte G, byte B)
    {
        public static Rgb Hex(string h) => new(Convert.ToByte(h[1..3], 16), Convert.ToByte(h[3..5], 16), Convert.ToByte(h[5..7], 16));
    }

    private const int S = 3; // factor de supersampling

    // Línea con área rellena, promedio punteado y punto final (tendencias de 30 días)
    public static byte[] Tendencia(IReadOnlyList<double?> valores, double? promedio, int w, int h, string lineaHex, string rellenoHex, string fondoHex = "#FFFFFF")
        => Dibujar(valores, promedio, w, h, Rgb.Hex(lineaHex), Rgb.Hex(rellenoHex), Rgb.Hex(fondoHex), area: true, lw: 2.2, punto: true);

    // Mini línea de 7 días (vías críticas)
    public static byte[] Spark(IReadOnlyList<double?> valores, int w, int h, string lineaHex, string fondoHex = "#FFFFFF")
        => Dibujar(valores, null, w, h, Rgb.Hex(lineaHex), default, Rgb.Hex(fondoHex), area: false, lw: 1.8, punto: true);

    private static byte[] Dibujar(IReadOnlyList<double?> v, double? prom, int w, int h, Rgb linea, Rgb relleno, Rgb fondo, bool area, double lw, bool punto)
    {
        int W = w * S, H = h * S;
        var px = new byte[W * H * 3];
        for (int i = 0; i < W * H; i++) { px[i * 3] = fondo.R; px[i * 3 + 1] = fondo.G; px[i * 3 + 2] = fondo.B; }

        var datos = v.Where(x => x.HasValue).Select(x => x!.Value).ToList();
        if (prom.HasValue) datos.Add(prom.Value);
        if (datos.Count == 0 || v.Count < 2) return Png(w, h, Reducir(px, W, H));

        double min = datos.Min(), max = datos.Max();
        if (max - min < 1e-9) { min -= 1; max += 1; }
        var pad = (max - min) * 0.12; min -= pad; max += pad;

        double padX = 6 * S, padY = 6 * S;
        double X(int i) => padX + (W - 2 * padX) * i / (v.Count - 1);
        double Y(double val) => padY + (H - 2 * padY) * (1 - (val - min) / (max - min));

        // Áreas y trazos por tramos contiguos (los null cortan)
        for (int i = 0; i < v.Count - 1; i++)
        {
            if (v[i] is not { } a || v[i + 1] is not { } b) continue;
            double x0 = X(i), y0 = Y(a), x1 = X(i + 1), y1 = Y(b);
            if (area)
                for (int x = (int)Math.Ceiling(x0); x <= (int)x1 && x < W; x++)
                {
                    double y = y0 + (y1 - y0) * (x - x0) / Math.Max(1e-9, x1 - x0);
                    for (int yy = Math.Max(0, (int)y); yy < H - (int)padY / 2; yy++) Set(px, W, H, x, yy, relleno);
                }
        }
        if (prom is { } p)
        {
            int y = (int)Y(p);
            for (int x = (int)padX; x < W - padX; x++)
                if ((x / (5 * S)) % 2 == 0)
                    for (int t = -S / 2; t <= S / 2; t++) Set(px, W, H, x, y + t, new Rgb(150, 160, 158));
        }
        for (int i = 0; i < v.Count - 1; i++)
            if (v[i] is { } a && v[i + 1] is { } b)
                Segmento(px, W, H, X(i), Y(a), X(i + 1), Y(b), lw * S / 2, linea);

        if (punto)
        {
            int ult = -1;
            for (int i = v.Count - 1; i >= 0; i--) if (v[i].HasValue) { ult = i; break; }
            if (ult >= 0) Circulo(px, W, H, X(ult), Y(v[ult]!.Value), 3.4 * S, linea);
        }
        return Png(w, h, Reducir(px, W, H));
    }

    private static void Set(byte[] px, int W, int H, int x, int y, Rgb c)
    {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        int o = (y * W + x) * 3; px[o] = c.R; px[o + 1] = c.G; px[o + 2] = c.B;
    }

    // Trazo grueso con extremos redondeados: todo píxel a distancia ≤ radio del segmento
    private static void Segmento(byte[] px, int W, int H, double x0, double y0, double x1, double y1, double r, Rgb c)
    {
        int xa = (int)Math.Floor(Math.Min(x0, x1) - r), xb = (int)Math.Ceiling(Math.Max(x0, x1) + r);
        int ya = (int)Math.Floor(Math.Min(y0, y1) - r), yb = (int)Math.Ceiling(Math.Max(y0, y1) + r);
        double dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
        for (int y = ya; y <= yb; y++)
            for (int x = xa; x <= xb; x++)
            {
                double t = len2 < 1e-9 ? 0 : Math.Clamp(((x - x0) * dx + (y - y0) * dy) / len2, 0, 1);
                double ex = x - (x0 + t * dx), ey = y - (y0 + t * dy);
                if (ex * ex + ey * ey <= r * r) Set(px, W, H, x, y, c);
            }
    }

    private static void Circulo(byte[] px, int W, int H, double cx, double cy, double r, Rgb c)
    {
        for (int y = (int)(cy - r) - 1; y <= (int)(cy + r) + 1; y++)
            for (int x = (int)(cx - r) - 1; x <= (int)(cx + r) + 1; x++)
                if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) Set(px, W, H, x, y, c);
    }

    // Promedia bloques S×S (antialiasing)
    private static byte[] Reducir(byte[] px, int W, int H)
    {
        int w = W / S, h = H / S;
        var o = new byte[w * h * 3];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                for (int ch = 0; ch < 3; ch++)
                {
                    int sum = 0;
                    for (int j = 0; j < S; j++)
                        for (int i = 0; i < S; i++) sum += px[((y * S + j) * W + x * S + i) * 3 + ch];
                    o[(y * w + x) * 3 + ch] = (byte)(sum / (S * S));
                }
        return o;
    }

    // ── Codificador PNG (RGB 8 bits) ─────────────────────────────────────
    internal static byte[] Png(int w, int h, byte[] rgb)
    {
        var raw = new byte[(w * 3 + 1) * h];
        for (int y = 0; y < h; y++) Buffer.BlockCopy(rgb, y * w * 3, raw, y * (w * 3 + 1) + 1, w * 3); // filtro 0 al inicio de cada fila

        using var ms = new MemoryStream();
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        var ihdr = new byte[13];
        BE(ihdr, 0, w); BE(ihdr, 4, h); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
        Chunk(ms, "IHDR", ihdr);
        using (var z = new MemoryStream())
        {
            using (var zs = new ZLibStream(z, CompressionLevel.Optimal, leaveOpen: true)) zs.Write(raw);
            Chunk(ms, "IDAT", z.ToArray());
        }
        Chunk(ms, "IEND", []);
        return ms.ToArray();
    }

    private static void BE(byte[] b, int o, int v) { b[o] = (byte)(v >> 24); b[o + 1] = (byte)(v >> 16); b[o + 2] = (byte)(v >> 8); b[o + 3] = (byte)v; }

    private static void Chunk(Stream s, string tipo, byte[] datos)
    {
        var len = new byte[4]; BE(len, 0, datos.Length); s.Write(len);
        var td = new byte[4 + datos.Length];
        for (int i = 0; i < 4; i++) td[i] = (byte)tipo[i];
        Buffer.BlockCopy(datos, 0, td, 4, datos.Length);
        s.Write(td);
        var crc = new byte[4]; BE(crc, 0, (int)Crc32(td)); s.Write(crc);
    }

    private static readonly uint[] Tabla = Enumerable.Range(0, 256).Select(n =>
    {
        uint c = (uint)n;
        for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
        return c;
    }).ToArray();

    private static uint Crc32(byte[] d)
    {
        uint c = 0xFFFFFFFF;
        foreach (var b in d) c = Tabla[(c ^ b) & 0xFF] ^ (c >> 8);
        return c ^ 0xFFFFFFFF;
    }
}
