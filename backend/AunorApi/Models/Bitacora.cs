namespace AunorApi.Models;

// Módulo Bitácora (registro de actividades de TI). Tablas con prefijo Bit y columnas PascalCase.
// Los catálogos nunca se borran: se desactivan (Activo = false) para no romper registros viejos.

public class BitSede
{
    public int    Id     { get; set; }
    public string Codigo { get; set; } = "";     // LIM, NCH, FOR, HUA, 402, SAN, VIR
    public string Nombre { get; set; } = "";
    public string Tipo   { get; set; } = "Peaje"; // "Oficina" | "Peaje"
    public bool   Activo { get; set; } = true;
}

public class BitCategoria
{
    public int    Id        { get; set; }
    public string Nombre    { get; set; } = "";
    public string Segmento  { get; set; } = "S. Operación";   // "S. Operación" | "S. Información"
    public bool?  AplicaSla { get; set; }                      // informativo; null = sin definir
    public bool   Activo    { get; set; } = true;
}

public class BitProveedor
{
    public int    Id     { get; set; }
    public string Nombre { get; set; } = "";
    public bool   Activo { get; set; } = true;
}

public class BitPersonal
{
    public int    Id             { get; set; }
    public string Nombre         { get; set; } = "";
    public string? SedeBase      { get; set; }
    public int?   UsuarioSigmaId { get; set; }   // enlace opcional con usuarios.id (propone el responsable)
    public bool   Activo         { get; set; } = true;
}

public class BitPalabraClave
{
    public int    Id          { get; set; }
    public string Palabra     { get; set; } = "";   // minúsculas, sin tildes
    public int?   SedeId      { get; set; }
    public int?   CategoriaId { get; set; }
    public bool   Activo      { get; set; } = true;
}

public class BitRegistro
{
    public int      Id              { get; set; }
    public byte     Tipo            { get; set; } = 1;   // 1 = Actividad; 2 = Ticket (reservado, sin uso)
    public DateTime FechaActividad  { get; set; }
    public string   Descripcion     { get; set; } = "";
    public int      CategoriaId     { get; set; }
    public int      ResponsableId   { get; set; }
    public int?     ProveedorId     { get; set; }
    public string?  Solicitante     { get; set; }
    public int?     DuracionMin     { get; set; }
    public byte     Estado          { get; set; } = 1;   // 1 = Hecho; 2 = En proceso; resto reservado
    public string?  EquipoRef       { get; set; }
    public int      CreadoPorUsuarioId { get; set; }
    public DateTime CreadoEn        { get; set; }
    public DateTime ModificadoEn    { get; set; }
    public bool     Eliminado       { get; set; }

    public BitCategoria Categoria   { get; set; } = null!;
    public BitPersonal  Responsable { get; set; } = null!;
    public BitProveedor? Proveedor  { get; set; }
    public List<BitRegistroSede> Sedes { get; set; } = [];
}

public class BitRegistroSede
{
    public int RegistroId { get; set; }
    public int SedeId     { get; set; }
    public BitRegistro Registro { get; set; } = null!;
    public BitSede     Sede     { get; set; } = null!;
}

public class BitComentario
{
    public int      Id         { get; set; }
    public int      RegistroId { get; set; }
    public string   Texto      { get; set; } = "";
    public int      UsuarioId  { get; set; }
    public DateTime Fecha      { get; set; }
}
