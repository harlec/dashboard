-- ================================================
--  migration_seguridad.sql
--  Bloqueo de cuentas por intentos fallidos + bitácora de auditoría.
--  Idempotente — seguro de correr varias veces contra la BD ya viva.
--  DEBE correrse ANTES de desplegar el backend que usa estas columnas.
-- ================================================
USE red;
GO

IF COL_LENGTH('usuarios', 'intentos_fallidos') IS NULL
    ALTER TABLE usuarios ADD intentos_fallidos INT NOT NULL CONSTRAINT DF_usuarios_intentos DEFAULT 0;
GO
IF COL_LENGTH('usuarios', 'bloqueado_hasta') IS NULL
    ALTER TABLE usuarios ADD bloqueado_hasta DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_log' AND xtype='U')
BEGIN
    CREATE TABLE audit_log (
        id      BIGINT        NOT NULL IDENTITY(1,1),
        fecha   DATETIME2     NOT NULL DEFAULT GETDATE(),
        usuario NVARCHAR(80)  NULL,
        ip      NVARCHAR(45)  NULL,
        accion  NVARCHAR(50)  NOT NULL,
        entidad NVARCHAR(100) NULL,
        detalle NVARCHAR(500) NULL,
        CONSTRAINT PK_audit_log PRIMARY KEY (id)
    );
    CREATE INDEX IX_audit_log_fecha ON audit_log (fecha DESC);
END
GO
