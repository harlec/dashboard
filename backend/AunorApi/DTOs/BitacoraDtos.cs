namespace AunorApi.DTOs;

public record BitRegistroRequest(
    string? Descripcion, List<int>? SedeIds, DateTime? Fecha, int? CategoriaId, int? ResponsableId,
    int? ProveedorId, string? Solicitante, int? DuracionMin, byte? Estado, string? EquipoRef);

public record BitComentarioRequest(string? Texto);

// Cuerpo único para el CRUD de catálogos; cada catálogo usa solo los campos que le aplican.
public record BitCatalogoRequest(
    string? Codigo, string? Nombre, string? Tipo, string? Segmento, bool? AplicaSla,
    string? SedeBase, int? UsuarioSigmaId, string? Palabra, int? SedeId, int? CategoriaId, bool? Activo);
