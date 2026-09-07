using AunorApi.Data;
using Microsoft.EntityFrameworkCore;
using MigraDocCore.DocumentObjectModel;
using MigraDocCore.DocumentObjectModel.Tables;
// El namespace real de ImageSource/IImageSource quedó así de raro en el port de MigraDocCore a .NET Core
using MigraDocCore.DocumentObjectModel.MigraDoc.DocumentObjectModel.Shapes;
using MigraDocCore.Rendering;

namespace AunorApi.Services;

public class ReportePdfService(AppDbContext db, ReporteService reporteService, IWebHostEnvironment env)
{
    private static readonly Color Brand      = new(0x0F, 0x6F, 0x5A);
    private static readonly Color BrandLight = new(0xE8, 0xF5, 0xF1);
    private static readonly Color Gray       = new(0x5F, 0x71, 0x86);
    private static readonly Color Danger     = new(0xEF, 0x4B, 0x54);
    private static readonly Color RowAlt     = new(0xF6, 0xF8, 0xF7);
    private static readonly Color Border     = new(0xDD, 0xE3, 0xE1);
    private const string FontName = PdfFontResolver.FontFamily;

    private (Document doc, Section section) Encabezado(string titulo, string subtitulo)
    {
        var doc = new Document();
        doc.Info.Title = titulo;
        doc.DefaultPageSetup.PageFormat  = PageFormat.A4;
        doc.DefaultPageSetup.Orientation = Orientation.Landscape;
        doc.DefaultPageSetup.TopMargin    = "1.4cm";
        doc.DefaultPageSetup.BottomMargin = "1.4cm";
        doc.DefaultPageSetup.LeftMargin   = "1.4cm";
        doc.DefaultPageSetup.RightMargin  = "1.4cm";

        var normal = doc.Styles["Normal"];
        normal.Font.Name = FontName;
        normal.Font.Size = 8.5;

        var section = doc.AddSection();

        var logoPath = Path.Combine(env.WebRootPath, "logo.png");
        if (File.Exists(logoPath))
        {
            var img = section.AddImage(ImageSource.FromFile(logoPath));
            img.Height = "1cm";
            img.LockAspectRatio = true;
        }

        var h1 = section.AddParagraph(titulo);
        h1.Format.Font.Size = 17;
        h1.Format.Font.Bold = true;
        h1.Format.Font.Color = Brand;
        h1.Format.SpaceBefore = "0.3cm";
        h1.Format.SpaceAfter = "0.05cm";

        var sub = section.AddParagraph(subtitulo);
        sub.Format.Font.Size = 8.5;
        sub.Format.Font.Color = Gray;
        sub.Format.SpaceAfter = "0.6cm";

        // Pie de página con paginación
        var footer = section.Footers.Primary.AddParagraph();
        footer.Format.Font.Size = 7.5;
        footer.Format.Font.Color = Gray;
        footer.Format.Alignment = ParagraphAlignment.Center;
        footer.AddText("Pulso Vial · Página ");
        footer.AddPageField();
        footer.AddText(" de ");
        footer.AddNumPagesField();

        return (doc, section);
    }

    private static Table NuevaTabla(Section section, params (string header, Unit width)[] columnas)
    {
        var table = section.AddTable();
        table.Borders.Width = 0.4;
        table.Borders.Color = Border;
        table.Format.Font.Name = FontName;
        table.Format.Font.Size = 8;

        foreach (var (_, width) in columnas)
            table.AddColumn(width);

        var head = table.AddRow();
        head.HeadingFormat = true;
        head.Shading.Color = Brand;
        head.Format.Font.Color = Colors.White;
        head.Format.Font.Bold = true;
        head.VerticalAlignment = VerticalAlignment.Center;
        for (int i = 0; i < columnas.Length; i++)
            head.Cells[i].AddParagraph(columnas[i].header);

        return table;
    }

    private static Row FilaDatos(Table table, int index)
    {
        var row = table.AddRow();
        if (index % 2 == 1) row.Shading.Color = RowAlt;
        row.VerticalAlignment = VerticalAlignment.Center;
        return row;
    }

    private static string Dur(int? min)
    {
        if (min is null) return "Activo";
        if (min < 60) return $"{min}m";
        var h = min.Value / 60; var m = min.Value % 60;
        return m > 0 ? $"{h}h {m}m" : $"{h}h";
    }

    private static byte[] Render(Document doc)
    {
        var renderer = new PdfDocumentRenderer { Document = doc };
        renderer.RenderDocument();
        using var ms = new MemoryStream();
        renderer.PdfDocument.Save(ms, false);  // closeStream:false — necesitamos leer ms.ToArray() después
        return ms.ToArray();
    }

    // ── Informe de Incidentes ───────────────────────────────────
    public async Task<byte[]> GenerarIncidentesAsync(DateTime desde, DateTime hasta, string? estacion, bool soloAbiertos)
    {
        var q = db.Incidentes
            .Include(i => i.Equipo).ThenInclude(e => e.Via).ThenInclude(v => v.Estacion)
            .AsQueryable();

        if (!string.IsNullOrEmpty(estacion)) q = q.Where(i => i.Equipo.Via.Estacion.Nombre == estacion);
        if (soloAbiertos)                   q = q.Where(i => i.Fin == null);
        q = q.Where(i => i.Inicio >= desde && i.Inicio <= hasta);

        var items = await q
            .OrderByDescending(i => i.Inicio)
            .Take(3000)
            .Select(i => new {
                i.Equipo.Nombre,
                Estacion = i.Equipo.Via.Estacion.Nombre,
                Via      = i.Equipo.Via.Numero,
                i.Inicio, i.Fin, i.DuracionMin, i.Tipo, i.Motivo
            })
            .ToListAsync();

        var activos = items.Count(i => i.Fin == null);
        var subtitulo = $"Período: {desde:dd/MM/yyyy} — {hasta:dd/MM/yyyy}" +
                         (estacion is not null ? $"   ·   Estación: {estacion}" : "") +
                         $"   ·   Generado: {DateTime.Now:dd/MM/yyyy HH:mm}";

        var (doc, section) = Encabezado("Informe de Incidentes de Red", subtitulo);

        var kpi = section.AddParagraph();
        kpi.Format.SpaceAfter = "0.4cm";
        kpi.AddFormattedText($"{items.Count}", new Font_(true, 16, Danger));
        kpi.AddText(" incidentes en el período    ");
        kpi.AddFormattedText($"{activos}", new Font_(true, 16, Danger));
        kpi.AddText(" activos ahora");

        var table = NuevaTabla(section,
            ("Equipo", "3.2cm"), ("Estación", "2.4cm"), ("Vía", "1.6cm"),
            ("Inicio", "3cm"), ("Fin", "3cm"), ("Duración", "2cm"),
            ("Tipo", "2.2cm"), ("Motivo", "5.6cm"));

        int i = 0;
        foreach (var it in items)
        {
            var row = FilaDatos(table, i++);
            row.Cells[0].AddParagraph(it.Nombre);
            row.Cells[1].AddParagraph(it.Estacion);
            row.Cells[2].AddParagraph(it.Via);
            row.Cells[3].AddParagraph(it.Inicio.ToString("dd/MM/yyyy HH:mm:ss"));
            row.Cells[4].AddParagraph(it.Fin?.ToString("dd/MM/yyyy HH:mm:ss") ?? "Activo");
            row.Cells[5].AddParagraph(Dur(it.DuracionMin));
            row.Cells[6].AddParagraph(it.Tipo);
            row.Cells[7].AddParagraph(it.Motivo ?? "");
        }
        if (items.Count == 0)
        {
            var row = table.AddRow();
            row.Cells[0].MergeRight = 7;
            row.Cells[0].AddParagraph("Sin incidentes en el período seleccionado");
            row.Cells[0].Format.Alignment = ParagraphAlignment.Center;
            row.Cells[0].Format.Font.Color = Gray;
        }

        return Render(doc);
    }

    // ── Informe SLA ──────────────────────────────────────────────
    public async Task<byte[]> GenerarSlaAsync(DateTime desde, DateTime hasta, int? estacionId)
    {
        var equipos     = await reporteService.ComputeSlaAsync(desde, hasta, soloCriticos: false, estacionId: estacionId);
        var porEstacion = await reporteService.ComputeSlaPorEstacionAsync(desde, hasta);
        if (estacionId.HasValue) porEstacion = porEstacion.Where(e => e.EstacionId == estacionId).ToList();

        var uptimeGlobal = equipos.Count > 0 ? equipos.Average(e => e.UptimePct) : 100m;
        var subtitulo = $"Período: {desde:dd/MM/yyyy} — {hasta:dd/MM/yyyy}" +
                         (estacionId.HasValue ? $"   ·   Estación filtrada" : "") +
                         $"   ·   Generado: {DateTime.Now:dd/MM/yyyy HH:mm}";

        var (doc, section) = Encabezado("Informe SLA · Disponibilidad de Equipos", subtitulo);

        var uptimeColor = uptimeGlobal >= 99 ? Brand : uptimeGlobal >= 95 ? new Color(0xE0, 0x99, 0x1F) : Danger;
        var kpi = section.AddParagraph();
        kpi.Format.SpaceAfter = "0.45cm";
        kpi.AddFormattedText($"{uptimeGlobal:0.00}%", new Font_(true, 16, uptimeColor));
        kpi.AddText(" uptime promedio    ");
        kpi.AddFormattedText($"{equipos.Count}", new Font_(true, 16, Brand));
        kpi.AddText(" equipos monitoreados");

        // Tabla por estación
        var tPorEstacion = NuevaTabla(section, ("Estación", "6cm"), ("Uptime %", "4cm"), ("Equipos", "4cm"));
        int i = 0;
        foreach (var e in porEstacion.OrderBy(e => e.Estacion))
        {
            var row = FilaDatos(tPorEstacion, i++);
            row.Cells[0].AddParagraph(e.Estacion);
            var pCell = row.Cells[1].AddParagraph($"{e.UptimePct:0.00}%");
            pCell.Format.Font.Bold = true;
            pCell.Format.Font.Color = e.UptimePct >= 99 ? Brand : e.UptimePct >= 95 ? new Color(0xE0, 0x99, 0x1F) : Danger;
            row.Cells[2].AddParagraph(e.Total.ToString());
        }

        var spacer = section.AddParagraph();
        spacer.Format.SpaceAfter = "0.3cm";

        // Tabla detalle por equipo
        var detalleTitulo = section.AddParagraph("Detalle por equipo");
        detalleTitulo.Format.Font.Bold = true;
        detalleTitulo.Format.Font.Size = 11;
        detalleTitulo.Format.Font.Color = Brand;
        detalleTitulo.Format.SpaceAfter = "0.2cm";

        var tDetalle = NuevaTabla(section,
            ("Equipo", "3.2cm"), ("Tipo", "2.8cm"), ("Estación", "2.4cm"), ("Vía", "1.6cm"),
            ("Uptime %", "1.8cm"), ("Caído", "1.8cm"), ("Total", "1.8cm"), ("Motivos", "5.4cm"));

        i = 0;
        foreach (var e in equipos.OrderBy(e => e.Estacion).ThenBy(e => e.Nombre))
        {
            var row = FilaDatos(tDetalle, i++);
            row.Cells[0].AddParagraph(e.Nombre);
            row.Cells[1].AddParagraph(e.TipoNombre);
            row.Cells[2].AddParagraph(e.Estacion);
            row.Cells[3].AddParagraph(e.Via);
            var pUp = row.Cells[4].AddParagraph($"{e.UptimePct:0.00}%");
            pUp.Format.Font.Bold = true;
            pUp.Format.Font.Color = e.UptimePct >= 99 ? Brand : e.UptimePct >= 95 ? new Color(0xE0, 0x99, 0x1F) : Danger;
            row.Cells[5].AddParagraph(Dur(e.DownMin));
            row.Cells[6].AddParagraph(Dur(e.TotalMin));
            row.Cells[7].AddParagraph(e.Motivos ?? "");
        }
        if (equipos.Count == 0)
        {
            var row = tDetalle.AddRow();
            row.Cells[0].MergeRight = 7;
            row.Cells[0].AddParagraph("Sin equipos para el filtro seleccionado");
            row.Cells[0].Format.Alignment = ParagraphAlignment.Center;
            row.Cells[0].Format.Font.Color = Gray;
        }

        return Render(doc);
    }
}

// Pequeño helper para texto con formato inline (tamaño/negrita/color) en un Paragraph
file static class ParagraphExtensions
{
    public static void AddFormattedText(this Paragraph p, string text, Font_ fmt)
    {
        var ft = p.AddFormattedText(text);
        ft.Font.Bold = fmt.Bold;
        ft.Font.Size = fmt.Size;
        ft.Font.Color = fmt.Color;
    }
}

file record Font_(bool Bold, double Size, Color Color);
