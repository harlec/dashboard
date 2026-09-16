-- ================================================
--  migration_servicios.sql
--  Monitoreo de servicios sin vía (servidores en sala, páginas web).
--  Idempotente — seguro de correr varias veces contra la BD ya viva.
-- ================================================
USE red;
GO

-- ── servicios ────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='servicios' AND xtype='U')
CREATE TABLE servicios (
    id          INT           NOT NULL IDENTITY(1,1),
    nombre      NVARCHAR(100) NOT NULL,
    descripcion NVARCHAR(255) NULL,
    activo      BIT           NOT NULL DEFAULT 1,
    creado_en   DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_servicios PRIMARY KEY (id)
);
GO

-- ── servicio_checks ──────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='servicio_checks' AND xtype='U')
CREATE TABLE servicio_checks (
    id                 INT           NOT NULL IDENTITY(1,1),
    servicio_id        INT           NOT NULL,
    nombre             NVARCHAR(100) NOT NULL,
    tipo_check         NVARCHAR(10)  NOT NULL DEFAULT 'Ping',
    host               NVARCHAR(255) NOT NULL,
    puerto             INT           NULL,
    ubicacion          NVARCHAR(50)  NULL,
    monitorear         BIT           NOT NULL DEFAULT 1,
    activo             BIT           NOT NULL DEFAULT 1,
    creado_en          DATETIME2     NOT NULL DEFAULT GETDATE(),
    ultimo_estado      NVARCHAR(4)   NULL,
    ultima_latencia_ms FLOAT         NULL,
    ultimo_check_en    DATETIME2     NULL,
    CONSTRAINT PK_servicio_checks PRIMARY KEY (id),
    CONSTRAINT FK_servicio_checks_servicios FOREIGN KEY (servicio_id) REFERENCES servicios(id),
    CONSTRAINT CK_servicio_checks_tipo CHECK (tipo_check IN ('Ping','Tcp','Http'))
);
GO

-- ── servicio_check_logs ──────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='servicio_check_logs' AND xtype='U')
CREATE TABLE servicio_check_logs (
    id                BIGINT    NOT NULL IDENTITY(1,1),
    servicio_check_id INT       NOT NULL,
    timestamp         DATETIME2 NOT NULL DEFAULT GETDATE(),
    estado            NVARCHAR(4) NOT NULL,
    latencia_ms       FLOAT     NULL,
    detalle           NVARCHAR(255) NULL,
    CONSTRAINT PK_servicio_check_logs PRIMARY KEY (id),
    CONSTRAINT FK_servicio_check_logs_checks FOREIGN KEY (servicio_check_id) REFERENCES servicio_checks(id),
    CONSTRAINT CK_servicio_check_logs_estado CHECK (estado IN ('UP','DOWN'))
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_servicio_check_logs_check_ts')
CREATE INDEX IX_servicio_check_logs_check_ts ON servicio_check_logs (servicio_check_id, timestamp DESC);
GO

-- ── servicio_incidentes ──────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='servicio_incidentes' AND xtype='U')
CREATE TABLE servicio_incidentes (
    id                INT       NOT NULL IDENTITY(1,1),
    servicio_check_id INT       NOT NULL,
    inicio            DATETIME2 NOT NULL,
    fin               DATETIME2 NULL,
    duracion_min      INT       NULL,
    detalle_estado    NVARCHAR(255) NULL,
    CONSTRAINT PK_servicio_incidentes PRIMARY KEY (id),
    CONSTRAINT FK_servicio_incidentes_checks FOREIGN KEY (servicio_check_id) REFERENCES servicio_checks(id)
);
GO
