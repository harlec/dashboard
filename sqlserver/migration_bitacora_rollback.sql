-- ================================================
--  migration_bitacora_rollback.sql
--  BORRA el módulo Bitácora y TODOS sus datos. Haz un BACKUP antes.
--  Idempotente. El rol "ti" de usuarios no se toca (reasigna esos usuarios a 'viewer' si hace falta).
-- ================================================
USE red;
GO
DROP TABLE IF EXISTS dbo.BitComentario;
DROP TABLE IF EXISTS dbo.BitRegistroSede;
DROP TABLE IF EXISTS dbo.BitRegistro;
DROP TABLE IF EXISTS dbo.BitPalabraClave;
DROP TABLE IF EXISTS dbo.BitPersonal;
DROP TABLE IF EXISTS dbo.BitProveedor;
DROP TABLE IF EXISTS dbo.BitCategoria;
DROP TABLE IF EXISTS dbo.BitSede;
GO
PRINT 'rollback bitacora OK';
GO
