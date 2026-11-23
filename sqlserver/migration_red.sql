-- ================================================
--  migration_red.sql
--  Módulo de monitoreo de saturación de red (firewalls WAN).
--  Idempotente — seguro de correr varias veces contra la BD ya viva.
--  DEBE correrse ANTES de desplegar el backend que usa estas tablas.
--  Todas las marcas de tiempo son UTC (columnas *_utc).
-- ================================================
USE red;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='net_device' AND xtype='U')
CREATE TABLE net_device (
    id              INT           NOT NULL IDENTITY(1,1),
    nombre          NVARCHAR(100) NOT NULL,
    sitio           NVARCHAR(100) NOT NULL,
    marca           NVARCHAR(30)  NOT NULL,                 -- PaloAlto | Fortinet
    ip_mgmt         NVARCHAR(45)  NOT NULL,
    rol_ha          NVARCHAR(20)  NOT NULL DEFAULT 'ninguno', -- primario | secundario | ninguno
    grupo_ha        NVARCHAR(50)  NULL,                     -- unidades del mismo par comparten grupo
    secret_ref      NVARCHAR(100) NULL,                     -- respaldo: NOMBRE de una variable de entorno con la API key
    api_key_enc     NVARCHAR(MAX) NULL,                     -- API key CIFRADA (AES-GCM) capturada desde el admin
    cert_sha256     NVARCHAR(100) NULL,                     -- huella SHA-256 del certificado TLS (no es secreto)
    activo          BIT           NOT NULL DEFAULT 1,
    CONSTRAINT PK_net_device PRIMARY KEY (id)
);
GO

-- Instalaciones que ya crearon net_device sin api_key_enc
IF COL_LENGTH('net_device', 'api_key_enc') IS NULL
    ALTER TABLE net_device ADD api_key_enc NVARCHAR(MAX) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('net_device') AND name = 'secret_ref' AND is_nullable = 0)
    ALTER TABLE net_device ALTER COLUMN secret_ref NVARCHAR(100) NULL;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='net_link' AND xtype='U')
CREATE TABLE net_link (
    id                  INT           NOT NULL IDENTITY(1,1),
    device_id           INT           NOT NULL,             -- unidad primaria; la secundaria se resuelve por grupo_ha
    interfaz            NVARCHAR(50)  NOT NULL,
    zona                NVARCHAR(50)  NULL,
    rol                 NVARCHAR(20)  NOT NULL,             -- MPLS | INTERNET | LAN
    mbps_contratado_in  FLOAT         NULL,
    mbps_contratado_out FLOAT         NULL,
    umbral_warn_pct     FLOAT         NOT NULL DEFAULT 70,
    umbral_crit_pct     FLOAT         NOT NULL DEFAULT 85,
    medir_alerta        BIT           NOT NULL DEFAULT 1,
    CONSTRAINT PK_net_link PRIMARY KEY (id),
    CONSTRAINT FK_net_link_device FOREIGN KEY (device_id) REFERENCES net_device(id)
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='net_sample' AND xtype='U')
CREATE TABLE net_sample (
    link_id      INT       NOT NULL,
    ts_utc       DATETIME2 NOT NULL,
    in_bps       BIGINT    NOT NULL,
    out_bps      BIGINT    NOT NULL,
    util_in_pct  FLOAT     NULL,                            -- NULL si no hay ancho contratado
    util_out_pct FLOAT     NULL,
    CONSTRAINT PK_net_sample PRIMARY KEY (link_id, ts_utc),
    CONSTRAINT FK_net_sample_link FOREIGN KEY (link_id) REFERENCES net_link(id)
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='net_alert' AND xtype='U')
BEGIN
    CREATE TABLE net_alert (
        id             INT       NOT NULL IDENTITY(1,1),
        link_id        INT       NOT NULL,
        tipo           NVARCHAR(20) NOT NULL,               -- SATURACION | SIN_DATOS
        severidad      NVARCHAR(20) NOT NULL,               -- CRITICA | AVISO
        inicio_utc     DATETIME2 NOT NULL,
        fin_utc        DATETIME2 NULL,
        valor_max_pct  FLOAT     NULL,
        CONSTRAINT PK_net_alert PRIMARY KEY (id),
        CONSTRAINT FK_net_alert_link FOREIGN KEY (link_id) REFERENCES net_link(id)
    );
    CREATE INDEX IX_net_alert_link_fin ON net_alert (link_id, fin_utc);
END
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='net_sample_hora' AND xtype='U')
CREATE TABLE net_sample_hora (
    link_id      INT       NOT NULL,
    hora_utc     DATETIME2 NOT NULL,
    in_bps_avg   BIGINT    NOT NULL,
    out_bps_avg  BIGINT    NOT NULL,
    in_bps_max   BIGINT    NOT NULL,
    out_bps_max  BIGINT    NOT NULL,
    util_max_pct FLOAT     NULL,
    CONSTRAINT PK_net_sample_hora PRIMARY KEY (link_id, hora_utc),
    CONSTRAINT FK_net_sample_hora_link FOREIGN KEY (link_id) REFERENCES net_link(id)
);
GO

-- ── Datos iniciales: firewall Palo Alto de Lima (par HA) ─────────────────
-- La IP del secundario está pendiente: al conocerla, agregar otra fila con
-- rol_ha='secundario' y el mismo grupo_ha. cert_sha256 se completa con la huella del
-- certificado del firewall (sin ella el cliente se niega a conectar).
-- La API key se captura en Admin → Red (se guarda cifrada en api_key_enc). secret_ref es un respaldo
-- opcional (nombre de una variable de entorno) y queda vacío.
IF NOT EXISTS (SELECT 1 FROM net_device WHERE nombre = 'Fw-Aunor-Primario')
    INSERT INTO net_device (nombre, sitio, marca, ip_mgmt, rol_ha, grupo_ha)
    VALUES ('Fw-Aunor-Primario', 'Lima', 'PaloAlto', '10.15.112.202', 'primario', 'LIMA-FW');
GO

-- Ancho contratado con Entel: 250 Mbps (Internet y MPLS, entrada y salida).
-- LAN es informativa: sin ancho contratado y sin alertas.
DECLARE @dev INT = (SELECT id FROM net_device WHERE nombre = 'Fw-Aunor-Primario');
IF NOT EXISTS (SELECT 1 FROM net_link WHERE device_id = @dev AND interfaz = 'ethernet1/1')
    INSERT INTO net_link (device_id, interfaz, zona, rol, mbps_contratado_in, mbps_contratado_out, medir_alerta)
    VALUES (@dev, 'ethernet1/1', 'INTERNET', 'INTERNET', 250, 250, 1);
IF NOT EXISTS (SELECT 1 FROM net_link WHERE device_id = @dev AND interfaz = 'ethernet1/2')
    INSERT INTO net_link (device_id, interfaz, zona, rol, mbps_contratado_in, mbps_contratado_out, medir_alerta)
    VALUES (@dev, 'ethernet1/2', 'MPLS', 'MPLS', 250, 250, 1);
IF NOT EXISTS (SELECT 1 FROM net_link WHERE device_id = @dev AND interfaz = 'ethernet1/3')
    INSERT INTO net_link (device_id, interfaz, zona, rol, mbps_contratado_in, mbps_contratado_out, medir_alerta)
    VALUES (@dev, 'ethernet1/3', 'LAN', 'LAN', NULL, NULL, 0);
GO
