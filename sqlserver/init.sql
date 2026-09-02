-- ============================================================
--  init.sql — Schema SQL Server (migrado desde MySQL)
--  Base de datos: red
-- ============================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'red')
    CREATE DATABASE red;
GO

USE red;
GO

-- ── camaras_heartbeat ────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='camaras_heartbeat' AND xtype='U')
CREATE TABLE camaras_heartbeat (
    id          INT          NOT NULL IDENTITY(1,1),
    camara      TINYINT      NOT NULL,
    ultimo_email DATETIME2   NULL,
    asunto      NVARCHAR(255) NULL,
    remitente   NVARCHAR(150) NULL,
    creado      DATETIME2    NOT NULL DEFAULT GETDATE(),
    actualizado DATETIME2    NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_camaras_heartbeat PRIMARY KEY (id)
);
GO

-- ── configuracion ────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='configuracion' AND xtype='U')
CREATE TABLE configuracion (
    clave NVARCHAR(80)  NOT NULL,
    valor NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_configuracion PRIMARY KEY (clave)
);
GO

-- ── estaciones ───────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='estaciones' AND xtype='U')
CREATE TABLE estaciones (
    id          INT           NOT NULL IDENTITY(1,1),
    nombre      NVARCHAR(100) NOT NULL,
    codigo      NVARCHAR(20)  NOT NULL,
    descripcion NVARCHAR(255) NULL,
    activo      BIT           NOT NULL DEFAULT 1,
    creado_en   DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_estaciones PRIMARY KEY (id)
);
GO

-- ── tipos_equipo ─────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tipos_equipo' AND xtype='U')
CREATE TABLE tipos_equipo (
    id          INT           NOT NULL IDENTITY(1,1),
    nombre      NVARCHAR(100) NOT NULL,
    icono       NVARCHAR(50)  NULL,
    descripcion NVARCHAR(255) NULL,
    activo      BIT           NOT NULL DEFAULT 1,
    creado_en   DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_tipos_equipo PRIMARY KEY (id)
);
GO

-- ── usuarios ─────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='usuarios' AND xtype='U')
CREATE TABLE usuarios (
    id        INT           NOT NULL IDENTITY(1,1),
    username  NVARCHAR(80)  NOT NULL,
    password  NVARCHAR(255) NOT NULL,
    nombre    NVARCHAR(150) NULL,
    rol       NVARCHAR(10)  NOT NULL DEFAULT 'viewer',
    activo    BIT           NOT NULL DEFAULT 1,
    creado_en DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_usuarios PRIMARY KEY (id),
    CONSTRAINT UQ_usuarios_username UNIQUE (username),
    CONSTRAINT CK_usuarios_rol CHECK (rol IN ('admin','viewer'))
);
GO

-- ── vias ─────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='vias' AND xtype='U')
CREATE TABLE vias (
    id          INT          NOT NULL IDENTITY(1,1),
    estacion_id INT          NOT NULL,
    numero      NVARCHAR(20) NOT NULL,
    nombre      NVARCHAR(100) NULL,
    activo      BIT          NOT NULL DEFAULT 1,
    creado_en   DATETIME2    NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_vias PRIMARY KEY (id),
    CONSTRAINT FK_vias_estaciones FOREIGN KEY (estacion_id) REFERENCES estaciones(id)
);
GO

-- ── equipos ──────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='equipos' AND xtype='U')
CREATE TABLE equipos (
    id             INT           NOT NULL IDENTITY(1,1),
    via_id         INT           NOT NULL,
    tipo_equipo_id INT           NOT NULL,
    nombre         NVARCHAR(150) NOT NULL,
    ip             NVARCHAR(45)  NOT NULL,
    descripcion    NVARCHAR(255) NULL,
    check_port     INT           NULL,       -- NULL = ICMP ping, número = TCP port check
    monitorear     BIT           NOT NULL DEFAULT 1,
    es_critico     BIT           NOT NULL DEFAULT 0,  -- incluido en el reporte semanal de disponibilidad
    ultima_latencia_ms FLOAT     NULL,  -- se actualiza cada ciclo (a diferencia de ping_log)
    ultimo_ping_en DATETIME2     NULL,
    agente_instalado BIT         NOT NULL DEFAULT 0,  -- tiene PulsovialAgent instalado (reinicio remoto de servicios)
    activo         BIT           NOT NULL DEFAULT 1,
    creado_en      DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_equipos PRIMARY KEY (id),
    CONSTRAINT FK_equipos_vias  FOREIGN KEY (via_id)         REFERENCES vias(id),
    CONSTRAINT FK_equipos_tipos FOREIGN KEY (tipo_equipo_id) REFERENCES tipos_equipo(id)
);
GO

-- ── mantenimientos ───────────────────────────────────────────
-- Exactamente uno de estacion_id/via_id/equipo_id define el alcance. Mientras
-- desde<=ahora<=hasta, los incidentes de ese alcance se auto-etiquetan
-- "Mantenimiento" y no disparan alertas Telegram/Email/sonido.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='mantenimientos' AND xtype='U')
CREATE TABLE mantenimientos (
    id          INT           NOT NULL IDENTITY(1,1),
    estacion_id INT           NULL,
    via_id      INT           NULL,
    equipo_id   INT           NULL,
    desde       DATETIME2     NOT NULL,
    hasta       DATETIME2     NOT NULL,
    motivo      NVARCHAR(300) NOT NULL,
    creado_por  NVARCHAR(80)  NOT NULL,
    creado_en   DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_mantenimientos PRIMARY KEY (id),
    CONSTRAINT FK_mantenimientos_estaciones FOREIGN KEY (estacion_id) REFERENCES estaciones(id),
    CONSTRAINT FK_mantenimientos_vias       FOREIGN KEY (via_id)      REFERENCES vias(id),
    CONSTRAINT FK_mantenimientos_equipos    FOREIGN KEY (equipo_id)   REFERENCES equipos(id)
);
GO

-- ── incidente_grupos ─────────────────────────────────────────
-- Incidente de vía/peaje que agrupa varias caídas simultáneas en un solo
-- mensaje de Telegram editable en vez de uno por equipo.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='incidente_grupos' AND xtype='U')
CREATE TABLE incidente_grupos (
    id                   INT           NOT NULL IDENTITY(1,1),
    tipo                 NVARCHAR(10)  NOT NULL,  -- Via | Peaje
    estacion_id          INT           NOT NULL,
    via_id               INT           NULL,
    inicio               DATETIME2     NOT NULL,
    fin                  DATETIME2     NULL,
    telegram_chat_id     NVARCHAR(40)  NULL,
    telegram_message_id  NVARCHAR(40)  NULL,
    equipos_afectados    INT           NOT NULL DEFAULT 0,
    equipos_total        INT           NOT NULL DEFAULT 0,
    CONSTRAINT PK_incidente_grupos PRIMARY KEY (id),
    CONSTRAINT FK_incidente_grupos_estaciones FOREIGN KEY (estacion_id) REFERENCES estaciones(id),
    CONSTRAINT FK_incidente_grupos_vias       FOREIGN KEY (via_id)      REFERENCES vias(id)
);
GO

-- ── ping_log ─────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ping_log' AND xtype='U')
CREATE TABLE ping_log (
    id         BIGINT    NOT NULL IDENTITY(1,1),
    equipo_id  INT       NOT NULL,
    timestamp  DATETIME2 NOT NULL DEFAULT GETDATE(),
    estado     NVARCHAR(4) NOT NULL,
    latencia_ms FLOAT    NULL,
    detalle_estado NVARCHAR(60) NULL,  -- IPStatus crudo o error de socket/TCP, para diagnóstico
    CONSTRAINT PK_ping_log PRIMARY KEY (id),
    CONSTRAINT FK_ping_log_equipos FOREIGN KEY (equipo_id) REFERENCES equipos(id),
    CONSTRAINT CK_ping_log_estado CHECK (estado IN ('UP','DOWN'))
);
GO

CREATE INDEX IX_ping_log_equipo_ts ON ping_log (equipo_id, timestamp DESC);
GO

-- ── incidentes ───────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='incidentes' AND xtype='U')
CREATE TABLE incidentes (
    id          INT       NOT NULL IDENTITY(1,1),
    equipo_id   INT       NOT NULL,
    inicio      DATETIME2 NOT NULL,
    fin         DATETIME2 NULL,
    duracion_min INT      NULL,
    tipo         NVARCHAR(30) NOT NULL DEFAULT 'Real',  -- Real | Mantenimiento | ReinicioForzado | Otro
    motivo       NVARCHAR(500) NULL,
    CONSTRAINT PK_incidentes PRIMARY KEY (id),
    CONSTRAINT FK_incidentes_equipos FOREIGN KEY (equipo_id) REFERENCES equipos(id)
);
GO

-- ── enlace_eventos ───────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='enlace_eventos' AND xtype='U')
CREATE TABLE enlace_eventos (
    id           INT       NOT NULL IDENTITY(1,1),
    equipo_id    INT       NOT NULL,
    inicio       DATETIME2 NOT NULL,
    fin          DATETIME2 NULL,
    duracion_min INT       NULL,
    enlace       NVARCHAR(10) NOT NULL DEFAULT 'MPLS',
    latencia_ms  FLOAT     NULL,
    ttl          INT       NULL,
    CONSTRAINT PK_enlace_eventos PRIMARY KEY (id),
    CONSTRAINT FK_enlace_eventos_equipos FOREIGN KEY (equipo_id) REFERENCES equipos(id)
);
GO

-- ── izipay_monitor ───────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='izipay_monitor' AND xtype='U')
CREATE TABLE izipay_monitor (
    id             INT           NOT NULL IDENTITY(1,1),
    estacion       NVARCHAR(20)  NOT NULL,
    via            NVARCHAR(20)  NOT NULL,
    ip_pc          NVARCHAR(15)  NULL,
    pc_online      BIT           NOT NULL DEFAULT 0,
    online         BIT           NOT NULL DEFAULT 0,
    estado         NVARCHAR(20)  NOT NULL DEFAULT 'DESCONOCIDO',
    detalle        NVARCHAR(200) NULL,
    ip_tethering   NVARCHAR(15)  NULL,
    ultimo_reporte DATETIME2     NULL,
    CONSTRAINT PK_izipay_monitor PRIMARY KEY (id)
);
GO

-- ── pc_health ────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='pc_health' AND xtype='U')
CREATE TABLE pc_health (
    id                  INT          NOT NULL IDENTITY(1,1),
    ip_pc               NVARCHAR(15) NOT NULL,
    disco_libre_gb      DECIMAL(5,1) NOT NULL DEFAULT 0.0,
    disco_usado_pct     TINYINT      NOT NULL DEFAULT 0,
    disco_estado        NVARCHAR(5)  NOT NULL DEFAULT 'nd',
    ram_uso_pct         TINYINT      NOT NULL DEFAULT 0,
    ram_estado          NVARCHAR(5)  NOT NULL DEFAULT 'nd',
    temp_cpu            SMALLINT     NOT NULL DEFAULT -1,
    temp_estado         NVARCHAR(5)  NOT NULL DEFAULT 'nd',
    tcptoll_corre       BIT          NOT NULL DEFAULT 0,
    tcptoll_inactivo_min INT         NOT NULL DEFAULT 0,
    tcptoll_estado      NVARCHAR(5)  NOT NULL DEFAULT 'nd',
    uptime_dias         DECIMAL(5,1) NOT NULL DEFAULT 0.0,
    cpu_uso             TINYINT      NOT NULL DEFAULT 0,
    ultimo_reporte      DATETIME2    NULL,
    CONSTRAINT PK_pc_health PRIMARY KEY (id)
);
GO

-- ── servidor_alertas ─────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='servidor_alertas' AND xtype='U')
CREATE TABLE servidor_alertas (
    id          INT           NOT NULL IDENTITY(1,1),
    equipo_id   NVARCHAR(50)  NOT NULL,
    descripcion NVARCHAR(300) NOT NULL,
    resuelta    BIT           NOT NULL DEFAULT 0,
    created_at  DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_servidor_alertas PRIMARY KEY (id)
);
GO

-- ── servidor_discos ──────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='servidor_discos' AND xtype='U')
CREATE TABLE servidor_discos (
    id        INT          NOT NULL IDENTITY(1,1),
    equipo_id NVARCHAR(50) NOT NULL,
    letra     NVARCHAR(5)  NOT NULL,
    total_gb  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    usado_gb  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    libre_gb  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    pct_usado DECIMAL(5,1) NOT NULL DEFAULT 0.0,
    timestamp DATETIME2    NOT NULL,
    CONSTRAINT PK_servidor_discos PRIMARY KEY (id)
);
GO

-- ── servidor_metricas ────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='servidor_metricas' AND xtype='U')
CREATE TABLE servidor_metricas (
    id          INT           NOT NULL IDENTITY(1,1),
    equipo_id   NVARCHAR(50)  NOT NULL,
    ubicacion   NVARCHAR(100) NOT NULL,
    hostname    NVARCHAR(100) NOT NULL,
    cpu_pct     DECIMAL(5,1)  NOT NULL DEFAULT 0.0,
    ram_usada   DECIMAL(5,1)  NOT NULL DEFAULT 0.0,
    uptime      NVARCHAR(50)  NULL,
    temperatura DECIMAL(5,1)  NULL,
    timestamp   DATETIME2     NOT NULL,
    raw_json    NVARCHAR(MAX) NULL,
    created_at  DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_servidor_metricas PRIMARY KEY (id)
);
GO

-- ============================================================
--  Datos iniciales
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'alertas_activas')
BEGIN
    INSERT INTO configuracion (clave, valor) VALUES
    ('alertas_activas',  '1'),
    ('email_alertas',    '-'),
    ('intervalo_min',    '3'),
    ('pings_por_ciclo',  '3'),
    ('smtp_host',        'smtp.office365.com'),
    ('smtp_password',    ''),
    ('smtp_puerto',      '587'),
    ('smtp_usuario',     'soporte.ope@aunor.pe'),
    ('timeout_ping_s',   '3');
END
GO

IF NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'telegram_bot_token')
BEGIN
    INSERT INTO configuracion (clave, valor) VALUES
    ('telegram_bot_token', ''),
    ('telegram_chat_id',   '');
END
GO

IF NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'email_reporte_semanal')
BEGIN
    INSERT INTO configuracion (clave, valor) VALUES
    ('email_reporte_semanal', '');
END
GO

IF NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'consolidado_conn')
BEGIN
    INSERT INTO configuracion (clave, valor) VALUES
    ('consolidado_conn', '');
END
GO

IF NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'agente_servicios_permitidos')
BEGIN
    INSERT INTO configuracion (clave, valor) VALUES
    ('agente_servicios_permitidos', ''),
    ('agente_puerto',               '6060');
END
GO

-- Tipos de equipo
IF NOT EXISTS (SELECT 1 FROM tipos_equipo WHERE id = 1)
BEGIN
    SET IDENTITY_INSERT tipos_equipo ON;
    INSERT INTO tipos_equipo (id, nombre, icono, descripcion) VALUES
    (1, 'PC Via',           '[PC]',   'Computadora principal de la via de cobro'),
    (2, 'PC OCR',           '[OCR]',  'Computadora del sistema de reconocimiento optico'),
    (3, 'Display Tarifario','[DISP]', 'Pantalla de visualizacion de tarifas'),
    (4, 'Camara OCR',       '[CAM]',  'Camara de captura para OCR de placas'),
    (5, 'PMV',              '[PMV]',  'Media converter de fibra óptica — su caída puede indicar corte de fibra en la vía'),       -- TCP 80
    (6, 'Antena/Router',    '[RED]',  'Equipo de red y conectividad'),   -- ICMP
    (7, 'UPS',              '[UPS]',  'Sistema de alimentacion ininterrumpida'), -- ICMP
    (8, 'Switch',           '[SW]',   'Switch de red de la via');         -- TCP 22/23

-- Puertos TCP por defecto según tipo (se pueden editar por equipo individualmente):
-- PC Via (1) y PC OCR (2)   → puerto 445 (SMB Windows, siempre abierto)
-- Display Tarifario (3)      → puerto 80  (HTTP panel)
-- Camara OCR (4)             → puerto 554 (RTSP video stream)
-- PMV (5)                    → puerto 80  (HTTP)
-- Antena/Router (6)          → NULL       (ICMP ping)
-- UPS (7)                    → NULL       (ICMP ping)
-- Switch (8)                 → NULL       (ICMP ping)
    SET IDENTITY_INSERT tipos_equipo OFF;
END
GO

-- Usuario admin por defecto (password: admin123 — CAMBIAR)
IF NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'admin')
    INSERT INTO usuarios (username, password, nombre, rol)
    VALUES ('admin', '$2a$10$7K9vfyCRkME3mrOf4JouLOdgCPbesI.eSJZNMGTeTWnqk12U6/Cz2', 'Administrador', 'admin');
GO
