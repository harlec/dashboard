using System.Text;

namespace AunorApi.Services;

public static class CsvExport
{
    public static byte[] Build(IEnumerable<string> headers, IEnumerable<IEnumerable<object?>> rows)
    {
        var sb = new StringBuilder();
        sb.Append(string.Join(',', headers.Select(Escape))).Append("\r\n");
        foreach (var row in rows)
            sb.Append(string.Join(',', row.Select(Escape))).Append("\r\n");

        // BOM UTF-8 para que Excel detecte tildes/ñ correctamente
        var preamble = Encoding.UTF8.GetPreamble();
        var body = Encoding.UTF8.GetBytes(sb.ToString());
        var result = new byte[preamble.Length + body.Length];
        preamble.CopyTo(result, 0);
        body.CopyTo(result, preamble.Length);
        return result;
    }

    private static string Escape(object? value)
    {
        string s = value switch {
            null => "",
            DateTime dt => dt.ToString("yyyy-MM-dd HH:mm:ss"),
            decimal d => d.ToString("0.##"),
            _ => value.ToString() ?? ""
        };
        if (s.IndexOfAny([',', '"', '\n', '\r']) >= 0)
            s = "\"" + s.Replace("\"", "\"\"") + "\"";
        return s;
    }
}
