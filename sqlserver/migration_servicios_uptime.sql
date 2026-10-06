-- ================================================
--  migration_servicios_uptime.sql
--  % de uptime manual por servicio, mientras se define el monitoreo real
--  (fase 2). Idempotente — seguro de correr varias veces contra la BD ya viva.
-- ================================================
USE red;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('servicios') AND name = 'uptime_pct'
)
ALTER TABLE servicios ADD uptime_pct DECIMAL(5,2) NULL;
GO
