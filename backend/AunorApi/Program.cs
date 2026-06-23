using System.Text;
using AunorApi.Data;
using AunorApi.Hubs;
using AunorApi.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
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
                // Permitir también token de SignalR query string
                if (string.IsNullOrEmpty(ctx.Token))
                    ctx.Token = ctx.Request.Query["access_token"];
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

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

// ── Singletons para workers ───────────────────────────────────
builder.Services.AddSingleton<IConnectionStringProvider>(
    new ConnectionStringProvider(connStr));
builder.Services.AddSingleton<EmailAlertService>();
builder.Services.AddSingleton<EnlaceEstadoCache>();

// ── Consolidado (BD externa — discrepancias DAC) ──────────────
builder.Services.AddSingleton<DiscrepanciasService>();
builder.Services.AddSingleton<OcrPlacasService>();

var app = builder.Build();

// ── Migrate / init DB ─────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

// ── Swagger UI (disponible siempre, proteger en prod si hace falta) ──
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "AUNOR Monitor API v1");
    c.RoutePrefix      = "swagger";
    c.DocumentTitle    = "AUNOR API Docs";
    c.DefaultModelsExpandDepth(-1);  // oculta modelos por defecto (más limpio)
});

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<MonitorHub>("/hub/monitor");

app.Run();
