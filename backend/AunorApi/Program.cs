using System.Text;
using AunorApi.Data;
using AunorApi.Hubs;
using AunorApi.Services;
using AunorApi.Services.NetMon;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// ── Database ─────────────────────────────────────────────────
var connStr = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
    ?? builder.Configuration.GetConnectionString("Default")!;

builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlServer(connStr));

// ── JWT Auth ─────────────────────────────────────────────────
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? throw new InvalidOperationException("JWT_SECRET no configurado");

var agentApiKey = Environment.GetEnvironmentVariable("AGENT_API_KEY")
    ?? throw new InvalidOperationException("AGENT_API_KEY no configurado");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"],
            ValidAudience            = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
        // Leer JWT de cookie HTTP-only
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                ctx.Token = ctx.Request.Cookies["aunor_token"];
                // SignalR (WebSocket) no puede mandar cookies/headers en todos los transportes:
                // el token por query string se acepta SOLO para el hub, nunca para la API REST
                // (las URLs con token terminan en logs de proxy).
                if (string.IsNullOrEmpty(ctx.Token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hub"))
                    ctx.Token = ctx.Request.Query["access_token"];
                return Task.CompletedTask;
            },
            // Revoca la sesión si el usuario fue dado de baja o cambió de rol
            OnTokenValidated = async ctx =>
            {
                var idStr = ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                var rol   = ctx.Principal?.FindFirstValue(ClaimTypes.Role) ?? "";
                var sp    = ctx.HttpContext.RequestServices;
                if (!int.TryParse(idStr, out var id) ||
                    !await sp.GetRequiredService<SesionValidator>()
                             .EsValidaAsync(id, rol, sp.GetRequiredService<AppDbContext>()))
                    ctx.Fail("Sesión inválida");
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<SesionValidator>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<AuditService>();

// ── Rate limiting: freno a fuerza bruta en /api/auth/login ───
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        AuditService.IpCliente(ctx) ?? "sin-ip",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// ── SignalR ───────────────────────────────────────────────────
builder.Services.AddSignalR();

// ── CORS (frontend en puerto 80 en host) ─────────────────────
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost", "http://localhost:80", "http://localhost:3000")
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

// ── Controllers ───────────────────────────────────────────────
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.ReferenceHandler =
        System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    o.JsonSerializerOptions.PropertyNamingPolicy =
        System.Text.Json.JsonNamingPolicy.CamelCase;
});

// ── Swagger / OpenAPI ─────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title       = "AUNOR Monitor API",
        Version     = "v1",
        Description = "API de monitoreo de red de peajes AUNOR — Dashboard de equipos, ping, incidentes y cámaras."
    });

    // Autenticación JWT via cookie en Swagger UI
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name        = "Authorization",
        Type        = SecuritySchemeType.Http,
        Scheme      = "bearer",
        BearerFormat = "JWT",
        In          = ParameterLocation.Header,
        Description = "Ingresa el JWT (se obtiene de POST /api/auth/login). " +
                      "Formato: Bearer {token}"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// ── Background services ───────────────────────────────────────
builder.Services.AddHostedService<PingWorkerService>();
builder.Services.AddHostedService<CamaraWorkerService>();
builder.Services.AddHostedService<EnlaceMonitorService>();
builder.Services.AddHostedService<TelegramQueueWorker>();
builder.Services.AddHostedService<ServicioCheckWorkerService>();
// Monitoreo de saturación de red (firewalls WAN): clientes por marca + alertas + sondeo
builder.Services.AddSingleton<IDeviceClient, PaloAltoClient>();
builder.Services.AddSingleton<NetAlertaService>();
builder.Services.AddHostedService<NetMonitorService>();
builder.Services.AddSingleton<ReporteSemanalService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ReporteSemanalService>());

// ── Singletons para workers ───────────────────────────────────
builder.Services.AddSingleton<IConnectionStringProvider>(
    new ConnectionStringProvider(connStr));
builder.Services.AddSingleton<IcmpGate>();
builder.Services.AddSingleton<EmailAlertService>();
builder.Services.AddSingleton<TelegramAlertService>();
builder.Services.AddSingleton<ReporteService>();
builder.Services.AddSingleton<EnlaceEstadoCache>();
builder.Services.AddSingleton<AgentClient>(sp => new AgentClient(
    agentApiKey,
    sp.GetRequiredService<IConnectionStringProvider>(),
    sp.GetRequiredService<IHttpClientFactory>(),
    sp.GetRequiredService<ILogger<AgentClient>>()));
builder.Services.AddHttpClient();

// ── Consolidado (BD externa — discrepancias DAC) ──────────────
builder.Services.AddSingleton<ConsolidadoConnectionProvider>();
builder.Services.AddSingleton<DiscrepanciasService>();
builder.Services.AddSingleton<OcrPlacasService>();
builder.Services.AddSingleton<TransitosPlacaService>();
builder.Services.AddSingleton<TransitosViaService>();
builder.Services.AddSingleton<DahuaVideoService>();
builder.Services.AddHostedService<OficiosLimpiezaService>();
builder.Services.AddHostedService<RetencionDatosService>();
builder.Services.AddSingleton<ReporteDiscrepanciasDiarioService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ReporteDiscrepanciasDiarioService>());
builder.Services.AddSingleton<AlertaDiscrepanciasService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<AlertaDiscrepanciasService>());

// ── Reportes PDF ────────────────────────────────────────────
PdfSharpCore.Fonts.GlobalFontSettings.FontResolver = new PdfFontResolver();
MigraDocCore.DocumentObjectModel.MigraDoc.DocumentObjectModel.Shapes.ImageSource.ImageSourceImpl =
    new PdfSharpCore.Utils.ImageSharpImageSource<SixLabors.ImageSharp.PixelFormats.Rgba32>();
builder.Services.AddScoped<ReportePdfService>();

var app = builder.Build();

// ── Migrate / init DB ─────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    // Primer arranque sin ningún admin: se crea uno con ADMIN_INITIAL_PASSWORD, o con una
    // contraseña aleatoria que se imprime UNA vez en el log del backend (ya no hay admin123 sembrado).
    if (!db.Usuarios.Any(u => u.Rol == "admin"))
    {
        var inicial = Environment.GetEnvironmentVariable("ADMIN_INITIAL_PASSWORD");
        var generada = string.IsNullOrEmpty(inicial);
        if (generada)
            inicial = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(18))
                .Replace('+', 'x').Replace('/', 'y').TrimEnd('=') + "aA1";
        db.Usuarios.Add(new AunorApi.Models.Usuario
        {
            Username = "admin",
            Password = BCrypt.Net.BCrypt.HashPassword(inicial),
            Nombre   = "Administrador",
            Rol      = "admin"
        });
        db.SaveChanges();
        var logInicial = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Seed");
        if (generada)
            logInicial.LogWarning("Usuario 'admin' creado con contraseña generada: {Password} — cámbiela al ingresar", inicial);
        else
            logInicial.LogWarning("Usuario 'admin' creado con ADMIN_INITIAL_PASSWORD");
    }
}

// ── Bitácora: catálogos iniciales (idempotente, scope propio para no contaminar el contexto
// de arriba si falla). Si falta correr sqlserver/migration_bitacora.sql las tablas Bit* no
// existen: se avisa en el log y el resto de la app arranca igual.
using (var scopeBit = app.Services.CreateScope())
{
    try { BitacoraSeed.AplicarAsync(scopeBit.ServiceProvider.GetRequiredService<AppDbContext>()).GetAwaiter().GetResult(); }
    catch (Exception ex)
    {
        scopeBit.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Bitacora")
            .LogWarning(ex, "No se pudieron sembrar los catálogos de la Bitácora: ¿se ejecutó migration_bitacora.sql?");
    }
}

// ── Swagger UI: apagado en producción (expone el mapa completo de la API sin auth).
// Para activarlo temporalmente: ENABLE_SWAGGER=true
if (app.Environment.IsDevelopment() || Environment.GetEnvironmentVariable("ENABLE_SWAGGER") == "true")
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "AUNOR Monitor API v1");
        c.RoutePrefix      = "swagger";
        c.DocumentTitle    = "AUNOR API Docs";
        c.DefaultModelsExpandDepth(-1);  // oculta modelos por defecto (más limpio)
    });
}

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// ── Tonos de alerta (mp3 subidos por Admin) — requiere sesión ──
var audioPath = Path.Combine(app.Environment.ContentRootPath, "audio");
Directory.CreateDirectory(audioPath);
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api/audio") && ctx.User.Identity?.IsAuthenticated != true)
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }
    await next();
});
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(audioPath),
    RequestPath  = "/api/audio"
});

app.MapControllers();
app.MapHub<MonitorHub>("/hub/monitor");

app.Run();
