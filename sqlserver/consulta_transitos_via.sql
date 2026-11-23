-- Tránsitos de UNA vía con su medio de pago (BD consolidado).
-- Cambia los parámetros de abajo y ejecuta.
--   @estacion : 1=FORTALEZA 2=HUARMEY 3=402 4=VIRU 5=SANTA
--   @via      : número de vía (tra_nuvia)
--   @desde/@hasta : rango de fecha/hora (hasta exclusivo; NULL = sin tope)
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

DECLARE @estacion INT      = 3;
DECLARE @via      INT      = 1;
DECLARE @desde    DATETIME = DATEADD(MINUTE, -30, GETDATE());
DECLARE @hasta    DATETIME = NULL;   -- NULL = sin límite superior (trae hasta el último tránsito)

-- 0) Diagnóstico: último tránsito de la vía vs. hora del servidor.
--    Si UltimoTransito > HoraServidor, la hora de los tránsitos va adelantada
--    (zona horaria distinta) y por eso un tope GETDATE() los dejaba fuera.
SELECT MAX(tra_fecha) AS UltimoTransito, GETDATE() AS HoraServidor
FROM transitos WHERE tra_coest = @estacion AND tra_nuvia = @via;

-- 1) Detalle: un renglón por tránsito
SELECT
    CONVERT(varchar(19), t.tra_fecha, 120)                       AS Fecha,
    CASE t.tra_coest WHEN 1 THEN 'FORTALEZA' WHEN 2 THEN 'HUARMEY'
         WHEN 3 THEN '402' WHEN 4 THEN 'VIRU' WHEN 5 THEN 'SANTA' END AS Estacion,
    ISNULL(vd.via_nombr, 'Via ' + CAST(t.tra_nuvia AS VARCHAR))  AS Via,
    t.tra_ticke                                                  AS Ticket,
    t.tra_senti                                                  AS Sentido,
    ISNULL(t.tra_paten, '')                                      AS Placa,
    ISNULL(C.cfa_catde, CAST(t.tra_tarif AS VARCHAR(30)))        AS Categoria,
    t.tra_tipop                                                  AS CodMedio,
    CASE t.tra_tipop
        WHEN 'E' THEN 'Efectivo'
        WHEN 'T' THEN 'Tag'
        WHEN 'S' THEN 'Tarjeta'
        WHEN 'O' THEN 'Por placa'
        WHEN 'X' THEN 'Exento'
        ELSE 'Otros (' + ISNULL(t.tra_tipop, '?') + ')' END      AS MedioPago,
    CASE WHEN t.tra_subfp = 1 THEN 'SI' ELSE 'NO' END            AS Prepago,
    ISNULL(t.tra_titra, '')                                      AS TipoTransito,
    ISNULL(t.tra_id, '')                                         AS Cobrador
FROM transitos t
LEFT JOIN viadef vd ON t.tra_coest = vd.via_coest AND t.tra_nuvia = vd.via_nuvia
LEFT JOIN catfau C  ON t.tra_tarif = C.cfa_tarif AND C.cfa_coest IS NULL
WHERE t.tra_coest = @estacion
  AND t.tra_nuvia = @via
  AND t.tra_fecha >= @desde AND (@hasta IS NULL OR t.tra_fecha < @hasta)
ORDER BY t.tra_fecha DESC;

-- 2) Resumen por medio de pago
SELECT
    CASE t.tra_tipop WHEN 'E' THEN 'Efectivo' WHEN 'T' THEN 'Tag' WHEN 'S' THEN 'Tarjeta'
         WHEN 'O' THEN 'Por placa' WHEN 'X' THEN 'Exento'
         ELSE 'Otros (' + ISNULL(t.tra_tipop, '?') + ')' END     AS MedioPago,
    COUNT(*)                                                     AS Transitos,
    SUM(CASE WHEN t.tra_subfp = 1 THEN 1 ELSE 0 END)             AS Prepago
FROM transitos t
WHERE t.tra_coest = @estacion AND t.tra_nuvia = @via
  AND t.tra_fecha >= @desde AND (@hasta IS NULL OR t.tra_fecha < @hasta)
GROUP BY t.tra_tipop
ORDER BY Transitos DESC;
