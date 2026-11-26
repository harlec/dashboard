-- Rollback de migration_reporte_diario.sql — solo elimina lo que esa migración creó.
-- Los snapshots son datos derivados (se pueden recalcular desde transitos), no datos de origen.
USE red;
GO

IF OBJECT_ID('dbo.snap_latencia_sitio', 'U')       IS NOT NULL DROP TABLE dbo.snap_latencia_sitio;
IF OBJECT_ID('dbo.snap_ocr_via_dia', 'U')          IS NOT NULL DROP TABLE dbo.snap_ocr_via_dia;
IF OBJECT_ID('dbo.snap_discrepancia_via_dia', 'U') IS NOT NULL DROP TABLE dbo.snap_discrepancia_via_dia;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ping_log_ts' AND object_id = OBJECT_ID('dbo.ping_log'))
    DROP INDEX IX_ping_log_ts ON dbo.ping_log;
GO

DELETE FROM dbo.configuracion WHERE clave IN (
    'reporte_diario_activo','email_reporte_diario','hora_reporte_diario','reporte_diario_url',
    'reporte_evento_comun_equipos','reporte_evento_comun_ventana_min','reporte_latencia_umbral_ms',
    'reporte_via_min_transitos','reporte_incluir_mantenimiento');
GO
