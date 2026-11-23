namespace AunorApi.Services;

public static class PasswordPolicy
{
    public const int LongitudMinima = 12;

    // null = válida; si no, el motivo para mostrar al usuario
    public static string? Validar(string? password, string? username = null)
    {
        if (string.IsNullOrEmpty(password) || password.Length < LongitudMinima)
            return $"La contraseña debe tener al menos {LongitudMinima} caracteres";
        if (password.Length > 72)   // bcrypt ignora lo que pase de 72 bytes
            return "La contraseña no puede exceder 72 caracteres";
        if (!password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit))
            return "La contraseña debe incluir mayúsculas, minúsculas y números";
        if (!string.IsNullOrWhiteSpace(username) && password.Contains(username, StringComparison.OrdinalIgnoreCase))
            return "La contraseña no puede contener el nombre de usuario";
        return null;
    }
}
