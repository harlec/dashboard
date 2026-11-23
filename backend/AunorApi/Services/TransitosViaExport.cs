using ClosedXML.Excel;

namespace AunorApi.Services;

// Libro de Excel del detalle de tránsitos de una vía: hoja "Resumen" (totales, medios
// de pago, categorías) y hoja "Tránsitos" (un renglón por paso). Fechas y números reales
// —no texto— para poder filtrar y ordenar en Excel.
public static class TransitosViaExport
{
    private static readonly XLColor Brand = XLColor.FromHtml("#0F6F5A");

    public static byte[] Xlsx(TransitosViaDto d, string subtitulo, bool truncado)
    {
        using var wb = new XLWorkbook();

        // ── Resumen ──
        var rs = wb.Worksheets.Add("Resumen");
        rs.Cell(1, 1).Value = $"Tránsitos · {d.Estacion} · {d.Via}";
        rs.Cell(1, 1).Style.Font.Bold = true;
        rs.Cell(1, 1).Style.Font.FontSize = 14;
        rs.Cell(2, 1).Value = subtitulo;
        rs.Cell(2, 1).Style.Font.FontColor = XLColor.Gray;

        rs.Cell(4, 1).Value = "Total de tránsitos";   rs.Cell(4, 2).Value = d.Total;
        rs.Cell(5, 1).Value = "Tránsitos por hora";    if (d.PorHora is { } ph) rs.Cell(5, 2).Value = ph; else rs.Cell(5, 2).Value = "—";
        rs.Cell(6, 1).Value = "Último tránsito";       rs.Cell(6, 2).Value = d.UltimoTransito ?? "—";
        rs.Cell(7, 1).Value = "Prepago (subforma 1)";  rs.Cell(7, 2).Value = d.Prepago;
        rs.Range(4, 1, 7, 1).Style.Font.Bold = true;
        rs.Range(4, 2, 7, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        rs.Cell(4, 2).Style.NumberFormat.Format = "#,##0";
        rs.Cell(7, 2).Style.NumberFormat.Format = "#,##0";

        int r = 9;
        r = Tabla(rs, r, ["Medio de pago", "Tránsitos", "% del total"],
            d.PorMedio.Select(m => new object[] { m.Nombre, m.Total, d.Total > 0 ? m.Total * 100.0 / d.Total : 0 }),
            fmtPct: 3);
        r += 1;
        Tabla(rs, r, ["Categoría", "Tránsitos", "% del total"],
            d.PorCategoria.Select(c => new object[] { c.Categoria, c.Total, d.Total > 0 ? c.Total * 100.0 / d.Total : 0 }),
            fmtPct: 3);
        if (truncado)
        {
            rs.Cell(3, 1).Value = "La hoja Tránsitos está limitada a los más recientes; los totales de esta hoja sí son del período completo.";
            rs.Cell(3, 1).Style.Font.FontColor = XLColor.FromHtml("#B45309");
        }
        rs.Column(1).Width = 28; rs.Column(2).Width = 16; rs.Column(3).Width = 14;

        // ── Tránsitos ──
        var ws = wb.Worksheets.Add("Tránsitos");
        string[] cab = ["Fecha y hora", "Ticket", "Sentido", "Placa", "Placa OCR", "Categoría",
                        "Medio de pago", "Prepago", "Tipo de tránsito", "Cobrador"];
        for (int c = 0; c < cab.Length; c++) ws.Cell(1, c + 1).Value = cab[c];
        var head = ws.Range(1, 1, 1, cab.Length);
        head.Style.Font.Bold = true;
        head.Style.Font.FontColor = XLColor.White;
        head.Style.Fill.BackgroundColor = Brand;

        int f = 2;
        foreach (var t in d.Ultimos)
        {
            if (DateTime.TryParse(t.Fecha, System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var dt))
                ws.Cell(f, 1).Value = dt;
            else
                ws.Cell(f, 1).Value = t.Fecha;
            ws.Cell(f, 2).Value = t.Ticket;
            ws.Cell(f, 3).Value = t.Sentido;
            ws.Cell(f, 4).Value = t.Placa;
            ws.Cell(f, 5).Value = t.PlacaOcr;
            ws.Cell(f, 6).Value = t.Categoria;
            ws.Cell(f, 7).Value = TransitosViaService.NombreMedio(t.Medio);
            ws.Cell(f, 8).Value = t.Prepago ? "Sí" : "No";
            ws.Cell(f, 9).Value = t.TipoTransito;
            ws.Cell(f, 10).Value = t.Cobrador;
            f++;
        }
        if (d.Ultimos.Count > 0)
        {
            ws.Range(2, 1, f - 1, 1).Style.NumberFormat.Format = "yyyy-mm-dd hh:mm:ss";
            ws.Range(1, 1, f - 1, cab.Length).SetAutoFilter();
        }
        ws.SheetView.FreezeRows(1);
        // Anchos fijos: AdjustToContents necesita fuentes del sistema, que el contenedor no tiene
        double[] anchos = [21, 12, 10, 12, 12, 26, 16, 10, 16, 16];
        for (int c = 0; c < anchos.Length; c++) ws.Column(c + 1).Width = anchos[c];

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    // Escribe una tabla con encabezado verde; devuelve la siguiente fila libre.
    private static int Tabla(IXLWorksheet ws, int fila, string[] cab, IEnumerable<object[]> filas, int fmtPct)
    {
        for (int c = 0; c < cab.Length; c++) ws.Cell(fila, c + 1).Value = cab[c];
        var h = ws.Range(fila, 1, fila, cab.Length);
        h.Style.Font.Bold = true;
        h.Style.Font.FontColor = XLColor.White;
        h.Style.Fill.BackgroundColor = Brand;
        fila++;
        foreach (var row in filas)
        {
            for (int c = 0; c < row.Length; c++)
            {
                var cell = ws.Cell(fila, c + 1);
                switch (row[c])
                {
                    case int i:    cell.Value = i; cell.Style.NumberFormat.Format = "#,##0"; break;
                    case double x: cell.Value = x; cell.Style.NumberFormat.Format = "0.0"; break;
                    default:       cell.Value = row[c]?.ToString() ?? ""; break;
                }
            }
            fila++;
        }
        return fila;
    }
}
