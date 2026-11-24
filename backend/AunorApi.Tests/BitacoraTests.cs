using System.Security.Claims;
using AunorApi.Controllers;
using AunorApi.Data;
using AunorApi.DTOs;
using AunorApi.Models;
using AunorApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using static AunorApi.Services.BitacoraReglas;

namespace AunorApi.Tests;

// ── Detección automática de sede y categoría ───────────────────────────────
public class BitacoraDeteccionTests
{
    const int SAN = 1, VIR = 2, PEAJES = 10, TELEFONIA = 11;

    static readonly Palabra[] Palabras =
    [
        new("santa", SAN, null), new("san", SAN, null), new("viru", VIR, null),
        new("disco", null, PEAJES), new("via", null, PEAJES), new("ocr", null, PEAJES),
        new("anexo", null, TELEFONIA),
    ];

    [Fact]
    public void Disco_lleno_en_via_803_de_santa_detecta_SAN_y_Sistema_de_Peajes()
    {
        var d = Detectar("disco lleno en via 803 de santa", Palabras);
        Assert.Equal(new[] { SAN }, d.SedeIds);
        Assert.Equal(PEAJES, d.CategoriaId);
    }

    [Fact]
    public void Despliegue_de_anexos_en_todas_las_plazas_no_marca_sedes()
    {
        var d = Detectar("despliegue de anexos en todas las plazas", Palabras);
        Assert.Empty(d.SedeIds);
        Assert.Equal(TELEFONIA, d.CategoriaId);   // el plural "anexos" sí detecta la categoría
    }

    [Fact]
    public void Ignora_tildes_y_mayusculas()
    {
        var d = Detectar("DISCO lleno en VÍA 803 de Virú", Palabras);
        Assert.Equal(new[] { VIR }, d.SedeIds);
        Assert.Equal(PEAJES, d.CategoriaId);
    }

    [Fact]
    public void No_confunde_palabras_parciales()
    {
        // "santander" contiene "san", "viaje" contiene "via": no son coincidencias de palabra completa
        var d = Detectar("viaje a santander", Palabras);
        Assert.Empty(d.SedeIds);
        Assert.Null(d.CategoriaId);
    }

    [Fact]
    public void Texto_vacio_no_detecta_nada()
    {
        var d = Detectar("   ", Palabras);
        Assert.Empty(d.SedeIds);
        Assert.Null(d.CategoriaId);
    }

    [Fact]
    public void Gana_la_categoria_con_mas_coincidencias()
    {
        var d = Detectar("anexo caido, disco y ocr en via", Palabras);
        Assert.Equal(PEAJES, d.CategoriaId);
    }
}

// ── Reglas: valores por defecto, validaciones y permisos ───────────────────
public class BitacoraReglasTests
{
    static readonly DateTime Ahora = new(2026, 11, 23, 10, 0, 0);

    static Entrada Ok() => new("Disco lleno en vía 803", [1], null, null, null, null, null);

    [Fact] public void Entrada_minima_es_valida() => Assert.Empty(Validar(Ok(), Ahora));

    [Fact]
    public void Descripcion_y_sede_son_los_unicos_obligatorios()
    {
        var e = Validar(Ok() with { Descripcion = "  ", SedeIds = [] }, Ahora);
        Assert.Contains("Escribe qué se hizo", e);
        Assert.Contains("Elige al menos una sede", e);
    }

    [Fact] public void Descripcion_larga_se_rechaza() =>
        Assert.NotEmpty(Validar(Ok() with { Descripcion = new string('x', MaxDescripcion + 1) }, Ahora));

    [Fact] public void Fecha_futura_se_rechaza() =>
        Assert.Contains("La fecha no puede ser futura", Validar(Ok() with { Fecha = Ahora.AddDays(1) }, Ahora));

    [Fact] public void Fecha_de_ayer_es_valida() =>
        Assert.Empty(Validar(Ok() with { Fecha = Ahora.AddDays(-1) }, Ahora));

    [Theory]
    [InlineData(-1)]
    [InlineData(MaxDuracionMin + 1)]
    public void Duracion_fuera_de_rango_se_rechaza(int min) =>
        Assert.NotEmpty(Validar(Ok() with { DuracionMin = min }, Ahora));

    [Fact] public void Solicitante_largo_se_rechaza() =>
        Assert.NotEmpty(Validar(Ok() with { Solicitante = new string('x', MaxTexto + 1) }, Ahora));

    [Fact] public void Estado_desconocido_se_rechaza() =>
        Assert.NotEmpty(Validar(Ok() with { Estado = 9 }, Ahora));

    [Fact]
    public void Valores_por_defecto_fecha_ahora_y_estado_hecho()
    {
        Assert.Equal(Ahora, FechaPorDefecto(null, Ahora));
        Assert.Equal(Ahora.AddDays(-1), FechaPorDefecto(Ahora.AddDays(-1), Ahora));
        Assert.Equal(EstadoHecho, EstadoPorDefecto(null));
        Assert.Equal(EstadoEnProceso, EstadoPorDefecto(EstadoEnProceso));
    }

    [Fact] public void Autor_edita_lo_suyo_dentro_de_7_dias() =>
        Assert.True(PuedeEditar(5, Ahora.AddDays(-6), 5, false, Ahora));

    [Fact] public void Autor_no_edita_pasados_7_dias() =>
        Assert.False(PuedeEditar(5, Ahora.AddDays(-8), 5, false, Ahora));

    [Fact] public void Otro_usuario_no_edita_lo_ajeno() =>
        Assert.False(PuedeEditar(5, Ahora, 6, false, Ahora));

    [Fact] public void Admin_edita_cualquiera_aunque_sea_viejo() =>
        Assert.True(PuedeEditar(5, Ahora.AddDays(-90), 99, true, Ahora));
}

// ── Integración: crear, listar con filtros, editar y eliminar (borrado lógico) ──
public class BitacoraIntegracionTests
{
    const int UsuarioTi = 7, UsuarioOtro = 8, UsuarioAdmin = 1;

    static AppDbContext NuevaDb(string nombre)
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(nombre).Options);
        db.BitSedes.AddRange(new BitSede { Id = 1, Codigo = "SAN", Nombre = "Santa" }, new BitSede { Id = 2, Codigo = "VIR", Nombre = "Virú" });
        db.BitCategorias.AddRange(new BitCategoria { Id = 1, Nombre = "Sistema de Peajes" }, new BitCategoria { Id = 2, Nombre = "Otro" });
        db.BitPersonas.Add(new BitPersonal { Id = 1, Nombre = "Romero Santos Hugo", UsuarioSigmaId = UsuarioTi });
        db.BitProveedores.Add(new BitProveedor { Id = 1, Nombre = "Aunor" });
        db.SaveChanges();
        return db;
    }

    static BitacoraController Ctrl(AppDbContext db, int usuarioId, string rol = "ti")
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, usuarioId.ToString()), new Claim(ClaimTypes.Name, "u" + usuarioId), new Claim(ClaimTypes.Role, rol)],
            "test"));
        var ctx = new DefaultHttpContext { User = user };
        var audit = new AuditService(db, new HttpContextAccessor { HttpContext = ctx }, NullLogger<AuditService>.Instance);
        return new BitacoraController(db, audit) { ControllerContext = new ControllerContext { HttpContext = ctx } };
    }

    static BitRegistroRequest Req(string desc = "Disco lleno en vía 803", params int[] sedes) =>
        new(desc, sedes.Length == 0 ? [1] : [.. sedes], null, null, null, null, null, null, null, null);

    [Fact]
    public async Task Crear_completa_los_valores_por_defecto()
    {
        var db = NuevaDb(nameof(Crear_completa_los_valores_por_defecto));
        var r = await Ctrl(db, UsuarioTi).Crear(Req());

        Assert.IsType<CreatedResult>(r);
        var reg = db.BitRegistros.Include(x => x.Sedes).Single();
        Assert.Equal(2, reg.CategoriaId);                // "Otro" por defecto
        Assert.Equal(1, reg.ResponsableId);              // persona enlazada al usuario
        Assert.Equal(EstadoHecho, reg.Estado);
        Assert.Equal(1, reg.Tipo);
        Assert.Equal(UsuarioTi, reg.CreadoPorUsuarioId);
        Assert.Single(reg.Sedes);
        Assert.True(Math.Abs((reg.FechaActividad - DateTime.Now).TotalMinutes) < 2);
    }

    [Fact]
    public async Task Crear_sin_descripcion_o_sin_sede_devuelve_400_y_no_guarda()
    {
        var db = NuevaDb(nameof(Crear_sin_descripcion_o_sin_sede_devuelve_400_y_no_guarda));
        var c = Ctrl(db, UsuarioTi);
        Assert.IsType<BadRequestObjectResult>(await c.Crear(Req("  ")));
        Assert.IsType<BadRequestObjectResult>(await c.Crear(new BitRegistroRequest("algo", [], null, null, null, null, null, null, null, null)));
        Assert.IsType<BadRequestObjectResult>(await c.Crear(new BitRegistroRequest("algo", [99], null, null, null, null, null, null, null, null)));  // sede inexistente
        Assert.Empty(db.BitRegistros);
    }

    [Fact]
    public async Task Usuario_sin_persona_enlazada_debe_elegir_responsable()
    {
        var db = NuevaDb(nameof(Usuario_sin_persona_enlazada_debe_elegir_responsable));
        Assert.IsType<BadRequestObjectResult>(await Ctrl(db, UsuarioOtro).Crear(Req()));
        var conResp = Req() with { ResponsableId = 1 };
        Assert.IsType<CreatedResult>(await Ctrl(db, UsuarioOtro).Crear(conResp));
    }

    [Fact]
    public async Task Lista_filtra_por_sede_categoria_y_texto()
    {
        var db = NuevaDb(nameof(Lista_filtra_por_sede_categoria_y_texto));
        var c = Ctrl(db, UsuarioTi);
        await c.Crear(Req("Disco lleno en vía 803", 1) with { CategoriaId = 1 });
        await c.Crear(Req("Cambio de clave", 2));
        await c.Crear(Req("Revisión general", 1, 2));

        static int Total(IActionResult r) => (int)((OkObjectResult)r).Value!.GetType().GetProperty("total")!.GetValue(((OkObjectResult)r).Value)!;

        Assert.Equal(3, Total(await c.Lista(null, null, null, null, null, null)));
        Assert.Equal(2, Total(await c.Lista(null, null, 1, null, null, null)));        // sede SAN (incluye multi-sede)
        Assert.Equal(2, Total(await c.Lista(null, null, 2, null, null, null)));        // sede VIR
        Assert.Equal(1, Total(await c.Lista(null, null, null, 1, null, null)));        // categoría
        Assert.Equal(1, Total(await c.Lista(null, null, null, null, null, "clave")));  // texto
        Assert.Equal(0, Total(await c.Lista(DateTime.Today.AddDays(1), null, null, null, null, null)));  // desde mañana
    }

    [Fact]
    public async Task Editar_actualiza_campos_y_sedes()
    {
        var db = NuevaDb(nameof(Editar_actualiza_campos_y_sedes));
        var c = Ctrl(db, UsuarioTi);
        await c.Crear(Req("Original", 1));
        var id = db.BitRegistros.Single().Id;

        var r = await c.Editar(id, Req("Editado", 2) with { CategoriaId = 1, DuracionMin = 30, ProveedorId = 1 });

        Assert.IsType<OkObjectResult>(r);
        var reg = db.BitRegistros.Include(x => x.Sedes).Single();
        Assert.Equal("Editado", reg.Descripcion);
        Assert.Equal(1, reg.CategoriaId);
        Assert.Equal(30, reg.DuracionMin);
        Assert.Equal(new[] { 2 }, reg.Sedes.Select(s => s.SedeId).ToArray());
    }

    [Fact]
    public async Task Eliminar_es_borrado_logico_y_desaparece_de_la_lista()
    {
        var db = NuevaDb(nameof(Eliminar_es_borrado_logico_y_desaparece_de_la_lista));
        var c = Ctrl(db, UsuarioTi);
        await c.Crear(Req());
        var id = db.BitRegistros.Single().Id;

        Assert.IsType<NoContentResult>(await c.Eliminar(id));

        Assert.True(db.BitRegistros.Single().Eliminado);                  // la fila sigue en la tabla
        var lista = (OkObjectResult)await c.Lista(null, null, null, null, null, null);
        Assert.Equal(0, (int)lista.Value!.GetType().GetProperty("total")!.GetValue(lista.Value)!);
        Assert.IsType<NotFoundResult>(await c.Eliminar(id));
    }

    [Fact]
    public async Task Otro_usuario_no_puede_editar_ni_eliminar_pero_el_admin_si()
    {
        var db = NuevaDb(nameof(Otro_usuario_no_puede_editar_ni_eliminar_pero_el_admin_si));
        await Ctrl(db, UsuarioTi).Crear(Req());
        var id = db.BitRegistros.Single().Id;

        var otro = Ctrl(db, UsuarioOtro);
        Assert.Equal(403, ((ObjectResult)await otro.Editar(id, Req("hack") with { ResponsableId = 1 })).StatusCode);
        Assert.Equal(403, ((ObjectResult)await otro.Eliminar(id)).StatusCode);

        var admin = Ctrl(db, UsuarioAdmin, "admin");
        Assert.IsType<OkObjectResult>(await admin.Editar(id, Req("admin edita") with { ResponsableId = 1 }));
        Assert.IsType<NoContentResult>(await admin.Eliminar(id));
    }

    [Fact]
    public async Task Autor_no_puede_editar_pasados_7_dias()
    {
        var db = NuevaDb(nameof(Autor_no_puede_editar_pasados_7_dias));
        var c = Ctrl(db, UsuarioTi);
        await c.Crear(Req());
        var reg = db.BitRegistros.Single();
        reg.CreadoEn = DateTime.Now.AddDays(-8);
        db.SaveChanges();

        Assert.Equal(403, ((ObjectResult)await c.Editar(reg.Id, Req("tarde"))).StatusCode);
    }

    [Fact]
    public async Task Recientes_devuelve_hasta_3_descripciones_distintas_del_usuario()
    {
        var db = NuevaDb(nameof(Recientes_devuelve_hasta_3_descripciones_distintas_del_usuario));
        var c = Ctrl(db, UsuarioTi);
        foreach (var d in new[] { "A", "B", "A", "C", "D", "A" }) await c.Crear(Req(d));

        var ok = (OkObjectResult)await c.Recientes();
        var lista = ((IEnumerable<object>)ok.Value!).ToList();
        Assert.Equal(3, lista.Count);
    }

    [Fact]
    public async Task Comentarios_se_crean_y_se_leen()
    {
        var db = NuevaDb(nameof(Comentarios_se_crean_y_se_leen));
        var c = Ctrl(db, UsuarioTi);
        await c.Crear(Req());
        var id = db.BitRegistros.Single().Id;

        Assert.IsType<CreatedResult>(await c.Comentar(id, new BitComentarioRequest("Pendiente de proveedor")));
        Assert.IsType<BadRequestObjectResult>(await c.Comentar(id, new BitComentarioRequest(" ")));
        Assert.IsType<NotFoundResult>(await c.Comentar(999, new BitComentarioRequest("x")));
        var lista = (IEnumerable<object>)((OkObjectResult)await c.Comentarios(id)).Value!;
        Assert.Single(lista);
    }

    [Fact]
    public async Task Seed_es_idempotente_y_no_duplica()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(nameof(Seed_es_idempotente_y_no_duplica)).Options);
        await BitacoraSeed.AplicarAsync(db);
        var (s, c, p, k) = (db.BitSedes.Count(), db.BitCategorias.Count(), db.BitPersonas.Count(), db.BitPalabrasClave.Count());
        await BitacoraSeed.AplicarAsync(db);

        Assert.Equal(7, s);
        Assert.Equal(9, p);
        Assert.Contains(db.BitCategorias, x => x.Nombre == "Otro");
        Assert.Equal((s, c, p, k), (db.BitSedes.Count(), db.BitCategorias.Count(), db.BitPersonas.Count(), db.BitPalabrasClave.Count()));
    }
}

// ── Fecha de solución: una actividad "En proceso" puede resolverse otro día ──
public class BitacoraSolucionTests
{
    static readonly DateTime Ahora = new(2026, 11, 23, 10, 0, 0);
    static readonly DateTime Actividad = new(2026, 11, 20, 9, 0, 0);

    [Fact] public void En_proceso_no_tiene_fecha_de_solucion() =>
        Assert.Null(FechaSolucionFinal(EstadoEnProceso, null, Actividad, null, null, Ahora));

    [Fact] public void Hecho_sin_fecha_se_resuelve_el_mismo_dia_de_la_actividad() =>
        Assert.Equal(Actividad, FechaSolucionFinal(EstadoHecho, null, Actividad, null, null, Ahora));

    [Fact] public void Cerrar_algo_en_proceso_sin_fecha_usa_el_momento_del_cierre() =>
        Assert.Equal(Ahora, FechaSolucionFinal(EstadoHecho, null, Actividad, EstadoEnProceso, null, Ahora));

    [Fact] public void La_fecha_indicada_manda() =>
        Assert.Equal(Ahora.AddDays(-1), FechaSolucionFinal(EstadoHecho, Ahora.AddDays(-1), Actividad, EstadoEnProceso, null, Ahora));

    [Fact] public void Reabrir_borra_la_solucion() =>
        Assert.Null(FechaSolucionFinal(EstadoEnProceso, null, Actividad, EstadoHecho, Ahora, Ahora));

    [Fact] public void Solucion_anterior_a_la_actividad_o_futura_se_rechaza()
    {
        var baseE = new Entrada("x", [1], Actividad, null, null, null, null);
        Assert.NotEmpty(Validar(baseE with { FechaSolucion = Actividad.AddDays(-1) }, Ahora));
        Assert.NotEmpty(Validar(baseE with { FechaSolucion = Ahora.AddDays(2) }, Ahora));
        Assert.Empty(Validar(baseE with { FechaSolucion = Ahora }, Ahora));
    }

    static (AppDbContext db, BitacoraController c) Nuevo(string nombre)
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(nombre).Options);
        db.BitSedes.Add(new BitSede { Id = 1, Codigo = "SAN", Nombre = "Santa" });
        db.BitCategorias.Add(new BitCategoria { Id = 1, Nombre = "Otro" });
        db.BitPersonas.Add(new BitPersonal { Id = 1, Nombre = "Hugo", UsuarioSigmaId = 7 });
        db.SaveChanges();
        var user = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "7"), new Claim(ClaimTypes.Name, "u7"), new Claim(ClaimTypes.Role, "ti")], "test"));
        var ctx = new DefaultHttpContext { User = user };
        var audit = new AuditService(db, new HttpContextAccessor { HttpContext = ctx }, NullLogger<AuditService>.Instance);
        return (db, new BitacoraController(db, audit) { ControllerContext = new ControllerContext { HttpContext = ctx } });
    }

    [Fact]
    public async Task Hecho_al_crear_se_resuelve_el_mismo_dia_y_en_proceso_queda_abierto()
    {
        var (db, c) = Nuevo(nameof(Hecho_al_crear_se_resuelve_el_mismo_dia_y_en_proceso_queda_abierto));
        await c.Crear(new BitRegistroRequest("hecha", [1], null, null, null, null, null, null, null, null));
        await c.Crear(new BitRegistroRequest("abierta", [1], null, null, null, null, null, null, 2, null));
        var hecha = db.BitRegistros.Single(x => x.Descripcion == "hecha");
        var abierta = db.BitRegistros.Single(x => x.Descripcion == "abierta");
        Assert.Equal(hecha.FechaActividad, hecha.FechaSolucion);
        Assert.Null(abierta.FechaSolucion);
    }

    [Fact]
    public async Task Resolver_otro_dia_guarda_la_fecha_de_cierre()
    {
        var (db, c) = Nuevo(nameof(Resolver_otro_dia_guarda_la_fecha_de_cierre));
        await c.Crear(new BitRegistroRequest("abierta", [1], DateTime.Now.AddDays(-3), null, null, null, null, null, 2, null));
        var reg = db.BitRegistros.Single();

        Assert.IsType<BadRequestObjectResult>(await c.Resolver(reg.Id, new BitResolverRequest(reg.FechaActividad.AddDays(-1))));   // antes de la actividad
        Assert.IsType<BadRequestObjectResult>(await c.Resolver(reg.Id, new BitResolverRequest(DateTime.Now.AddDays(2))));           // futura
        Assert.IsType<OkObjectResult>(await c.Resolver(reg.Id, new BitResolverRequest(null)));                                       // hoy

        Assert.Equal(BitacoraReglas.EstadoHecho, reg.Estado);
        Assert.Equal(DateTime.Today, reg.FechaSolucion!.Value.Date);
        Assert.NotEqual(reg.FechaActividad.Date, reg.FechaSolucion.Value.Date);   // se resolvió otro día
        Assert.IsType<NotFoundResult>(await c.Resolver(999, null));
    }
}
