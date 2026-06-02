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
        });

        m.Entity<Configuracion>(e => {
            e.ToTable("configuracion");
            e.HasKey(x => x.Clave);
            e.Property(x => x.Clave).HasColumnName("clave");
            e.Property(x => x.Valor).HasColumnName("valor");
        });
    }
}

public interface IConnectionStringProvider { string ConnectionString { get; } }
public class ConnectionStringProvider(string cs) : IConnectionStringProvider { public string ConnectionString => cs; }
