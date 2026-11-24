using System.Security.Claims;
using AunorApi.Data;
using AunorApi.DTOs;
using AunorApi.Models;
using AunorApi.Services;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Controllers;

// Bitácora de actividades de TI. Roles: "ti" y "admin" registran; solo "admin" administra catálogos.
[ApiController]
[Route("api/bitacora")]
[Authorize(Roles = "admin,ti")]
public class BitacoraController(AppDbContext db, AuditService audit) : ControllerBase
{
    int UsuarioId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
    bool EsAdmin  => User.IsInRole("admin");

    // ─────────────────────────── Lista / filtros ───────────────────────────
    IQueryable<BitRegistro> Filtrar(DateTime? desde, DateTime? hasta, int? sedeId, int? categoriaId, int? responsableId, string? q)
    {
        var r = db.BitRegistros.AsNoTracking().Where(x => !x.Eliminado && x.Tipo == 1);
        if (desde is { } d) r = r.Where(x => x.FechaActividad >= d.Date);
        if (hasta is { } h) r = r.Where(x => x.FechaActividad < h.Date.AddDays(1));
        if (sedeId is { } s) r = r.Where(x => x.Sedes.Any(rs => rs.SedeId == s));
        if (categoriaId is { } c) r = r.Where(x => x.CategoriaId == c);
        if (responsableId is { } p) r = r.Where(x => x.ResponsableId == p);
        if (!string.IsNullOrWhiteSpace(q)) { var t = q.Trim(); r = r.Where(x => x.Descripcion.Contains(t)); }
        return r;
    }

    object Proyectar(BitRegistro x, DateTime ahora) => new
    {
        x.Id, fecha = x.FechaActividad, x.Descripcion,
        x.CategoriaId, categoria = x.Categoria.Nombre,
        x.ResponsableId, responsable = x.Responsable.Nombre,
        x.ProveedorId, proveedor = x.Proveedor != null ? x.Proveedor.Nombre : null,
        x.Solicitante, x.DuracionMin, x.Estado, x.EquipoRef, fechaSolucion = x.FechaSolucion,
        sedes = x.Sedes.Select(s => new { id = s.SedeId, codigo = s.Sede.Codigo }).OrderBy(s => s.codigo),
        puedeEditar = BitacoraReglas.PuedeEditar(x.CreadoPorUsuarioId, x.CreadoEn, UsuarioId, EsAdmin, ahora),
    };

    // GET api/bitacora?desde=&hasta=&sedeId=&categoriaId=&responsableId=&q=&page=1&pageSize=20
    [HttpGet]
    public async Task<IActionResult> Lista(
        [FromQuery] DateTime? desde, [FromQuery] DateTime? hasta, [FromQuery] int? sedeId,
        [FromQuery] int? categoriaId, [FromQuery] int? responsableId, [FromQuery] string? q,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = Filtrar(desde, hasta, sedeId, categoriaId, responsableId, q);
        var total = await query.CountAsync();
        var filas = await query
            .Include(x => x.Categoria).Include(x => x.Responsable).Include(x => x.Proveedor)
            .Include(x => x.Sedes).ThenInclude(s => s.Sede)
            .OrderByDescending(x => x.FechaActividad).ThenByDescending(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var ahora = DateTime.Now;
        return Ok(new { total, page, pageSize, items = filas.Select(f => Proyectar(f, ahora)) });
    }

    // ─────────────────────────── Crear / editar / eliminar ───────────────────────────
    // Devuelve el error de validación (400) o null si todo es válido. Completa los valores por defecto.
    async Task<(IActionResult? Error, int CategoriaId, int ResponsableId, List<int> SedeIds)> Resolver(BitRegistroRequest r, DateTime ahora)
    {
        var errores = BitacoraReglas.Validar(new(r.Descripcion, r.SedeIds, r.Fecha, r.DuracionMin, r.Solicitante, r.EquipoRef, r.Estado, r.FechaSolucion), ahora);
        if (errores.Count > 0) return (BadRequest(new { error = errores[0], errores }), 0, 0, []);

        var sedeIds = r.SedeIds!.Distinct().ToList();
        var validas = await db.BitSedes.CountAsync(s => s.Activo && sedeIds.Contains(s.Id));
        if (validas != sedeIds.Count) return (BadRequest(new { error = "Hay sedes inválidas o inactivas" }), 0, 0, []);

        var categoriaId = r.CategoriaId
            ?? await db.BitCategorias.Where(c => c.Nombre == "Otro").Select(c => (int?)c.Id).FirstOrDefaultAsync()
            ?? 0;
        if (categoriaId == 0 || !await db.BitCategorias.AnyAsync(c => c.Id == categoriaId && c.Activo))
            return (BadRequest(new { error = "Categoría inválida o inactiva" }), 0, 0, []);

        var uid = UsuarioId;
        var responsableId = r.ResponsableId
            ?? await db.BitPersonas.Where(p => p.Activo && p.UsuarioSigmaId == uid).Select(p => (int?)p.Id).FirstOrDefaultAsync()
            ?? 0;
        if (responsableId == 0)
            return (BadRequest(new { error = "Elige el responsable (tu usuario aún no está enlazado a una persona)" }), 0, 0, []);
        if (!await db.BitPersonas.AnyAsync(p => p.Id == responsableId && p.Activo))
            return (BadRequest(new { error = "Responsable inválido o inactivo" }), 0, 0, []);

        if (r.ProveedorId is { } pv && !await db.BitProveedores.AnyAsync(p => p.Id == pv && p.Activo))
            return (BadRequest(new { error = "Proveedor inválido o inactivo" }), 0, 0, []);

        return (null, categoriaId, responsableId, sedeIds);
    }

    static string? Limpio(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    [HttpPost]
    public async Task<IActionResult> Crear([FromBody] BitRegistroRequest r)
    {
        var ahora = DateTime.Now;
        var (error, categoriaId, responsableId, sedeIds) = await Resolver(r, ahora);
        if (error is not null) return error;

        var reg = new BitRegistro
        {
            Tipo = 1,
            FechaActividad = BitacoraReglas.FechaPorDefecto(r.Fecha, ahora),
            Descripcion = r.Descripcion!.Trim(),
            CategoriaId = categoriaId, ResponsableId = responsableId,
            ProveedorId = r.ProveedorId, Solicitante = Limpio(r.Solicitante),
            DuracionMin = r.DuracionMin, Estado = BitacoraReglas.EstadoPorDefecto(r.Estado),
            EquipoRef = Limpio(r.EquipoRef),
            CreadoPorUsuarioId = UsuarioId, CreadoEn = ahora, ModificadoEn = ahora,
            Sedes = sedeIds.Select(id => new BitRegistroSede { SedeId = id }).ToList(),
        };
        reg.FechaSolucion = BitacoraReglas.FechaSolucionFinal(reg.Estado, r.FechaSolucion, reg.FechaActividad, null, null, ahora);
        db.BitRegistros.Add(reg);
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("BITACORA_CREADA", $"bitacora:{reg.Id}", reg.Descripcion);

        // "Van N hoy": el frontend muestra el contador desde el tercer registro del día
        var inicio = ahora.Date;
        var hoy = await db.BitRegistros.CountAsync(x => !x.Eliminado && x.CreadoPorUsuarioId == UsuarioId && x.CreadoEn >= inicio);
        return Created($"/api/bitacora/{reg.Id}", new { reg.Id, hoy });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Editar(int id, [FromBody] BitRegistroRequest r)
    {
        var reg = await db.BitRegistros.Include(x => x.Sedes).FirstOrDefaultAsync(x => x.Id == id && !x.Eliminado);
        if (reg is null) return NotFound();
        var ahora = DateTime.Now;
        if (!BitacoraReglas.PuedeEditar(reg.CreadoPorUsuarioId, reg.CreadoEn, UsuarioId, EsAdmin, ahora))
            return StatusCode(403, new { error = "Solo puedes editar tus registros hasta 7 días después" });

        var (error, categoriaId, responsableId, sedeIds) = await Resolver(r, ahora);
        if (error is not null) return error;

        reg.Descripcion = r.Descripcion!.Trim();
        reg.FechaActividad = BitacoraReglas.FechaPorDefecto(r.Fecha, reg.FechaActividad);
        reg.CategoriaId = categoriaId; reg.ResponsableId = responsableId;
        reg.ProveedorId = r.ProveedorId; reg.Solicitante = Limpio(r.Solicitante);
        reg.DuracionMin = r.DuracionMin;
        var estadoAnterior = reg.Estado;
        reg.Estado = BitacoraReglas.EstadoPorDefecto(r.Estado ?? reg.Estado);
        reg.FechaSolucion = BitacoraReglas.FechaSolucionFinal(reg.Estado, r.FechaSolucion, reg.FechaActividad, estadoAnterior, reg.FechaSolucion, ahora);
        reg.EquipoRef = Limpio(r.EquipoRef); reg.ModificadoEn = ahora;

        db.BitRegistroSedes.RemoveRange(reg.Sedes.Where(s => !sedeIds.Contains(s.SedeId)));
        foreach (var sid in sedeIds.Where(sid => reg.Sedes.All(s => s.SedeId != sid)))
            reg.Sedes.Add(new BitRegistroSede { SedeId = sid });
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("BITACORA_MODIFICADA", $"bitacora:{id}", reg.Descripcion);
        return Ok(new { reg.Id });
    }

    // POST api/bitacora/{id}/resolver { fecha? } — cierra una actividad "En proceso", aunque sea otro día.
    // Cualquier usuario de TI puede cerrarla (es un cambio de estado, queda en la auditoría).
    [HttpPost("{id:int}/resolver")]
    public async Task<IActionResult> Resolver(int id, [FromBody] BitResolverRequest? r)
    {
        var reg = await db.BitRegistros.FirstOrDefaultAsync(x => x.Id == id && !x.Eliminado);
        if (reg is null) return NotFound();
        var ahora = DateTime.Now;
        var fecha = r?.Fecha ?? ahora;
        if (fecha > ahora.AddMinutes(5)) return BadRequest(new { error = "La fecha de solución no puede ser futura" });
        if (fecha.Date < reg.FechaActividad.Date) return BadRequest(new { error = "La solución no puede ser anterior a la actividad" });
        reg.Estado = BitacoraReglas.EstadoHecho; reg.FechaSolucion = fecha; reg.ModificadoEn = ahora;
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("BITACORA_RESUELTA", $"bitacora:{id}", $"solución {fecha:yyyy-MM-dd HH:mm}");
        return Ok(new { reg.Id, fechaSolucion = reg.FechaSolucion });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id)
    {
        var reg = await db.BitRegistros.FirstOrDefaultAsync(x => x.Id == id && !x.Eliminado);
        if (reg is null) return NotFound();
        var ahora = DateTime.Now;
        if (!BitacoraReglas.PuedeEditar(reg.CreadoPorUsuarioId, reg.CreadoEn, UsuarioId, EsAdmin, ahora))
            return StatusCode(403, new { error = "Solo puedes eliminar tus registros hasta 7 días después" });
        reg.Eliminado = true; reg.ModificadoEn = ahora;      // borrado lógico
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("BITACORA_ELIMINADA", $"bitacora:{id}", reg.Descripcion);
        return NoContent();
    }

    // ─────────────────────────── Resumen / recientes / catálogos ───────────────────────────
    // GET api/bitacora/resumen — hoy y semana (lunes a domingo), horas y desglose
    [HttpGet("resumen")]
    public async Task<IActionResult> Resumen()
    {
        var ahora = DateTime.Now;
        var hoy = ahora.Date;
        var lunes = hoy.AddDays(-(((int)hoy.DayOfWeek + 6) % 7));
        var semana = await db.BitRegistros.AsNoTracking()
            .Where(x => !x.Eliminado && x.Tipo == 1 && x.FechaActividad >= lunes && x.FechaActividad < lunes.AddDays(7))
            .Select(x => new
            {
                x.FechaActividad, x.DuracionMin, categoria = x.Categoria.Nombre, responsable = x.Responsable.Nombre,
                sedes = x.Sedes.Select(s => s.Sede.Codigo).ToList(),
            }).ToListAsync();

        static object[] Desglose(IEnumerable<string> claves) =>
            claves.GroupBy(k => k).OrderByDescending(g => g.Count()).ThenBy(g => g.Key)
                  .Select(g => (object)new { nombre = g.Key, total = g.Count() }).ToArray();

        var minutos = semana.Sum(x => x.DuracionMin ?? 0);
        return Ok(new
        {
            hoy = semana.Count(x => x.FechaActividad.Date == hoy),
            semana = semana.Count,
            minutosSemana = minutos,
            horasSemana = Math.Round(minutos / 60.0, 1),
            porSede = Desglose(semana.SelectMany(x => x.sedes)),
            porCategoria = Desglose(semana.Select(x => x.categoria)),
            porResponsable = Desglose(semana.Select(x => x.responsable)),
        });
    }

    // GET api/bitacora/recientes — últimas 3 descripciones distintas del usuario (botón "repetir")
    [HttpGet("recientes")]
    public async Task<IActionResult> Recientes()
    {
        var uid = UsuarioId;
        var filas = await db.BitRegistros.AsNoTracking()
            .Where(x => !x.Eliminado && x.Tipo == 1 && x.CreadoPorUsuarioId == uid)
            .OrderByDescending(x => x.CreadoEn).Take(60)
            .Select(x => new
            {
                x.Descripcion, x.CategoriaId, categoria = x.Categoria.Nombre, x.DuracionMin,
                sedeIds = x.Sedes.Select(s => s.SedeId).ToList(),
            }).ToListAsync();
        return Ok(filas.GroupBy(f => f.Descripcion).Select(g => g.First()).Take(3));
    }

    // GET api/bitacora/catalogos — todo lo activo en una sola llamada (incluye palabras clave)
    [HttpGet("catalogos")]
    public async Task<IActionResult> Catalogos()
    {
        var uid = UsuarioId;
        return Ok(new
        {
            sedes = await db.BitSedes.AsNoTracking().Where(x => x.Activo).OrderBy(x => x.Id).Select(x => new { x.Id, x.Codigo, x.Nombre, x.Tipo }).ToListAsync(),
            categorias = await db.BitCategorias.AsNoTracking().Where(x => x.Activo).OrderBy(x => x.Nombre).Select(x => new { x.Id, x.Nombre, x.Segmento, x.AplicaSla }).ToListAsync(),
            proveedores = await db.BitProveedores.AsNoTracking().Where(x => x.Activo).OrderBy(x => x.Nombre).Select(x => new { x.Id, x.Nombre }).ToListAsync(),
            personal = await db.BitPersonas.AsNoTracking().Where(x => x.Activo).OrderBy(x => x.Nombre).Select(x => new { x.Id, x.Nombre, x.SedeBase }).ToListAsync(),
            palabrasClave = await db.BitPalabrasClave.AsNoTracking().Where(x => x.Activo).Select(x => new { x.Id, x.Palabra, x.SedeId, x.CategoriaId }).ToListAsync(),
            miPersonalId = await db.BitPersonas.AsNoTracking().Where(x => x.Activo && x.UsuarioSigmaId == uid).Select(x => (int?)x.Id).FirstOrDefaultAsync(),
        });
    }

    // ─────────────────────────── Exportar a Excel ───────────────────────────
    [HttpGet("exportar")]
    public async Task<IActionResult> Exportar(
        [FromQuery] DateTime? desde, [FromQuery] DateTime? hasta, [FromQuery] int? sedeId,
        [FromQuery] int? categoriaId, [FromQuery] int? responsableId, [FromQuery] string? q)
    {
        var filas = await Filtrar(desde, hasta, sedeId, categoriaId, responsableId, q)
            .Include(x => x.Categoria).Include(x => x.Responsable).Include(x => x.Proveedor)
            .Include(x => x.Sedes).ThenInclude(s => s.Sede)
            .OrderByDescending(x => x.FechaActividad).ThenByDescending(x => x.Id)
            .Take(20000).ToListAsync();

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Bitácora");
        string[] cab = ["Fecha", "Sedes", "Categoría", "Descripción", "Responsable", "Proveedor", "Solicitante", "Duración (min)", "Estado", "Fecha solución"];
        for (var i = 0; i < cab.Length; i++) ws.Cell(1, i + 1).Value = cab[i];
        var head = ws.Range(1, 1, 1, cab.Length);
        head.Style.Font.Bold = true; head.Style.Fill.BackgroundColor = XLColor.FromHtml("#1F4E5F"); head.Style.Font.FontColor = XLColor.White;

        for (var i = 0; i < filas.Count; i++)
        {
            var f = filas[i]; var row = i + 2;
            ws.Cell(row, 1).Value = f.FechaActividad; ws.Cell(row, 1).Style.DateFormat.Format = "dd/MM/yyyy HH:mm";
            ws.Cell(row, 2).Value = string.Join(", ", f.Sedes.Select(s => s.Sede.Codigo).OrderBy(c => c));
            ws.Cell(row, 3).Value = f.Categoria.Nombre;
            ws.Cell(row, 4).Value = f.Descripcion;
            ws.Cell(row, 5).Value = f.Responsable.Nombre;
            ws.Cell(row, 6).Value = f.Proveedor?.Nombre ?? "";
            ws.Cell(row, 7).Value = f.Solicitante ?? "";
            if (f.DuracionMin is { } d) ws.Cell(row, 8).Value = d;
            ws.Cell(row, 9).Value = f.Estado == BitacoraReglas.EstadoEnProceso ? "En proceso" : "Hecho";
            if (f.FechaSolucion is { } fs) { ws.Cell(row, 10).Value = fs; ws.Cell(row, 10).Style.DateFormat.Format = "dd/MM/yyyy"; }
        }
        ws.SheetView.FreezeRows(1);
        ws.Columns().AdjustToContents(1, 1, 60);
        ws.Column(4).Width = 70; ws.Column(4).Style.Alignment.WrapText = true;

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        await audit.RegistrarAsync("BITACORA_EXPORTADA", null, $"{filas.Count} registros");
        return File(ms.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"bitacora_{DateTime.Now:yyyyMMdd_HHmm}.xlsx");
    }

    // ─────────────────────────── Comentarios ───────────────────────────
    [HttpGet("{id:int}/comentarios")]
    public async Task<IActionResult> Comentarios(int id)
    {
        if (!await db.BitRegistros.AnyAsync(x => x.Id == id && !x.Eliminado)) return NotFound();
        var usuarios = db.Usuarios.AsNoTracking();
        var lista = await db.BitComentarios.AsNoTracking().Where(c => c.RegistroId == id).OrderBy(c => c.Fecha)
            .Select(c => new { c.Id, c.Texto, c.Fecha, c.UsuarioId, usuario = usuarios.Where(u => u.Id == c.UsuarioId).Select(u => u.Nombre ?? u.Username).FirstOrDefault() })
            .ToListAsync();
        return Ok(lista);
    }

    [HttpPost("{id:int}/comentarios")]
    public async Task<IActionResult> Comentar(int id, [FromBody] BitComentarioRequest r)
    {
        var texto = r.Texto?.Trim() ?? "";
        if (texto.Length == 0) return BadRequest(new { error = "Escribe el comentario" });
        if (texto.Length > 1000) return BadRequest(new { error = "El comentario admite hasta 1000 caracteres" });
        if (!await db.BitRegistros.AnyAsync(x => x.Id == id && !x.Eliminado)) return NotFound();
        var c = new BitComentario { RegistroId = id, Texto = texto, UsuarioId = UsuarioId, Fecha = DateTime.Now };
        db.BitComentarios.Add(c);
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("BITACORA_COMENTARIO", $"bitacora:{id}", texto);
        return Created($"/api/bitacora/{id}/comentarios", new { c.Id });
    }

    // ─────────────────────────── Administración de catálogos (solo admin) ───────────────────────────
    // catalogo: sedes | categorias | proveedores | personal | palabras-clave. Nunca se borra: DELETE desactiva.
    [HttpGet("admin/{catalogo}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AdminLista(string catalogo) => catalogo switch
    {
        "sedes"          => Ok(await db.BitSedes.AsNoTracking().OrderBy(x => x.Id).ToListAsync()),
        "categorias"     => Ok(await db.BitCategorias.AsNoTracking().OrderBy(x => x.Nombre).ToListAsync()),
        "proveedores"    => Ok(await db.BitProveedores.AsNoTracking().OrderBy(x => x.Nombre).ToListAsync()),
        "personal"       => Ok(await db.BitPersonas.AsNoTracking().OrderBy(x => x.Nombre).ToListAsync()),
        "palabras-clave" => Ok(await db.BitPalabrasClave.AsNoTracking().OrderBy(x => x.Palabra).ToListAsync()),
        _ => NotFound(new { error = "Catálogo desconocido" }),
    };

    [HttpPost("admin/{catalogo}")]
    [Authorize(Roles = "admin")]
    public Task<IActionResult> AdminCrear(string catalogo, [FromBody] BitCatalogoRequest r) => Guardar(catalogo, null, r);

    [HttpPut("admin/{catalogo}/{id:int}")]
    [Authorize(Roles = "admin")]
    public Task<IActionResult> AdminEditar(string catalogo, int id, [FromBody] BitCatalogoRequest r) => Guardar(catalogo, id, r);

    [HttpDelete("admin/{catalogo}/{id:int}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> AdminDesactivar(string catalogo, int id)
    {
        object? e = catalogo switch
        {
            "sedes" => await db.BitSedes.FindAsync(id),
            "categorias" => await db.BitCategorias.FindAsync(id),
            "proveedores" => await db.BitProveedores.FindAsync(id),
            "personal" => await db.BitPersonas.FindAsync(id),
            "palabras-clave" => await db.BitPalabrasClave.FindAsync(id),
            _ => null,
        };
        if (e is null) return NotFound();
        switch (e)
        {
            case BitSede x: x.Activo = false; break;
            case BitCategoria x: x.Activo = false; break;
            case BitProveedor x: x.Activo = false; break;
            case BitPersonal x: x.Activo = false; break;
            case BitPalabraClave x: x.Activo = false; break;
        }
        await db.SaveChangesAsync();
        await audit.RegistrarAsync("BITACORA_CATALOGO_DESACTIVADO", $"{catalogo}:{id}");
        return NoContent();
    }

    async Task<IActionResult> Guardar(string catalogo, int? id, BitCatalogoRequest r)
    {
        IActionResult Bad(string m) => BadRequest(new { error = m });
        var nombre = r.Nombre?.Trim() ?? "";
        object entidad;

        switch (catalogo)
        {
            case "sedes":
            {
                var codigo = r.Codigo?.Trim().ToUpperInvariant() ?? "";
                if (codigo.Length is 0 or > 10) return Bad("El código es obligatorio (máx. 10)");
                if (nombre.Length is 0 or > 100) return Bad("El nombre es obligatorio (máx. 100)");
                if (r.Tipo is not (null or "Oficina" or "Peaje")) return Bad("Tipo inválido");
                if (await db.BitSedes.AnyAsync(x => x.Codigo == codigo && x.Id != id)) return Bad("Ya existe una sede con ese código");
                var ent = id is null ? new BitSede() : await db.BitSedes.FindAsync(id);
                if (ent is null) return NotFound();
                ent.Codigo = codigo; ent.Nombre = nombre; ent.Tipo = r.Tipo ?? ent.Tipo; ent.Activo = r.Activo ?? ent.Activo;
                if (id is null) db.BitSedes.Add(ent);
                entidad = ent; break;
            }
            case "categorias":
            {
                if (nombre.Length is 0 or > 100) return Bad("El nombre es obligatorio (máx. 100)");
                if (r.Segmento is not (null or "S. Operación" or "S. Información")) return Bad("Segmento inválido");
                if (await db.BitCategorias.AnyAsync(x => x.Nombre == nombre && x.Id != id)) return Bad("Ya existe esa categoría");
                var ent = id is null ? new BitCategoria() : await db.BitCategorias.FindAsync(id);
                if (ent is null) return NotFound();
                ent.Nombre = nombre; ent.Segmento = r.Segmento ?? ent.Segmento; ent.AplicaSla = r.AplicaSla; ent.Activo = r.Activo ?? ent.Activo;
                if (id is null) db.BitCategorias.Add(ent);
                entidad = ent; break;
            }
            case "proveedores":
            {
                if (nombre.Length is 0 or > 100) return Bad("El nombre es obligatorio (máx. 100)");
                if (await db.BitProveedores.AnyAsync(x => x.Nombre == nombre && x.Id != id)) return Bad("Ya existe ese proveedor");
                var ent = id is null ? new BitProveedor() : await db.BitProveedores.FindAsync(id);
                if (ent is null) return NotFound();
                ent.Nombre = nombre; ent.Activo = r.Activo ?? ent.Activo;
                if (id is null) db.BitProveedores.Add(ent);
                entidad = ent; break;
            }
            case "personal":
            {
                if (nombre.Length is 0 or > 100) return Bad("El nombre es obligatorio (máx. 100)");
                if (r.UsuarioSigmaId is { } u)
                {
                    if (!await db.Usuarios.AnyAsync(x => x.Id == u)) return Bad("El usuario de Sigma no existe");
                    if (await db.BitPersonas.AnyAsync(x => x.UsuarioSigmaId == u && x.Id != id)) return Bad("Ese usuario ya está enlazado a otra persona");
                }
                var ent = id is null ? new BitPersonal() : await db.BitPersonas.FindAsync(id);
                if (ent is null) return NotFound();
                ent.Nombre = nombre; ent.SedeBase = Limpio(r.SedeBase); ent.UsuarioSigmaId = r.UsuarioSigmaId; ent.Activo = r.Activo ?? ent.Activo;
                if (id is null) db.BitPersonas.Add(ent);
                entidad = ent; break;
            }
            case "palabras-clave":
            {
                var palabra = BitacoraReglas.Normalizar(r.Palabra);
                if (palabra.Length is 0 or > 60) return Bad("La palabra es obligatoria (máx. 60)");
                if (r.SedeId is null && r.CategoriaId is null) return Bad("Asocia la palabra a una sede o a una categoría");
                if (r.SedeId is { } s && !await db.BitSedes.AnyAsync(x => x.Id == s)) return Bad("Sede inválida");
                if (r.CategoriaId is { } c && !await db.BitCategorias.AnyAsync(x => x.Id == c)) return Bad("Categoría inválida");
                var ent = id is null ? new BitPalabraClave() : await db.BitPalabrasClave.FindAsync(id);
                if (ent is null) return NotFound();
                ent.Palabra = palabra; ent.SedeId = r.SedeId; ent.CategoriaId = r.CategoriaId; ent.Activo = r.Activo ?? ent.Activo;
                if (id is null) db.BitPalabrasClave.Add(ent);
                entidad = ent; break;
            }
            default: return NotFound(new { error = "Catálogo desconocido" });
        }
        await db.SaveChangesAsync();
        await audit.RegistrarAsync(id is null ? "BITACORA_CATALOGO_CREADO" : "BITACORA_CATALOGO_MODIFICADO", $"{catalogo}:{id}", nombre.Length > 0 ? nombre : r.Palabra);
        return id is null ? Created($"/api/bitacora/admin/{catalogo}", entidad) : Ok(entidad);
    }
}
