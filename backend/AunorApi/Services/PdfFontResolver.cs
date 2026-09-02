using PdfSharpCore.Fonts;

namespace AunorApi.Services;

// PdfSharpCore no tiene acceso a GDI+/fontconfig en Linux — hay que resolver
// las fuentes manualmente. Usa DejaVu Sans (instalada vía apt en el Dockerfile),
// que soporta tildes/ñ y es visualmente muy similar a Arial/Segoe UI.
public class PdfFontResolver : IFontResolver
{
    public const string FontFamily = "DejaVu Sans";

    private const string Regular    = "DejaVuSans#Regular";
    private const string Bold       = "DejaVuSans#Bold";
    private const string Italic     = "DejaVuSans#Italic";
    private const string BoldItalic = "DejaVuSans#BoldItalic";

    private const string Dir = "/usr/share/fonts/truetype/dejavu/";

    public string DefaultFontName => FontFamily;

    public byte[] GetFont(string faceName) => File.ReadAllBytes(faceName switch
    {
        Bold       => Dir + "DejaVuSans-Bold.ttf",
        Italic     => Dir + "DejaVuSans-Oblique.ttf",
        BoldItalic => Dir + "DejaVuSans-BoldOblique.ttf",
        _          => Dir + "DejaVuSans.ttf",
    });

    public FontResolverInfo ResolveTypeface(string familyName, bool isBold, bool isItalic) =>
        new(isBold && isItalic ? BoldItalic
            : isBold            ? Bold
            : isItalic           ? Italic
            : Regular);
}
