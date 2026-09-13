# Reporte SLA — guía de implementación

Fuente de verdad: `pantallas/Reporte SLA v2.dc.html` (1920×1080). Tokens heredados de `discrepancias-implementacion.md`.

## Retícula

Topbar 52 · Título 40 (período + peaje + Consultar) · KPI 106 (`1.45fr` uptime global + 5 tarjetas de estación) · Fila 236 (Equipos fuera de SLA · Por tipo de equipo · A qué se fue el tiempo caído) · Detalle por equipo `flex: 1`.

## Reglas de datos

- **La barra de uptime mapea 90–100%, no 0–100.** Todo el rango útil vive entre 93% y 100%; con escala completa las cinco estaciones se ven idénticas.
- **Umbrales**: ≥99.5% (meta) verde · ≥97% ámbar · <97% rojo. El mismo corte aplica en tarjetas, tipos y tabla.
- **Uptime global es promedio ponderado por número de equipos**, no promedio simple de las 5 estaciones. Con 200 equipos repartidos desigualmente la diferencia es real.
- **Mantenimiento programado se muestra pero se puede excluir.** El 52% del tiempo caído es cambio de UPS; el panel de motivos lo dice y el reporte exportable trae el toggle. Definir con el cliente cuál cifra es la contractual.
- **`0m` nunca para un evento abierto** — igual que en Incidentes.
- La columna "Motivo principal" trunca con ellipsis; el texto completo va en la expansión de fila.

## Endpoints

`GET /sla/resumen?desde=&hasta=&peaje=` · `/sla/por-estacion` · `/sla/por-tipo` · `/sla/motivos` · `/sla/equipos?orden=&page=` · `/sla/export?formato=csv|pdf`
