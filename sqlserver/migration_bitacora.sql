-- ================================================
--  migration_bitacora.sql
--  Módulo Bitácora (registro de actividades de TI). Solo esquema: los catálogos iniciales
--  los siembra el backend al arrancar (BitacoraSeed, idempotente).
--  Idempotente — seguro de correr varias veces contra la BD ya viva.
--  ROLLBACK: ver migration_bitacora_rollback.sql
-- ================================================
USE red;
GO

-- ── Rol "ti" (equipo de TI): amplía el CHECK de usuarios.rol ──
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_usuarios_rol'
           AND definition NOT LIKE N'%''ti''%')
BEGIN
    ALTER TABLE dbo.usuarios DROP CONSTRAINT CK_usuarios_rol;
    ALTER TABLE dbo.usuarios ADD CONSTRAINT CK_usuarios_rol CHECK (rol IN ('admin','ti','viewer'));
END
GO

-- ── Catálogos (nunca se borran: Activo = 0) ──────────────────
IF OBJECT_ID('dbo.BitSede','U') IS NULL
CREATE TABLE dbo.BitSede (
    Id     INT           NOT NULL IDENTITY(1,1),
    Codigo NVARCHAR(10)  NOT NULL,
    Nombre NVARCHAR(100) NOT NULL,
    Tipo   NVARCHAR(20)  NOT NULL DEFAULT 'Peaje',
    Activo BIT           NOT NULL DEFAULT 1,
    CONSTRAINT PK_BitSede PRIMARY KEY (Id),
    CONSTRAINT UQ_BitSede_Codigo UNIQUE (Codigo)
);
GO

IF OBJECT_ID('dbo.BitCategoria','U') IS NULL
CREATE TABLE dbo.BitCategoria (
    Id        INT           NOT NULL IDENTITY(1,1),
    Nombre    NVARCHAR(100) NOT NULL,
    Segmento  NVARCHAR(30)  NOT NULL DEFAULT N'S. Operación',
    AplicaSla BIT           NULL,
    Activo    BIT           NOT NULL DEFAULT 1,
    CONSTRAINT PK_BitCategoria PRIMARY KEY (Id)
);
GO

IF OBJECT_ID('dbo.BitProveedor','U') IS NULL
CREATE TABLE dbo.BitProveedor (
    Id     INT           NOT NULL IDENTITY(1,1),
    Nombre NVARCHAR(100) NOT NULL,
    Activo BIT           NOT NULL DEFAULT 1,
    CONSTRAINT PK_BitProveedor PRIMARY KEY (Id)
);
GO

IF OBJECT_ID('dbo.BitPersonal','U') IS NULL
CREATE TABLE dbo.BitPersonal (
    Id             INT           NOT NULL IDENTITY(1,1),
    Nombre         NVARCHAR(100) NOT NULL,
    SedeBase       NVARCHAR(50)  NULL,
    UsuarioSigmaId INT           NULL,      -- enlace opcional con usuarios.id
    Activo         BIT           NOT NULL DEFAULT 1,
    CONSTRAINT PK_BitPersonal PRIMARY KEY (Id)
);
GO

IF OBJECT_ID('dbo.BitPalabraClave','U') IS NULL
CREATE TABLE dbo.BitPalabraClave (
    Id          INT          NOT NULL IDENTITY(1,1),
    Palabra     NVARCHAR(60) NOT NULL,      -- minúsculas y sin tildes
    SedeId      INT          NULL,
    CategoriaId INT          NULL,
    Activo      BIT          NOT NULL DEFAULT 1,
    CONSTRAINT PK_BitPalabraClave PRIMARY KEY (Id),
    CONSTRAINT FK_BitPalabraClave_Sede      FOREIGN KEY (SedeId)      REFERENCES dbo.BitSede(Id),
    CONSTRAINT FK_BitPalabraClave_Categoria FOREIGN KEY (CategoriaId) REFERENCES dbo.BitCategoria(Id)
);
GO

-- ── Registro ─────────────────────────────────────────────────
IF OBJECT_ID('dbo.BitRegistro','U') IS NULL
CREATE TABLE dbo.BitRegistro (
    Id                 INT           NOT NULL IDENTITY(1,1),
    Tipo               TINYINT       NOT NULL DEFAULT 1,   -- 1 = Actividad; 2 = Ticket (reservado)
    FechaActividad     DATETIME2     NOT NULL,
    Descripcion        NVARCHAR(500) NOT NULL,
    CategoriaId        INT           NOT NULL,
    ResponsableId      INT           NOT NULL,
    ProveedorId        INT           NULL,
    Solicitante        NVARCHAR(100) NULL,
    DuracionMin        INT           NULL,
    Estado             TINYINT       NOT NULL DEFAULT 1,   -- 1 = Hecho; 2 = En proceso
    EquipoRef          NVARCHAR(100) NULL,
    CreadoPorUsuarioId INT           NOT NULL,
    CreadoEn           DATETIME2     NOT NULL DEFAULT GETDATE(),
    ModificadoEn       DATETIME2     NOT NULL DEFAULT GETDATE(),
    Eliminado          BIT           NOT NULL DEFAULT 0,   -- borrado lógico
    CONSTRAINT PK_BitRegistro PRIMARY KEY (Id),
    CONSTRAINT FK_BitRegistro_Categoria   FOREIGN KEY (CategoriaId)   REFERENCES dbo.BitCategoria(Id),
    CONSTRAINT FK_BitRegistro_Responsable FOREIGN KEY (ResponsableId) REFERENCES dbo.BitPersonal(Id),
    CONSTRAINT FK_BitRegistro_Proveedor   FOREIGN KEY (ProveedorId)   REFERENCES dbo.BitProveedor(Id)
);
GO

IF OBJECT_ID('dbo.BitRegistroSede','U') IS NULL
CREATE TABLE dbo.BitRegistroSede (
    RegistroId INT NOT NULL,
    SedeId     INT NOT NULL,
    CONSTRAINT PK_BitRegistroSede PRIMARY KEY (RegistroId, SedeId),
    CONSTRAINT FK_BitRegistroSede_Registro FOREIGN KEY (RegistroId) REFERENCES dbo.BitRegistro(Id) ON DELETE CASCADE,
    CONSTRAINT FK_BitRegistroSede_Sede     FOREIGN KEY (SedeId)     REFERENCES dbo.BitSede(Id)
);
GO

IF OBJECT_ID('dbo.BitComentario','U') IS NULL
CREATE TABLE dbo.BitComentario (
    Id         INT           NOT NULL IDENTITY(1,1),
    RegistroId INT           NOT NULL,
    Texto      NVARCHAR(1000) NOT NULL,
    UsuarioId  INT           NOT NULL,
    Fecha      DATETIME2     NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_BitComentario PRIMARY KEY (Id),
    CONSTRAINT FK_BitComentario_Registro FOREIGN KEY (RegistroId) REFERENCES dbo.BitRegistro(Id)
);
GO

-- ── Índices ──────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_BitRegistro_Fecha')
CREATE INDEX IX_BitRegistro_Fecha ON dbo.BitRegistro (FechaActividad DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_BitRegistro_Categoria')
CREATE INDEX IX_BitRegistro_Categoria ON dbo.BitRegistro (CategoriaId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_BitRegistroSede_Sede')
CREATE INDEX IX_BitRegistroSede_Sede ON dbo.BitRegistroSede (SedeId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_BitComentario_Registro')
CREATE INDEX IX_BitComentario_Registro ON dbo.BitComentario (RegistroId);
GO

PRINT 'migration_bitacora.sql OK';
GO
