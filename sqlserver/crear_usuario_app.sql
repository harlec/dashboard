-- ================================================
--  crear_usuario_app.sql
--  Login de mínimo privilegio para el backend (en lugar de 'sa').
--  Idempotente: se corre en cada arranque del contenedor (entrypoint.sh) y a mano.
--  Variable sqlcmd: APP_PASSWORD  →  sqlcmd -v APP_PASSWORD="..." -i crear_usuario_app.sql
-- ================================================
USE master;
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'sigma_app')
    CREATE LOGIN sigma_app WITH PASSWORD = '$(APP_PASSWORD)', CHECK_POLICY = OFF;
ELSE
    ALTER LOGIN sigma_app WITH PASSWORD = '$(APP_PASSWORD)';
GO

USE red;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'sigma_app')
    CREATE USER sigma_app FOR LOGIN sigma_app;
GO
-- Datos: leer y escribir. Sin DDL, sin crear logins, sin otras bases.
ALTER ROLE db_datareader ADD MEMBER sigma_app;
ALTER ROLE db_datawriter ADD MEMBER sigma_app;
GO
-- audit_log es de solo inserción: ni la app (ni quien la comprometa) puede alterar la bitácora
DENY UPDATE, DELETE ON OBJECT::audit_log TO sigma_app;
GO
