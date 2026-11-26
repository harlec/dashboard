-- ============================================================
--  Reporte diario Sigma — historial y snapshots
--  Idempotente. NO modifica ni borra nada existente: solo crea
--  tablas/índices/claves nuevas. Rollback: migration_reporte_diario_rollback.sql
--
--  Ventana del reporte: 08:00 → 08:00 (America/Lima). Cada snapshot diario se
--  etiqueta con la FECHA DE INICIO de su ventana (la del 24/11 08:00 → 25/11 08:00
--  es "2026-11-24").
--
--  Historial de cambios de estado: YA existe en ping_log (solo graba cuando el
--  estado cambia) e incidentes (se derivan de ahí). Aquí solo se agrega un índice
--  por fecha para las consultas del reporte.
-- ============================================================
USE red;
GO

-- ── Discrepancia por vía y día ───────────────────────────────
IF OBJECT_ID('dbo.snap_discrepancia_via_dia', 'U') IS NULL
CREATE TABLE dbo.snap_discrepancia_via_dia (
    fecha         DATE          NOT NULL,   -- inicio de la ventana 08:00→08:00
    coest         TINYINT       NOT NULL,   -- transitos.tra_coest (1 FORTALEZA, 2 HUARMEY, 3 402, 4 VIRU, 5 SANTA)
    nuvia         INT           NOT NULL,   -- transitos.tra_nuvia
    via           NVARCHAR(60)  NOT NULL,
    transitos     INT           NOT NULL,   -- denominador (tránsitos normales del período)
    discrepancias INT           NOT NULL,   -- tra_manua <> tra_dac validadas contra disjus
    calculado_en  DATETIME2     NOT NULL CONSTRAINT DF_snap_disc_calc DEFAULT GETDATE(),
    CONSTRAINT PK_snap_discrepancia_via_dia PRIMARY KEY (fecha, coest, nuvia)
);
GO

-- ── OCR por vía y día ────────────────────────────────────────
IF OBJECT_ID('dbo.snap_ocr_via_dia', 'U') IS NULL
CREATE TABLE dbo.snap_ocr_via_dia (
    fecha            DATE          NOT NULL,
    coest            TINYINT       NOT NULL,
    nuvia            INT           NOT NULL,
    via              NVARCHAR(60)  NOT NULL,
    evaluables       INT           NOT NULL,  -- tránsitos evaluables (= reconocidas + no_legibles + error + sin_placa_ref)
    reconocidas      INT           NOT NULL,  -- tra_paten = tra_patocr
    no_legibles      INT           NOT NULL,  -- hay placa de referencia y el OCR no devolvió nada
    error_deteccion  INT           NOT NULL,  -- hay placa de referencia y el OCR leyó otra distinta
    sin_placa_ref    INT           NOT NULL,  -- sin placa de referencia (tra_paten vacío)
    calculado_en     DATETIME2     NOT NULL CONSTRAINT DF_snap_ocr_calc DEFAULT GETDATE(),
    CONSTRAINT PK_snap_ocr_via_dia PRIMARY KEY (fecha, coest, nuvia)
);
GO

-- ── Latencia por sitio (muestra cada ~5 min; la llena LatenciaSitioMuestreoService) ──
IF OBJECT_ID('dbo.snap_latencia_sitio', 'U') IS NULL
CREATE TABLE dbo.snap_latencia_sitio (
    estacion_id INT       NOT NULL,
    ts          DATETIME2 NOT NULL,
    ms_prom     FLOAT     NOT NULL,   -- promedio de la última latencia de los equipos UP de la plaza
    equipos     INT       NOT NULL,
    CONSTRAINT PK_snap_latencia_sitio PRIMARY KEY (estacion_id, ts),
    CONSTRAINT FK_snap_latencia_sitio_estaciones FOREIGN KEY (estacion_id) REFERENCES dbo.estaciones(id)
);
GO

-- ── Índice por fecha en ping_log (consultas de la ventana del reporte) ──
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ping_log_ts' AND object_id = OBJECT_ID('dbo.ping_log'))
    CREATE INDEX IX_ping_log_ts ON dbo.ping_log ([timestamp]) INCLUDE (equipo_id, estado);
GO

-- ── Configuración (el reporte nuevo convive con el actual: está APAGADO hasta activarlo) ──
INSERT INTO dbo.configuracion (clave, valor)
SELECT v.clave, v.valor FROM (VALUES
    ('reporte_diario_activo',            '0'),     -- 1 = envío programado habilitado
    ('email_reporte_diario',             ''),      -- destinatarios, separados por coma
    ('hora_reporte_diario',              '08:00'), -- HH:mm America/Lima; también es el corte de la ventana
    ('reporte_diario_url',               ''),      -- URL del botón "Abrir en Sigma" (ej. http://servidor/reporte-diario)
    ('reporte_evento_comun_equipos',     '3'),     -- equipos de la misma plaza que deben caer juntos
    ('reporte_evento_comun_ventana_min', '10'),    -- ...dentro de esta ventana (minutos)
    ('reporte_latencia_umbral_ms',       '24'),
    ('reporte_via_min_transitos',        '50'),    -- vías con menos tránsitos no entran al top de críticas
    ('reporte_incluir_mantenimiento',    '0')      -- 1 = la disponibilidad cuenta también las caídas en mantenimiento
) v(clave, valor)
WHERE NOT EXISTS (SELECT 1 FROM dbo.configuracion c WHERE c.clave = v.clave);
GO
