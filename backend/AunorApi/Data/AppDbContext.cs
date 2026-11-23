using AunorApi.Models;
using Microsoft.EntityFrameworkCore;

namespace AunorApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Estacion>        Estaciones        { get; set; }
    public DbSet<Via>             Vias              { get; set; }
    public DbSet<TipoEquipo>      TiposEquipo       { get; set; }
    public DbSet<Equipo>          Equipos           { get; set; }
    public DbSet<PingLog>         PingLogs          { get; set; }
    public DbSet<Incidente>       Incidentes        { get; set; }
    public DbSet<CamaraHeartbeat> CamarasHeartbeat  { get; set; }
    public DbSet<Usuario>         Usuarios          { get; set; }
    public DbSet<Configuracion>   Configuraciones   { get; set; }
    public DbSet<Mantenimiento>   Mantenimientos    { get; set; }
    public DbSet<IncidenteGrupo>  IncidenteGrupos   { get; set; }
    public DbSet<EnlaceEvento>    EnlaceEventos     { get; set; }
    public DbSet<Servicio>          Servicios          { get; set; }
    public DbSet<ServicioCheck>     ServicioChecks     { get; set; }
    public DbSet<ServicioCheckLog>  ServicioCheckLogs  { get; set; }
    public DbSet<ServicioIncidente> ServicioIncidentes { get; set; }
    public DbSet<NvrPeaje>          NvrPeajes          { get; set; }
    public DbSet<NvrCanal>          NvrCanales         { get; set; }
    public DbSet<AuditLog>          AuditLogs          { get; set; }
    public DbSet<BitSede>           BitSedes           { get; set; }
    public DbSet<BitCategoria>      BitCategorias      { get; set; }
    public DbSet<BitProveedor>      BitProveedores     { get; set; }
    public DbSet<BitPersonal>       BitPersonas        { get; set; }
    public DbSet<BitPalabraClave>   BitPalabrasClave   { get; set; }
    public DbSet<BitRegistro>       BitRegistros       { get; set; }
    public DbSet<BitRegistroSede>   BitRegistroSedes   { get; set; }
    public DbSet<BitComentario>     BitComentarios     { get; set; }
    public DbSet<NetDevice>         NetDevices         { get; set; }
    public DbSet<NetLink>           NetLinks           { get; set; }
    public DbSet<NetSample>         NetSamples         { get; set; }
    public DbSet<NetSampleHora>     NetSamplesHora     { get; set; }
    public DbSet<NetAlert>          NetAlerts          { get; set; }

    protected override void OnModelCreating(ModelBuilder m)
    {
        m.Entity<Estacion>(e => { e.ToTable("estaciones"); e.HasKey(x => x.Id); e.Property(x => x.Id).HasColumnName("id"); e.Property(x => x.Nombre).HasColumnName("nombre"); e.Property(x => x.Codigo).HasColumnName("codigo"); e.Property(x => x.Descripcion).HasColumnName("descripcion"); e.Property(x => x.Activo).HasColumnName("activo"); e.Property(x => x.CreadoEn).HasColumnName("creado_en"); });

        m.Entity<Via>(e => { e.ToTable("vias"); e.HasKey(x => x.Id); e.Property(x => x.Id).HasColumnName("id"); e.Property(x => x.EstacionId).HasColumnName("estacion_id"); e.Property(x => x.Numero).HasColumnName("numero"); e.Property(x => x.Nombre).HasColumnName("nombre"); e.Property(x => x.Activo).HasColumnName("activo"); e.Property(x => x.CreadoEn).HasColumnName("creado_en"); e.HasOne(x => x.Estacion).WithMany(x => x.Vias).HasForeignKey(x => x.EstacionId); });

        m.Entity<TipoEquipo>(e => { e.ToTable("tipos_equipo"); e.HasKey(x => x.Id); e.Property(x => x.Id).HasColumnName("id"); e.Property(x => x.Nombre).HasColumnName("nombre"); e.Property(x => x.Icono).HasColumnName("icono"); e.Property(x => x.Descripcion).HasColumnName("descripcion"); e.Property(x => x.Activo).HasColumnName("activo"); e.Property(x => x.CreadoEn).HasColumnName("creado_en"); });

        m.Entity<Equipo>(e => {
            e.ToTable("equipos");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ViaId).HasColumnName("via_id");
            e.Property(x => x.TipoEquipoId).HasColumnName("tipo_equipo_id");
            e.Property(x => x.Nombre).HasColumnName("nombre");
            e.Property(x => x.Ip).HasColumnName("ip");
            e.Property(x => x.Descripcion).HasColumnName("descripcion");
            e.Property(x => x.CheckPort).HasColumnName("check_port");
            e.Property(x => x.Monitorear).HasColumnName("monitorear");
            e.Property(x => x.EsCritico).HasColumnName("es_critico");
            e.Property(x => x.UltimaLatenciaMs).HasColumnName("ultima_latencia_ms");
            e.Property(x => x.UltimoPingEn).HasColumnName("ultimo_ping_en");
            e.Property(x => x.AgenteInstalado).HasColumnName("agente_instalado");
            e.Property(x => x.Activo).HasColumnName("activo");
            e.Property(x => x.CreadoEn).HasColumnName("creado_en");
            e.HasOne(x => x.Via).WithMany(x => x.Equipos).HasForeignKey(x => x.ViaId);
            e.HasOne(x => x.TipoEquipo).WithMany(x => x.Equipos).HasForeignKey(x => x.TipoEquipoId);
        });

        m.Entity<PingLog>(e => {
            e.ToTable("ping_log");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.EquipoId).HasColumnName("equipo_id");
            e.Property(x => x.Timestamp).HasColumnName("timestamp");
            e.Property(x => x.Estado).HasColumnName("estado");
            e.Property(x => x.LatenciaMs).HasColumnName("latencia_ms");
            e.Property(x => x.DetalleEstado).HasColumnName("detalle_estado");
            e.HasOne(x => x.Equipo).WithMany(x => x.PingLogs).HasForeignKey(x => x.EquipoId);
        });

        m.Entity<Incidente>(e => {
            e.ToTable("incidentes");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.EquipoId).HasColumnName("equipo_id");
            e.Property(x => x.Inicio).HasColumnName("inicio");
            e.Property(x => x.Fin).HasColumnName("fin");
            e.Property(x => x.DuracionMin).HasColumnName("duracion_min");
            e.Property(x => x.Tipo).HasColumnName("tipo");
            e.Property(x => x.Motivo).HasColumnName("motivo");
            e.Property(x => x.DetalleEstado).HasColumnName("detalle_estado");
            e.HasOne(x => x.Equipo).WithMany(x => x.Incidentes).HasForeignKey(x => x.EquipoId);
        });

        m.Entity<CamaraHeartbeat>(e => {
            e.ToTable("camaras_heartbeat");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Camara).HasColumnName("camara");
            e.Property(x => x.UltimoEmail).HasColumnName("ultimo_email");
            e.Property(x => x.Asunto).HasColumnName("asunto");
            e.Property(x => x.Remitente).HasColumnName("remitente");
            e.Property(x => x.Creado).HasColumnName("creado");
            e.Property(x => x.Actualizado).HasColumnName("actualizado");
        });

        m.Entity<Usuario>(e => {
            e.ToTable("usuarios");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Username).HasColumnName("username");
            e.Property(x => x.Password).HasColumnName("password");
            e.Property(x => x.Nombre).HasColumnName("nombre");
            e.Property(x => x.Rol).HasColumnName("rol");
            e.Property(x => x.Activo).HasColumnName("activo");
            e.Property(x => x.CreadoEn).HasColumnName("creado_en");
            e.Property(x => x.IntentosFallidos).HasColumnName("intentos_fallidos");
            e.Property(x => x.BloqueadoHasta).HasColumnName("bloqueado_hasta");
        });

        // ── Bitácora (tablas Bit*, columnas PascalCase = nombre de la propiedad) ──
        m.Entity<BitSede>(e => { e.ToTable("BitSede"); e.Property(x => x.Codigo).HasMaxLength(10); e.Property(x => x.Nombre).HasMaxLength(100); e.Property(x => x.Tipo).HasMaxLength(20); });
        m.Entity<BitCategoria>(e => { e.ToTable("BitCategoria"); e.Property(x => x.Nombre).HasMaxLength(100); e.Property(x => x.Segmento).HasMaxLength(30); });
        m.Entity<BitProveedor>(e => { e.ToTable("BitProveedor"); e.Property(x => x.Nombre).HasMaxLength(100); });
        m.Entity<BitPersonal>(e => { e.ToTable("BitPersonal"); e.Property(x => x.Nombre).HasMaxLength(100); e.Property(x => x.SedeBase).HasMaxLength(50); });
        m.Entity<BitPalabraClave>(e => { e.ToTable("BitPalabraClave"); e.Property(x => x.Palabra).HasMaxLength(60); });
        m.Entity<BitRegistro>(e => {
            e.ToTable("BitRegistro");
            e.Property(x => x.Descripcion).HasMaxLength(500);
            e.Property(x => x.Solicitante).HasMaxLength(100);
            e.Property(x => x.EquipoRef).HasMaxLength(100);
            e.HasOne(x => x.Categoria).WithMany().HasForeignKey(x => x.CategoriaId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne(x => x.Responsable).WithMany().HasForeignKey(x => x.ResponsableId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne(x => x.Proveedor).WithMany().HasForeignKey(x => x.ProveedorId).OnDelete(DeleteBehavior.NoAction);
            e.HasIndex(x => x.FechaActividad).IsDescending().HasDatabaseName("IX_BitRegistro_Fecha");
            e.HasIndex(x => x.CategoriaId).HasDatabaseName("IX_BitRegistro_Categoria");
        });
        m.Entity<BitRegistroSede>(e => {
            e.ToTable("BitRegistroSede");
            e.HasKey(x => new { x.RegistroId, x.SedeId });
            e.HasOne(x => x.Registro).WithMany(r => r.Sedes).HasForeignKey(x => x.RegistroId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Sede).WithMany().HasForeignKey(x => x.SedeId).OnDelete(DeleteBehavior.NoAction);
            e.HasIndex(x => x.SedeId).HasDatabaseName("IX_BitRegistroSede_Sede");
        });
        m.Entity<BitComentario>(e => { e.ToTable("BitComentario"); e.Property(x => x.Texto).HasMaxLength(1000); });

        m.Entity<AuditLog>(e => {
            e.ToTable("audit_log");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Fecha).HasColumnName("fecha");
            e.Property(x => x.Usuario).HasColumnName("usuario");
            e.Property(x => x.Ip).HasColumnName("ip");
            e.Property(x => x.Accion).HasColumnName("accion");
            e.Property(x => x.Entidad).HasColumnName("entidad");
            e.Property(x => x.Detalle).HasColumnName("detalle");
        });

        m.Entity<Configuracion>(e => {
            e.ToTable("configuracion");
            e.HasKey(x => x.Clave);
            e.Property(x => x.Clave).HasColumnName("clave");
            e.Property(x => x.Valor).HasColumnName("valor");
        });

        m.Entity<IncidenteGrupo>(e => {
            e.ToTable("incidente_grupos");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Tipo).HasColumnName("tipo");
            e.Property(x => x.EstacionId).HasColumnName("estacion_id");
            e.Property(x => x.ViaId).HasColumnName("via_id");
            e.Property(x => x.Inicio).HasColumnName("inicio");
            e.Property(x => x.Fin).HasColumnName("fin");
            e.Property(x => x.TelegramChatId).HasColumnName("telegram_chat_id");
            e.Property(x => x.TelegramMessageId).HasColumnName("telegram_message_id");
            e.Property(x => x.EquiposAfectados).HasColumnName("equipos_afectados");
            e.Property(x => x.EquiposTotal).HasColumnName("equipos_total");
        });

        m.Entity<EnlaceEvento>(e => {
            e.ToTable("enlace_eventos");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.EquipoId).HasColumnName("equipo_id");
            e.Property(x => x.Inicio).HasColumnName("inicio");
            e.Property(x => x.Fin).HasColumnName("fin");
            e.Property(x => x.DuracionMin).HasColumnName("duracion_min");
            e.Property(x => x.Enlace).HasColumnName("enlace");
            e.Property(x => x.LatenciaMs).HasColumnName("latencia_ms");
            e.Property(x => x.Ttl).HasColumnName("ttl");
            e.HasOne(x => x.Equipo).WithMany().HasForeignKey(x => x.EquipoId);
        });

        m.Entity<Servicio>(e => {
            e.ToTable("servicios");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Nombre).HasColumnName("nombre");
            e.Property(x => x.Descripcion).HasColumnName("descripcion");
            e.Property(x => x.UptimePct).HasColumnName("uptime_pct");
            e.Property(x => x.Activo).HasColumnName("activo");
            e.Property(x => x.CreadoEn).HasColumnName("creado_en");
        });

        m.Entity<ServicioCheck>(e => {
            e.ToTable("servicio_checks");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ServicioId).HasColumnName("servicio_id");
            e.Property(x => x.Nombre).HasColumnName("nombre");
            e.Property(x => x.TipoCheck).HasColumnName("tipo_check");
            e.Property(x => x.Host).HasColumnName("host");
            e.Property(x => x.Puerto).HasColumnName("puerto");
            e.Property(x => x.Ubicacion).HasColumnName("ubicacion");
            e.Property(x => x.Monitorear).HasColumnName("monitorear");
            e.Property(x => x.Activo).HasColumnName("activo");
            e.Property(x => x.CreadoEn).HasColumnName("creado_en");
            e.Property(x => x.UltimoEstado).HasColumnName("ultimo_estado");
            e.Property(x => x.UltimaLatenciaMs).HasColumnName("ultima_latencia_ms");
            e.Property(x => x.UltimoCheckEn).HasColumnName("ultimo_check_en");
            e.HasOne(x => x.Servicio).WithMany(x => x.Checks).HasForeignKey(x => x.ServicioId);
        });

        m.Entity<ServicioCheckLog>(e => {
            e.ToTable("servicio_check_logs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ServicioCheckId).HasColumnName("servicio_check_id");
            e.Property(x => x.Timestamp).HasColumnName("timestamp");
            e.Property(x => x.Estado).HasColumnName("estado");
            e.Property(x => x.LatenciaMs).HasColumnName("latencia_ms");
            e.Property(x => x.Detalle).HasColumnName("detalle");
            e.HasOne(x => x.ServicioCheck).WithMany().HasForeignKey(x => x.ServicioCheckId);
        });

        m.Entity<ServicioIncidente>(e => {
            e.ToTable("servicio_incidentes");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ServicioCheckId).HasColumnName("servicio_check_id");
            e.Property(x => x.Inicio).HasColumnName("inicio");
            e.Property(x => x.Fin).HasColumnName("fin");
            e.Property(x => x.DuracionMin).HasColumnName("duracion_min");
            e.Property(x => x.DetalleEstado).HasColumnName("detalle_estado");
            e.HasOne(x => x.ServicioCheck).WithMany().HasForeignKey(x => x.ServicioCheckId);
        });

        m.Entity<NvrPeaje>(e => {
            e.ToTable("nvr_peaje");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.CoestTransito).HasColumnName("coest_transito");
            e.Property(x => x.Peaje).HasColumnName("peaje");
            e.Property(x => x.Ip).HasColumnName("ip");
            e.Property(x => x.PuertoHttp).HasColumnName("puerto_http");
            e.Property(x => x.Usuario).HasColumnName("usuario");
            e.Property(x => x.PasswordRef).HasColumnName("password_ref");
            e.Property(x => x.RetencionDias).HasColumnName("retencion_dias");
            e.Property(x => x.Activo).HasColumnName("activo");
            e.Property(x => x.CreadoEn).HasColumnName("creado_en");
        });

        m.Entity<NvrCanal>(e => {
            e.ToTable("nvr_canal");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.NvrPeajeId).HasColumnName("nvr_peaje_id");
            e.Property(x => x.Canal).HasColumnName("canal");
            e.Property(x => x.Tipo).HasColumnName("tipo");
            e.Property(x => x.ViaNumero).HasColumnName("via_numero");
            e.Property(x => x.Sentido).HasColumnName("sentido");
            e.Property(x => x.Nombre).HasColumnName("nombre");
            e.Property(x => x.Activo).HasColumnName("activo");
            e.HasOne(x => x.NvrPeaje).WithMany(x => x.Canales).HasForeignKey(x => x.NvrPeajeId);
        });

        m.Entity<Mantenimiento>(e => {
            e.ToTable("mantenimientos");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.EstacionId).HasColumnName("estacion_id");
            e.Property(x => x.ViaId).HasColumnName("via_id");
            e.Property(x => x.EquipoId).HasColumnName("equipo_id");
            e.Property(x => x.Desde).HasColumnName("desde");
            e.Property(x => x.Hasta).HasColumnName("hasta");
            e.Property(x => x.Motivo).HasColumnName("motivo");
            e.Property(x => x.CreadoPor).HasColumnName("creado_por");
            e.Property(x => x.CreadoEn).HasColumnName("creado_en");
        });

        m.Entity<NetDevice>(e => {
            e.ToTable("net_device");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Nombre).HasColumnName("nombre");
            e.Property(x => x.Sitio).HasColumnName("sitio");
            e.Property(x => x.Marca).HasColumnName("marca");
            e.Property(x => x.IpMgmt).HasColumnName("ip_mgmt");
            e.Property(x => x.RolHa).HasColumnName("rol_ha");
            e.Property(x => x.GrupoHa).HasColumnName("grupo_ha");
            e.Property(x => x.SecretRef).HasColumnName("secret_ref");
            e.Property(x => x.ApiKeyEnc).HasColumnName("api_key_enc");
            e.Property(x => x.CertSha256).HasColumnName("cert_sha256");
            e.Property(x => x.Activo).HasColumnName("activo");
        });

        m.Entity<NetLink>(e => {
            e.ToTable("net_link");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.DeviceId).HasColumnName("device_id");
            e.Property(x => x.Interfaz).HasColumnName("interfaz");
            e.Property(x => x.Zona).HasColumnName("zona");
            e.Property(x => x.Rol).HasColumnName("rol");
            e.Property(x => x.MbpsContratadoIn).HasColumnName("mbps_contratado_in");
            e.Property(x => x.MbpsContratadoOut).HasColumnName("mbps_contratado_out");
            e.Property(x => x.UmbralWarnPct).HasColumnName("umbral_warn_pct");
            e.Property(x => x.UmbralCritPct).HasColumnName("umbral_crit_pct");
            e.Property(x => x.MedirAlerta).HasColumnName("medir_alerta");
            e.HasOne(x => x.Device).WithMany().HasForeignKey(x => x.DeviceId);
        });

        m.Entity<NetSample>(e => {
            e.ToTable("net_sample");
            e.HasKey(x => new { x.LinkId, x.TsUtc });
            e.Property(x => x.LinkId).HasColumnName("link_id");
            e.Property(x => x.TsUtc).HasColumnName("ts_utc");
            e.Property(x => x.InBps).HasColumnName("in_bps");
            e.Property(x => x.OutBps).HasColumnName("out_bps");
            e.Property(x => x.UtilInPct).HasColumnName("util_in_pct");
            e.Property(x => x.UtilOutPct).HasColumnName("util_out_pct");
        });

        m.Entity<NetSampleHora>(e => {
            e.ToTable("net_sample_hora");
            e.HasKey(x => new { x.LinkId, x.HoraUtc });
            e.Property(x => x.LinkId).HasColumnName("link_id");
            e.Property(x => x.HoraUtc).HasColumnName("hora_utc");
            e.Property(x => x.InBpsAvg).HasColumnName("in_bps_avg");
            e.Property(x => x.OutBpsAvg).HasColumnName("out_bps_avg");
            e.Property(x => x.InBpsMax).HasColumnName("in_bps_max");
            e.Property(x => x.OutBpsMax).HasColumnName("out_bps_max");
            e.Property(x => x.UtilMaxPct).HasColumnName("util_max_pct");
        });

        m.Entity<NetAlert>(e => {
            e.ToTable("net_alert");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.LinkId).HasColumnName("link_id");
            e.Property(x => x.Tipo).HasColumnName("tipo");
            e.Property(x => x.Severidad).HasColumnName("severidad");
            e.Property(x => x.InicioUtc).HasColumnName("inicio_utc");
            e.Property(x => x.FinUtc).HasColumnName("fin_utc");
            e.Property(x => x.ValorMaxPct).HasColumnName("valor_max_pct");
            e.HasOne(x => x.Link).WithMany().HasForeignKey(x => x.LinkId);
        });
    }
}

public interface IConnectionStringProvider { string ConnectionString { get; } }
public class ConnectionStringProvider(string cs) : IConnectionStringProvider { public string ConnectionString => cs; }
