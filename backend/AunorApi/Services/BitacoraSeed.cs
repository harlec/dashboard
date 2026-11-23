using AunorApi.Data;
using AunorApi.Models;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Services;

// Datos iniciales de la Bitácora (hoja "Constantes" del Excel "Registro-Incidencias").
// Idempotente: solo inserta lo que falta, nunca pisa lo que el admin ya editó.
// Requiere que sqlserver/migration_bitacora.sql ya haya creado las tablas.
public static class BitacoraSeed
{
    static readonly (string Codigo, string Nombre, string Tipo)[] Sedes =
    [
        ("LIM", "Lima", "Oficina"), ("NCH", "Nuevo Chimbote", "Oficina"), ("FOR", "Fortaleza", "Peaje"),
        ("HUA", "Huarmey", "Peaje"), ("402", "KM 402", "Peaje"), ("SAN", "Santa", "Peaje"), ("VIR", "Virú", "Peaje"),
    ];

    static readonly string[] Proveedores =
        ["Aleatica", "Aunor", "Izipay", "Telectrónica", "EMSEMSA", "Hidrandina", "Entel", "Dell", "Niubiz", "Kashio"];

    static readonly (string Nombre, string Sede)[] Personal =
    [
        ("García Garay Oscar", "Lima"), ("Romero Santos Hugo", "Nvo. Chimbote"), ("García Villar Carlos", "Nvo. Chimbote"),
        ("Farroñan Flores Roberto", "Nvo. Chimbote"), ("Castro Mena Denis", "Nvo. Chimbote"),
        ("Del Rio Ortiz Jhonathan", "Nvo. Chimbote"), ("Paz Puerta Arturo", "Nvo. Chimbote"),
        ("Rodriguez Romero Roger", "Lima"), ("Polo Requena Juan Carlos", "Nvo. Chimbote"),
    ];

    const string Op = "S. Operación", Info = "S. Información";

    // Los nombres truncados en el Excel (Soporte Usuario Ap…, M…, Pe…) NO se inventan: el admin los
    // agrega desde Administración de catálogos. Los dos de Soporte Usuario que sí se vieron completos
    // en la hoja de registros (MS365 y Notebook) están incluidos.
    static readonly (string Nombre, string Segmento, bool? Sla)[] Categorias =
    [
        ("Facturación Electrónica", Op, true), ("Izipay", Op, true), ("Luminarias", Op, null), ("Niubiz", Op, true),
        ("Página Web", Op, null), ("PMV", Op, false), ("Poste SOS", Op, null), ("Radares de Velocidad", Op, null),
        ("Redes Internet", Op, true), ("Redes MPLS", Op, true), ("Redes Starlink", Op, true), ("Sistema de Peajes", Op, true),
        ("Soporte Usuario MS365", Info, null), ("Soporte General", Info, true), ("Soporte Usuario Notebook", Info, true),
        ("Telefonía Fija", Info, null), ("UPS", Op, null), ("Otro", Op, true), ("Vías", Op, false), ("Kashio", Op, true),
    ];

    // palabra → (código de sede, nombre de categoría)
    static readonly (string Palabra, string? Sede, string? Categoria)[] Palabras =
    [
        ("santa", "SAN", null), ("san", "SAN", null), ("viru", "VIR", null), ("vir", "VIR", null),
        ("huarmey", "HUA", null), ("hua", "HUA", null), ("fortaleza", "FOR", null), ("for", "FOR", null),
        ("402", "402", null), ("vesique", "402", null), ("km402", "402", null),
        ("chimbote", "NCH", null), ("nch", "NCH", null), ("lima", "LIM", null),
        ("disco", null, "Sistema de Peajes"), ("espacio", null, "Sistema de Peajes"), ("via", null, "Sistema de Peajes"),
        ("tcptoll", null, "Sistema de Peajes"), ("ocr", null, "Sistema de Peajes"), ("placa", null, "Sistema de Peajes"),
        ("clave", null, "Sistema de Peajes"), ("pos", null, "Sistema de Peajes"), ("turno", null, "Sistema de Peajes"),
        ("anexo", null, "Telefonía Fija"), ("telefono", null, "Telefonía Fija"),
        ("internet", null, "Redes Internet"), ("starlink", null, "Redes Starlink"), ("mpls", null, "Redes MPLS"),
        ("switch", null, "Redes MPLS"), ("firewall", null, "Redes MPLS"), ("vpn", null, "Redes Internet"),
        ("notebook", null, "Soporte Usuario Notebook"), ("usuario", null, "Soporte Usuario Notebook"),
        ("impresora", null, "Soporte Usuario Notebook"), ("cuenta", null, "Soporte Usuario Notebook"),
        ("correo", null, "Soporte Usuario MS365"),
        ("niubiz", null, "Niubiz"), ("pinpad", null, "Niubiz"), ("kashio", null, "Kashio"),
    ];

    public static async Task AplicarAsync(AppDbContext db)
    {
        foreach (var (cod, nom, tipo) in Sedes)
            if (!await db.BitSedes.AnyAsync(s => s.Codigo == cod))
                db.BitSedes.Add(new BitSede { Codigo = cod, Nombre = nom, Tipo = tipo });
        foreach (var n in Proveedores)
            if (!await db.BitProveedores.AnyAsync(p => p.Nombre == n))
                db.BitProveedores.Add(new BitProveedor { Nombre = n });
        foreach (var (n, sede) in Personal)
            if (!await db.BitPersonas.AnyAsync(p => p.Nombre == n))
                db.BitPersonas.Add(new BitPersonal { Nombre = n, SedeBase = sede });
        foreach (var (n, seg, sla) in Categorias)
            if (!await db.BitCategorias.AnyAsync(c => c.Nombre == n))
                db.BitCategorias.Add(new BitCategoria { Nombre = n, Segmento = seg, AplicaSla = sla });
        await db.SaveChangesAsync();

        // Palabras clave: solo si la tabla está vacía (el admin las mantiene después desde pantalla)
        if (!await db.BitPalabrasClave.AnyAsync())
        {
            var sedes = await db.BitSedes.ToDictionaryAsync(s => s.Codigo, s => s.Id);
            var cats  = await db.BitCategorias.ToDictionaryAsync(c => c.Nombre, c => c.Id);
            foreach (var (pal, sede, cat) in Palabras)
                db.BitPalabrasClave.Add(new BitPalabraClave
                {
                    Palabra = pal,
                    SedeId = sede is null ? null : sedes[sede],
                    CategoriaId = cat is null ? null : cats[cat],
                });
            await db.SaveChangesAsync();
        }
    }
}
