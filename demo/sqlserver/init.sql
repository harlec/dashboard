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
    check_port     NVARCHAR(20)  NULL,       -- NULL = ICMP ping, "445" = un puerto, "8080,80" = varios en paralelo
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
    detalle_estado NVARCHAR(60) NULL,  -- IPStatus/error crudo al momento de caer, para diagnóstico (ver ping_log)
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
    enlace       NVARCHAR(20) NOT NULL DEFAULT 'MPLS',
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
    ('smtp_usuario',     'demo@example.com'),
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
    (8, 'Switch',           '[SW]',   'Switch de red de la via'),        -- TCP 22/23
    (9, 'Cámara Validación','[CAM]',  'Camara de validacion de clasificacion vehicular'),
    (10, 'DAC',             '[DAC]',  'Detector Automatico de Clasificacion de la via — no se monitorea por ping, su estado se deriva de la tasa de discrepancia (ver modulo Discrepancias)');

-- Puertos TCP por defecto según tipo (se pueden editar por equipo individualmente):
-- PC Via (1) y PC OCR (2)   → puerto 445 (SMB Windows, siempre abierto)
-- Display Tarifario (3)      → puerto 80  (HTTP panel)
-- Camara OCR (4)             → puerto 554 (RTSP video stream)
-- PMV (5)                    → puerto 80  (HTTP)
-- Antena/Router (6)          → NULL       (ICMP ping)
-- UPS (7)                    → NULL       (ICMP ping)
-- Switch (8)                 → NULL       (ICMP ping)
-- Cámara Validación (9)      → puerto 554 (RTSP video stream)
-- DAC (10)                   → sin IP real ni ping — monitorear=0 siempre, es un
--   equipo "virtual" por vía cuyo estado en el NOC viene de Discrepancias, no del ping
    SET IDENTITY_INSERT tipos_equipo OFF;
END
GO

-- Usuario admin por defecto (password: admin123 — CAMBIAR)
IF NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'admin')
    INSERT INTO usuarios (username, password, nombre, rol)
    VALUES ('admin', '$2a$10$7K9vfyCRkME3mrOf4JouLOdgCPbesI.eSJZNMGTeTWnqk12U6/Cz2', 'Administrador', 'admin');
GO

-- ============================================================
--  DEMO SEED — instancia de demostración genérica
--  Todo lo que sigue es 100% ficticio: nombres de estación (Alfa/Beta/
--  Gamma/Delta/Epsilon), IPs (rango privado 192.168.x.x) y datos de
--  tránsito/OCR generados aleatoriamente. No representa ninguna concesión
--  real — pensado para mostrar el sistema a otras concesiones sin exponer
--  datos de la empresa. El PingWorkerService corre en modo simulado
--  (DEMO_MODE=true, ver docker-compose.demo.yml) porque estas IPs no
--  existen de verdad.
-- ============================================================

USE red;
GO

IF NOT EXISTS (SELECT 1 FROM estaciones WHERE nombre = 'Alfa')
BEGIN
    INSERT INTO estaciones (nombre, codigo, descripcion) VALUES
    ('Alfa',    'ALF', 'Estación demo Alfa'),
    ('Beta',    'BET', 'Estación demo Beta'),
    ('Gamma',   'GAM', 'Estación demo Gamma'),
    ('Delta',   'DEL', 'Estación demo Delta'),
    ('Epsilon', 'EPS', 'Estación demo Epsilon');
END
GO

-- 8 vías numeradas por estación + 2 vías NOR/SUR reservadas para los PMV
IF NOT EXISTS (SELECT 1 FROM vias v JOIN estaciones e ON v.estacion_id = e.id WHERE e.nombre = 'Alfa' AND v.numero = '1')
BEGIN
    INSERT INTO vias (estacion_id, numero)
    SELECT e.id, CAST(n AS NVARCHAR(20))
    FROM estaciones e CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7),(8)) v(n)
    WHERE e.nombre IN ('Alfa','Beta','Gamma','Delta','Epsilon');

    INSERT INTO vias (estacion_id, numero)
    SELECT e.id, lado
    FROM estaciones e CROSS JOIN (VALUES ('NOR'),('SUR')) v(lado)
    WHERE e.nombre IN ('Alfa','Beta','Gamma','Delta','Epsilon');
END
GO

-- Equipos: 6 tipos por vía numerada (PC Via, PC OCR, Display, Camara OCR,
-- Cámara Validación, DAC) + 1 PMV por vía NOR/SUR. IPs ficticias 192.168.x.x
-- (x = id de estación) — nunca van a responder de verdad, por eso el modo demo.
IF NOT EXISTS (SELECT 1 FROM equipos)
BEGIN
    INSERT INTO equipos (via_id, tipo_equipo_id, nombre, ip, check_port, monitorear, es_critico)
    SELECT
        v.id, t.id,
        t.nombre + ' ' + v.numero,
        '192.168.' + CAST(v.estacion_id AS VARCHAR) + '.' + CAST(CAST(v.numero AS INT) * 10 + t.id AS VARCHAR),
        CASE t.id WHEN 1 THEN 445 WHEN 2 THEN 445 WHEN 3 THEN 80 WHEN 4 THEN 554 WHEN 9 THEN 554 ELSE NULL END,
        CASE t.id WHEN 10 THEN 0 ELSE 1 END,
        CASE t.id WHEN 1 THEN 1 ELSE 0 END
    FROM vias v
    JOIN estaciones e ON e.id = v.estacion_id
    CROSS JOIN tipos_equipo t
    WHERE e.nombre IN ('Alfa','Beta','Gamma','Delta','Epsilon')
      AND v.numero NOT IN ('NOR','SUR')
      AND t.id IN (1,2,3,4,9,10);

    INSERT INTO equipos (via_id, tipo_equipo_id, nombre, ip, check_port, monitorear)
    SELECT
        v.id, 5, 'PMV ' + v.numero + ' ' + e.nombre,
        '192.168.' + CAST(v.estacion_id AS VARCHAR) + '.' + CAST(CASE v.numero WHEN 'NOR' THEN 91 ELSE 92 END AS VARCHAR),
        80, 1
    FROM vias v
    JOIN estaciones e ON e.id = v.estacion_id
    WHERE e.nombre IN ('Alfa','Beta','Gamma','Delta','Epsilon')
      AND v.numero IN ('NOR','SUR');
END
GO

-- Historial sintético de incidentes (últimos 21 días) + ping_log de estado
-- actual (UP) para que el dashboard/reporte/muro tengan algo que mostrar
-- desde el primer arranque, sin esperar al primer ciclo del worker.
IF NOT EXISTS (SELECT 1 FROM incidentes)
BEGIN
    ;WITH tally AS (
        SELECT TOP 90 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
        FROM master..spt_values
    ),
    pick AS (
        SELECT
            t.n,
            eq.id AS equipo_id,
            DATEADD(MINUTE, -(ABS(CHECKSUM(NEWID())) % (60*24*21)), GETDATE()) AS inicio,
            5 + ABS(CHECKSUM(NEWID())) % 90 AS dur_min,
            CASE ABS(CHECKSUM(NEWID())) % 3
                WHEN 0 THEN 'TimedOut' WHEN 1 THEN 'TtlExpired' ELSE 'DestinationHostUnreachable' END AS detalle
        FROM tally t
        CROSS APPLY (SELECT TOP 1 id FROM equipos WHERE monitorear = 1 ORDER BY NEWID()) eq
    )
    INSERT INTO incidentes (equipo_id, inicio, fin, duracion_min, tipo, detalle_estado)
    SELECT equipo_id, inicio, DATEADD(MINUTE, dur_min, inicio), dur_min, 'Real', detalle
    FROM pick;

    INSERT INTO ping_log (equipo_id, timestamp, estado, detalle_estado)
    SELECT equipo_id, inicio, 'DOWN', detalle_estado FROM incidentes;

    INSERT INTO ping_log (equipo_id, timestamp, estado, latencia_ms)
    SELECT equipo_id, fin, 'UP', 8 + ABS(CHECKSUM(NEWID())) % 30
    FROM incidentes WHERE fin IS NOT NULL;

    INSERT INTO ping_log (equipo_id, timestamp, estado, latencia_ms)
    SELECT id, GETDATE(), 'UP', 8 + ABS(CHECKSUM(NEWID())) % 30
    FROM equipos WHERE monitorear = 1;

    UPDATE equipos
    SET ultima_latencia_ms = 8 + ABS(CHECKSUM(NEWID())) % 30, ultimo_ping_en = GETDATE()
    WHERE monitorear = 1;
END
GO

-- Configuración: alertas reales desactivadas (no hay a quién avisar en la
-- demo), y la cadena de conexión "Consolidado" apunta a la base ficticia
-- consolidado_demo creada más abajo, en el mismo contenedor de SQL Server.
UPDATE configuracion SET valor = '0' WHERE clave = 'alertas_activas';
UPDATE configuracion SET valor = '' WHERE clave IN
    ('email_alertas','smtp_usuario','smtp_password','telegram_bot_token','telegram_chat_id','email_reporte_semanal');
UPDATE configuracion SET valor =
    'Server=demo-sqlserver,1433;Database=consolidado_demo;User Id=sa;Password=$(SA_PASS);TrustServerCertificate=True'
    WHERE clave = 'consolidado_conn';
GO

IF NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'fuente_sistema')
    INSERT INTO configuracion (clave, valor) VALUES ('fuente_sistema', 'manrope');
GO
IF NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'escala_fuente')
    INSERT INTO configuracion (clave, valor) VALUES ('escala_fuente', '100');
GO

-- ============================================================
--  Base "consolidado_demo" — equivalente ficticio de la base externa
--  "Consolidado" (OCR/Discrepancias). Mismo esquema mínimo que usan
--  DiscrepanciasService.cs/OcrPlacasService.cs, con datos de tránsito
--  100% sintéticos.
-- ============================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'consolidado_demo')
    CREATE DATABASE consolidado_demo;
GO

USE consolidado_demo;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='transitos' AND xtype='U')
CREATE TABLE transitos (
    tra_coest  INT      NOT NULL,
    tra_nuvia  INT      NOT NULL,
    tra_numev  INT      NOT NULL,
    tra_fecha  DATETIME NOT NULL,
    tra_manua  INT      NULL,
    tra_dac    INT      NULL,
    tra_tipop  CHAR(1)  NULL,
    tra_titra  VARCHAR(2) NULL,
    tra_tiobs  CHAR(1)  NULL,
    tra_ticke  INT      NULL,
    tra_paten  VARCHAR(10) NULL,
    tra_patocr VARCHAR(10) NULL,
    tra_id     VARCHAR(20) NULL,
    tra_subfp  INT      NULL
);
GO
CREATE INDEX IX_transitos_fecha ON transitos(tra_fecha);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='disjus' AND xtype='U')
CREATE TABLE disjus (
    dis_coest INT NOT NULL,
    dis_nuvia INT NOT NULL,
    dis_numev INT NOT NULL,
    dis_fecha DATETIME NOT NULL
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='catfau' AND xtype='U')
CREATE TABLE catfau (
    cfa_tarif INT NOT NULL,
    cfa_catde VARCHAR(40) NULL,
    cfa_coest INT NULL
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='viadef' AND xtype='U')
CREATE TABLE viadef (
    via_coest INT NOT NULL,
    via_nuvia INT NOT NULL,
    via_nombr VARCHAR(60) NULL
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tipope' AND xtype='U')
CREATE TABLE tipope (
    tip_codig CHAR(1) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM catfau)
INSERT INTO catfau (cfa_tarif, cfa_catde, cfa_coest) VALUES
(1, 'Categoria 1', NULL), (2, 'Categoria 2', NULL), (3, 'Categoria 3', NULL),
(4, 'Categoria 4', NULL), (5, 'Categoria 5', NULL), (6, 'Categoria 6', NULL);
GO

-- 12,000 tránsitos sintéticos repartidos en 30 días × 5 estaciones × 8 vías.
-- Las vías 1 y 4 de cada estación se generan con tasa de discrepancia alta
-- a propósito (para que el ranking/gauges de Discrepancias tengan variedad
-- real que mostrar); el resto tiene una tasa baja de fondo.
IF NOT EXISTS (SELECT 1 FROM transitos)
BEGIN
    ;WITH tally AS (
        SELECT TOP 12000 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
        FROM master..spt_values a CROSS JOIN master..spt_values b
    ),
    base AS (
        SELECT
            n,
            1 + ABS(CHECKSUM(NEWID())) % 5 AS coest,
            1 + ABS(CHECKSUM(NEWID())) % 8 AS nuvia,
            DATEADD(SECOND, -(ABS(CHECKSUM(NEWID())) % (30*24*3600)), GETDATE()) AS fecha,
            1 + ABS(CHECKSUM(NEWID())) % 6 AS catManual,
            ABS(CHECKSUM(NEWID())) % 100 AS roll
        FROM tally
    )
    INSERT INTO transitos (tra_coest, tra_nuvia, tra_numev, tra_fecha, tra_manua, tra_dac,
                            tra_tipop, tra_titra, tra_tiobs, tra_ticke, tra_paten, tra_patocr, tra_id, tra_subfp)
    SELECT
        coest, nuvia, n, fecha,
        catManual,
        CASE WHEN roll < (CASE WHEN nuvia IN (1,4) THEN 18 ELSE 3 END)
             THEN 1 + (catManual % 6)
             ELSE catManual END,
        'E', 'TR', NULL,
        10000 + n,
        'D' + RIGHT('000' + CAST(1 + n % 900 AS VARCHAR), 3)
            + CHAR(65 + n % 26) + CHAR(65 + (n * 7) % 26) + CHAR(65 + (n * 13) % 26),
        NULL,
        'DEMO',
        CASE WHEN roll % 2 = 0 THEN 1 ELSE 0 END
    FROM base;

    -- tra_patocr: ~91% igual a tra_paten, ~7% con 1 carácter distinto (simula
    -- error de OCR), ~2% no detectada (NULL)
    UPDATE transitos
    SET tra_patocr =
        CASE
            WHEN ABS(CHECKSUM(NEWID())) % 100 < 2 THEN NULL
            WHEN ABS(CHECKSUM(NEWID())) % 100 < 9
                THEN STUFF(tra_paten, 1 + ABS(CHECKSUM(NEWID())) % LEN(tra_paten), 1, CHAR(65 + ABS(CHECKSUM(NEWID())) % 26))
            ELSE tra_paten
        END;

    INSERT INTO disjus (dis_coest, dis_nuvia, dis_numev, dis_fecha)
    SELECT tra_coest, tra_nuvia, tra_numev, tra_fecha
    FROM transitos WHERE tra_manua <> tra_dac;
END
GO

USE red;
GO
