using AunorApi.DTOs;
using ClosedXML.Excel;

namespace AunorApi.Services;

// Libro de Excel de la tabla "Todas las Vías" (OCR). Valores numéricos reales —no texto— para poder
// filtrar y ordenar en Excel.
public static class OcrTodasViasExport
{
    public static byte[] Xlsx(IReadOnlyList<OcrTodasViasDto> filas, string subtitulo, string[] cab, int pocosDatos)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Todas las vías");
        ws.Cell(1, 1).Value = "Ranking OCR · todas las vías";
        ws.Cell(1, 1).Style.Font.Bold = true;
        ws.Cell(1, 1).Style.Font.FontSize = 14;
        ws.Cell(2, 1).Value = subtitulo;
        ws.Cell(2, 1).Style.Font.FontColor = XLColor.Gray;

        const int filaCab = 4;
        for (int c = 0; c < cab.Length; c++) ws.Cell(filaCab, c + 1).Value = cab[c];
        var rango = ws.Range(filaCab, 1, filaCab, cab.Length);
        rango.Style.Font.Bold = true;
        rango.Style.Font.FontColor = XLColor.White;
        rango.Style.Fill.BackgroundColor = XLColor.FromHtml("#0F6F5A");
        rango.Style.Alignment.WrapText = true;
        rango.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;

        int r = filaCab + 1;
        for (int idx = 0; idx < filas.Count; idx++)
        {
            var v = filas[idx];
            ws.Cell(r, 1).Value = idx + 1;
            ws.Cell(r, 2).Value = v.Via;
            ws.Cell(r, 3).Value = v.Estacion;
            ws.Cell(r, 4).Value = v.Total;
            ws.Cell(r, 5).Value = v.Aciertos;
            ws.Cell(r, 6).Value = v.NoReconocidas;
            ws.Cell(r, 7).Value = v.Confusiones;
            ws.Cell(r, 8).Value = (double)v.Efectividad;
            ws.Cell(r, 9).Value = (double)v.ScoreAcierto;
            ws.Cell(r, 10).Value = (double)v.ScoreError;
            ws.Cell(r, 11).Value = v.Total < pocosDatos ? "pocos datos" : "";
            r++;
        }
        if (filas.Count > 0)
        {
            ws.Range(filaCab + 1, 4, r - 1, 7).Style.NumberFormat.Format = "#,##0";
            ws.Range(filaCab + 1, 8, r - 1, 10).Style.NumberFormat.Format = "0.0";
            ws.Range(filaCab, 1, r - 1, cab.Length).SetAutoFilter();
        }
        ws.SheetView.FreezeRows(filaCab);
        // Anchos fijos: AdjustToContents necesita fuentes del sistema, que el contenedor no tiene
        double[] anchos = [10, 16, 14, 12, 12, 13, 13, 11, 22, 22, 14];
        for (int c = 0; c < anchos.Length; c++) ws.Column(c + 1).Width = anchos[c];
        ws.Row(filaCab).Height = 34;

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}
