#!/bin/bash
# Inicia SQL Server y corre init.sql automáticamente al primer arranque
set -e

INIT_FLAG="/var/opt/mssql/.initialized"

# Iniciar SQL Server en background
/opt/mssql/bin/sqlservr &
SQL_PID=$!

# Esperar hasta que SQL Server responda (hasta 90 segundos)
echo "Esperando SQL Server..."
for i in $(seq 1 45); do
    if /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" \
        -Q "SELECT 1" -b -o /dev/null -C 2>/dev/null; then
        echo "SQL Server listo (intento $i)"
        break
    fi
    echo "  Intento $i/45..."
    sleep 2
done

# Ejecutar init.sql solo una vez (primer arranque)
if [ ! -f "$INIT_FLAG" ]; then
    echo "Ejecutando init.sql..."
    /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" \
        -d master -i /init.sql -C -b
    touch "$INIT_FLAG"
    echo "Base de datos inicializada correctamente"
else
    echo "Base de datos ya inicializada — saltando init.sql"
fi

# Mantener SQL Server en primer plano
wait $SQL_PID
