using System.Security.Cryptography;
using System.Text;

namespace AunorApi.Services.NetMon;

// Cifra las API keys de los equipos de red para guardarlas en BD (AES-256-GCM).
// La clave de cifrado se deriva de JWT_SECRET (que ya vive solo en el .env del servidor),
// así que un respaldo de la BD por sí solo no revela las keys.
// Consecuencia: si se cambia JWT_SECRET hay que volver a capturar las keys en el admin.
// Formato guardado: base64(nonce[12] | tag[16] | cifrado).
public static class SecretoCifrado
{
    static byte[] Clave(string secreto) =>
        SHA256.HashData(Encoding.UTF8.GetBytes("netmon-apikey-v1|" + secreto));

    public static string Cifrar(string texto, string secreto)
    {
        var claro = Encoding.UTF8.GetBytes(texto);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var cifrado = new byte[claro.Length];
        using var aes = new AesGcm(Clave(secreto), 16);
        aes.Encrypt(nonce, claro, cifrado, tag);
        return Convert.ToBase64String([.. nonce, .. tag, .. cifrado]);
    }

    // null si no se puede descifrar (secreto distinto o dato alterado).
    public static string? Descifrar(string almacenado, string secreto)
    {
        try
        {
            var b = Convert.FromBase64String(almacenado);
            if (b.Length < 28) return null;
            var claro = new byte[b.Length - 28];
            using var aes = new AesGcm(Clave(secreto), 16);
            aes.Decrypt(b.AsSpan(0, 12), b.AsSpan(28), b.AsSpan(12, 16), claro);
            return Encoding.UTF8.GetString(claro);
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException) { return null; }
    }
}
