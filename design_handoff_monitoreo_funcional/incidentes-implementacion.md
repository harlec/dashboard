# Incidentes de red — guía de implementación

Fuente de verdad visual: `Incidentes v2.dc.html` (1920×1080). Tokens heredados de `discrepancias-implementacion.md` (fondo, superficies, radios, Manrope, color por estación). Topbar con hamburger idéntico a Discrepancias y OCR: **mismo componente compartido**.

## El cambio importante: la ráfaga

La maqueta original mostraba 2,030 incidentes como si fueran 2,030 fallas independientes. No lo son: 1,411 ocurrieron entre las 01:28 y 01:29 del 12/09, en 7 estaciones a la vez — es **una caída de enlace**. Dos consecuencias de diseño:

- Una tarjeta KPI dedicada, **Ráfaga dominante**, que dice el porcentaje del período y la ventana temporal. Es la primera lectura de la pantalla.
- El backend debe agrupar por ráfaga: incidentes del mismo minuto en ≥3 estaciones = un evento padre. La tabla puede seguir listando hijos, pero los KPI y la tendencia necesitan el conteo agrupado además del crudo.

## Retícula (flex column, gap 13, padding 22/30/24)

1. Topbar 52 · 2. Título 40 (+ segmented Hoy / 7 días / 30 días) · 3. KPI 98 (En el período · Activos ahora · MTTR · Ráfaga dominante) · 4. Fila 288 (Por estación · Tendencia diaria · Vías más afectadas) · 5. Fila 196 (Por hora del día · Causas) · 6. Historial `flex: 1`.

## Reglas de datos y color

- **Tendencia diaria en escala logarítmica** (`log10(v+1) / log10(2001)`). Con eje lineal la ráfaga de 1,411 deja los otros siete días en 1px — que es exactamente lo que pasaba en la maqueta original. El eje va rotulado 0 / 20 / 200 / 2000 y el subtítulo declara la escala: un eje log sin avisar es engañoso.
- **Por hora del día excluye la ráfaga.** Si no, el histograma solo muestra el minuto 01:28. El subtítulo lo dice explícitamente.
- **Barras**: máximo del período en rojo, ≥55% del máximo en ámbar, resto azul apagado. El azul es "volumen normal", no "bueno".
- **Duración**: un incidente sin cierre muestra `activo` en ámbar, nunca `0m` — la maqueta original mostraba `0m` para eventos abiertos, que se lee como resuelto al instante.
- **Tipo**: `Real` en rojo, `Falso` (falso positivo del agente) en gris neutro; no compiten por atención.
- **Causas**: el texto del agente se muestra crudo pero truncado con ellipsis; el detalle completo va en el tooltip/expansión de fila.

## Interacción

- Selección de filas por clic en cualquier parte de la fila (no solo el checkbox — objetivo de 19px es muy chico para un muro). `Etiquetar seleccionados (n)` se activa solo con selección; en cero queda apagado y sin sombra.
- `Solo activos` es un toggle de estado, no un checkbox suelto.
- Filtro de estación y la acción de etiquetado están maquetados sin lógica: implementar server-side con paginación (2,026 registros).

## Endpoints sugeridos

`GET /incidentes/resumen?rango=` · `/incidentes/por-estacion?rango=` · `/incidentes/tendencia?rango=&agrupar=rafaga` · `/incidentes/vias?rango=` · `/incidentes/por-hora?rango=&excluir_rafagas=true` · `/incidentes/causas?rango=` · `/incidentes/historial?rango=&estacion=&activos=&page=` · `POST /incidentes/etiquetar` (lote de ids + etiqueta).
