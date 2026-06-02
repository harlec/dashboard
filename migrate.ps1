# ============================================================
#  migrate.ps1 — Convierte dump MySQL red.sql a T-SQL
#  Uso desde v2\:  .\migrate.ps1
#  Uso con ruta:   .\migrate.ps1 -InputFile "C:\ruta\red.sql"
# ============================================================
param(
    [string]$InputFile  = "..\index_sin_parpadeo\red.sql",
    [string]$OutputFile = "sqlserver\migration_data.sql"
)

# ── Verificar política de ejecución ────────────────────────
# Si el script no corre, ejecuta primero en PowerShell (admin no necesario):
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# ── Verificar archivo de entrada ───────────────────────────
$resolvedInput = Resolve-Path $InputFile -ErrorAction SilentlyContinue
if (-not $resolvedInput) {
    Write-Host ""
    Write-Host "ERROR: No se encontro el archivo: $InputFile" -ForegroundColor Red
    Write-Host "Usa: .\migrate.ps1 -InputFile 'C:\ruta\completa\red.sql'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=== Migrador MySQL -> SQL Server ===" -ForegroundColor Cyan
Write-Host "Entrada : $resolvedInput" -ForegroundColor Gray
Write-Host "Salida  : $OutputFile" -ForegroundColor Gray
Write-Host ""

# ── Tablas con columna IDENTITY (auto-increment en MySQL) ──
$identityTables = @(
    'camaras_heartbeat','enlace_eventos','equipos','estaciones',
    'incidentes','izipay_monitor','pc_health','ping_log',
    'servidor_alertas','servidor_discos','servidor_metricas',
    'tipos_equipo','usuarios','vias'
)

# ── Leer el dump ────────────────────────────────────────────
Write-Host "Leyendo archivo..." -NoNewline
$allLines = [System.IO.File]::ReadAllLines($resolvedInput.Path,
    [System.Text.Encoding]::UTF8)
Write-Host " $($allLines.Count) lineas" -ForegroundColor Green

# ── Salida ──────────────────────────────────────────────────
$out = [System.Text.StringBuilder]::new(30 * 1024 * 1024)

[void]$out.AppendLine("-- ================================================")
[void]$out.AppendLine("--  migration_data.sql  (generado por migrate.ps1)")
[void]$out.AppendLine("-- ================================================")
[void]$out.AppendLine("USE red;")
[void]$out.AppendLine("GO")
[void]$out.AppendLine("")

$currentTable   = ""
$inInsert       = $false
$insertHeader   = ""
$batchRows      = [System.Collections.Generic.List[string]]::new()
$MAX_BATCH      = 500
$totalInserts   = 0
$lineNum        = 0

foreach ($rawLine in $allLines) {
    $lineNum++
    if ($lineNum % 3000 -eq 0) {
        $pct = [int]($lineNum / $allLines.Count * 100)
        Write-Progress -Activity "Procesando" -Status "$pct%" -PercentComplete $pct
    }

    $l = $rawLine.Trim()

    # ── Vacías y comentarios ──────────────────────────────
    if ($l -eq "") { continue }
    if ($l.StartsWith("--"))  { continue }
    if ($l.StartsWith("/*"))  { continue }

    # ── Comandos MySQL que no aplican en SQL Server ───────
    if ($l -match "^(SET |START TRANSACTION|COMMIT|UNLOCK TABLES|LOCK TABLES)") { continue }

    # ── CREATE TABLE / ALTER TABLE / DROP TABLE → saltar ─
    if ($l -match "^(CREATE TABLE|ALTER TABLE|DROP TABLE|KEY |PRIMARY KEY|UNIQUE KEY|ENGINE=|CHARACTER SET|COLLATE |AUTO_INCREMENT=)") {
        $inInsert = $false
        continue
    }

    # ── Fin de bloque CREATE TABLE ────────────────────────
    if ($l -match "^\) ENGINE") { $inInsert = $false; continue }

    # ── INSERT INTO `tabla` (`col1`,`col2`) VALUES ────────
    if ($l -match "^INSERT INTO ``(\w+)``") {
        $tableName = $Matches[1]

        # Flush batch de tabla anterior si existe
        if ($batchRows.Count -gt 0 -and $insertHeader -ne "") {
            [void]$out.AppendLine($insertHeader)
            [void]$out.Append($batchRows[0])
            for ($r = 1; $r -lt $batchRows.Count; $r++) {
                [void]$out.Append(",`n")
                [void]$out.Append($batchRows[$r])
            }
            [void]$out.AppendLine(";")
            [void]$out.AppendLine("GO")
            $batchRows.Clear()
            $totalInserts++
        }

        # Cerrar IDENTITY_INSERT de tabla anterior
        if ($currentTable -ne "" -and $currentTable -ne $tableName -and
            $identityTables -contains $currentTable) {
            [void]$out.AppendLine("SET IDENTITY_INSERT [$currentTable] OFF;")
            [void]$out.AppendLine("GO")
            [void]$out.AppendLine("")
        }

        # Abrir IDENTITY_INSERT de tabla nueva
        if ($tableName -ne $currentTable) {
            [void]$out.AppendLine("-- Tabla: $tableName")
            if ($identityTables -contains $tableName) {
                [void]$out.AppendLine("SET IDENTITY_INSERT [$tableName] ON;")
            }
            $currentTable = $tableName
        }

        # Construir cabecera del INSERT: quitar backticks de columnas
        $cleanLine = $l -replace "``", ""
        # Quitar la parte VALUES... del final para reconstruir
        if ($cleanLine -match "^(INSERT INTO \[\w+\] \([^)]+\) VALUES)(.*)") {
            $insertHeader = $Matches[1]
            $restOfLine   = $Matches[2].Trim().TrimEnd(';').TrimEnd(',')
            if ($restOfLine -ne "") {
                $restOfLine = $restOfLine -replace "\\'", "''"
                $batchRows.Add($restOfLine)
            }
        } else {
            $insertHeader = $cleanLine
        }
        $inInsert = $true
        continue
    }

    # ── Filas de valores: líneas que empiezan con ( ───────
    if ($inInsert -and $l -match "^\(") {
        $row = $l.TrimEnd(';').TrimEnd(',').Trim()
        # Convertir escape de strings: \' → '' (MySQL → SQL Server)
        $row = $row -replace "\\'", "''"
        $batchRows.Add($row)

        # Flush si alcanzamos el límite de batch
        if ($batchRows.Count -ge $MAX_BATCH) {
            [void]$out.AppendLine($insertHeader)
            [void]$out.Append($batchRows[0])
            for ($r = 1; $r -lt $batchRows.Count; $r++) {
                [void]$out.Append(",`n")
                [void]$out.Append($batchRows[$r])
            }
            [void]$out.AppendLine(";")
            [void]$out.AppendLine("GO")
            $batchRows.Clear()
            $totalInserts++
        }
        continue
    }

    # Si llegamos a una línea que no es fila ni INSERT, cerramos bloque
    if ($inInsert -and $batchRows.Count -gt 0) {
        [void]$out.AppendLine($insertHeader)
        [void]$out.Append($batchRows[0])
        for ($r = 1; $r -lt $batchRows.Count; $r++) {
            [void]$out.Append(",`n")
            [void]$out.Append($batchRows[$r])
        }
        [void]$out.AppendLine(";")
        [void]$out.AppendLine("GO")
        $batchRows.Clear()
        $totalInserts++
        $inInsert = $false
    }
}

# ── Flush final ────────────────────────────────────────────
if ($batchRows.Count -gt 0 -and $insertHeader -ne "") {
    [void]$out.AppendLine($insertHeader)
    [void]$out.Append($batchRows[0])
    for ($r = 1; $r -lt $batchRows.Count; $r++) {
        [void]$out.Append(",`n")
        [void]$out.Append($batchRows[$r])
    }
    [void]$out.AppendLine(";")
    [void]$out.AppendLine("GO")
    $totalInserts++
}

if ($currentTable -ne "" -and $identityTables -contains $currentTable) {
    [void]$out.AppendLine("SET IDENTITY_INSERT [$currentTable] OFF;")
    [void]$out.AppendLine("GO")
}

Write-Progress -Activity "Procesando" -Completed

# ── Escribir salida ────────────────────────────────────────
[System.IO.File]::WriteAllText(
    (Join-Path (Get-Location) $OutputFile),
    $out.ToString(),
    [System.Text.Encoding]::UTF8)

$sizeKb = [int]((Get-Item $OutputFile).Length / 1024)
Write-Host ""
Write-Host "LISTO:" -ForegroundColor Green -NoNewline
Write-Host " $OutputFile  ($sizeKb KB, $totalInserts bloques INSERT)"
Write-Host ""
Write-Host "Siguiente: importar a SQL Server con:" -ForegroundColor Yellow
Write-Host '  docker compose cp sqlserver\migration_data.sql sqlserver:/migration.sql'
Write-Host '  docker compose exec sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "TU_PASSWORD" -d red -i /migration.sql -C'
