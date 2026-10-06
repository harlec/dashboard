-- ================================================
--  migration_nvr_oficios.sql
--  Módulo Oficios: NVR por peaje + canales (OCR / VALIDACION / PTZ).
--  Idempotente — seguro de correr varias veces contra la BD ya viva.
--  Llaves alineadas con la tabla transitos de Consolidado:
--    coest_transito = tra_coest (1 Fortaleza, 2 Huarmey, 3 KM402, 4 Viru, 5 Santa)
--    via_numero     = tra_nuvia
-- ================================================
USE red;
GO

IF OBJECT_ID('nvr_peaje') IS NULL
CREATE TABLE nvr_peaje (
    id                INT IDENTITY PRIMARY KEY,
    coest_transito    INT           NOT NULL UNIQUE,
    peaje             NVARCHAR(50)  NOT NULL,
    ip                NVARCHAR(50)  NOT NULL,
    puerto_http       INT           NOT NULL DEFAULT 80,
    usuario           NVARCHAR(100) NOT NULL,
    password_ref      NVARCHAR(100) NOT NULL,   -- NOMBRE de la variable de entorno; nunca la contraseña
    retencion_dias    INT           NOT NULL DEFAULT 90,
    activo            BIT           NOT NULL DEFAULT 1,
    creado_en         DATETIME2     NOT NULL DEFAULT GETDATE()
);
GO

IF OBJECT_ID('nvr_canal') IS NULL
CREATE TABLE nvr_canal (
    id           INT IDENTITY PRIMARY KEY,
    nvr_peaje_id INT           NOT NULL REFERENCES nvr_peaje(id),
    canal        INT           NOT NULL,
    tipo         NVARCHAR(20)  NOT NULL,        -- OCR | VALIDACION | PTZ
    via_numero   INT           NULL,            -- OCR/VALIDACION: vía; PTZ: NULL
    sentido      NVARCHAR(20)  NULL,            -- PTZ: sentido que cubre; NULL = todos
    nombre       NVARCHAR(100) NOT NULL,
    activo       BIT           NOT NULL DEFAULT 1,
    CONSTRAINT UQ_nvr_canal UNIQUE (nvr_peaje_id, canal)
);
GO
