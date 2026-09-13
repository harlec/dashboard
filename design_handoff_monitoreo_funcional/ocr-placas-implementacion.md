# OCR · Lectura de placas — guía de implementación

Fuente de verdad visual: `OCR Placas v2.dc.html` (1920×1080). Hereda los tokens de `design_handoff_monitoreo_funcional/discrepancias-implementacion.md` — fondo, superficies, radios, Manrope, color por estación. Solo se documenta aquí lo propio de esta pantalla.

## Cambio estructural respecto a la maqueta original

La versión previa apilaba ranking + tabs + contenido en una página con scroll largo. Aquí **todo entra en una sola pantalla**: el ranking pasa a ser la primera pestaña, no un bloque fijo sobre las tabs. Cinco vistas, una sola altura:

`Ranking de vías` · `Análisis de caracteres` · `Tendencias 30 d` · `Evolución por vía` · `Detalle de registros`

Estado local: `tab`, `rango`, `ventana` (30/60/90 d), `prepago`. Nada de esto va en la URL salvo `tab` y `rango` (deep-link a una vista).

## Retícula (flex column, gap 13, padding 22/30/24)

1. Topbar 52px — hamburger + nav (tab activa `OCR Placas`) + EN VIVO + reloj. Idéntico a Discrepancias: **extraer como componente compartido**.
2. Título 40px — H1 + subtítulo; a la derecha toggle `Solo prepago` y segmented de rango.
3. KPI 100px — 5 tarjetas: Total con placa · Aciertos · No detectadas · Errores OCR · Efectividad. Cada una con fondo propio del semáforo.
4. Tabs 38px — pill activa `oklch(0.32 0.04 210 / .70)` + inset ring.
5. Contenido `flex: 1` — una vista por pestaña, sin scroll interno.

## Reglas de datos y color

- **Efectividad = aciertos / total con placa.** El denominador es solo tránsitos con placa tabulada; no usar el total de tránsitos.
- **Dos tipos de error, nunca mezclados en una sola barra plana**: `no detectada` (rojo) y `confusión de caracteres` (ámbar). En el ranking van apilados en la misma barra, escalados sobre un máximo de 45% para que las vías medias no queden planas.
- **Umbrales de % error de vía**: ≥30 rojo intenso · ≥20 rojo · ≥12 ámbar · resto verde.
- **Heatmap vía × hora**: 4 buckets (<10 / 10–20 / 20–35 / >35%). Celda sin datos = `oklch(1 0 0 / .035)`, nunca verde — ausencia no es buen desempeño.
- **Efectividad por hora**: ≥85% verde, ≥72% ámbar, resto rojo. El patrón nocturno es iluminación, no calibración: la nota al pie debe decirlo.
- **Caracteres**: solo sustituciones de misma longitud (si cambia la longitud es otro tipo de fallo). El carácter erróneo se resalta con chip sólido, no con color de texto — a distancia el color solo no se distingue.
- **Placas siempre en monoespaciada** (JetBrains Mono, `letter-spacing: .06em`): la comparación carácter a carácter es el propósito de la tabla.

## Notas de build

- La única gráfica en SVG es la evolución diaria (3 polilíneas, `preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"`). Todo lo demás son divs con `%`.
- El heatmap son 28×24 = 672 divs; con `flex: 1 1 0` en filas y celdas se adapta solo al alto disponible. Si la lista de vías crece, paginar por estación antes que reducir la celda por debajo de 8px.
- Endpoints sugeridos: `GET /ocr/resumen?rango=&prepago=`, `/ocr/vias?rango=`, `/ocr/caracteres?dias=30`, `/ocr/pares?dias=30`, `/ocr/heatmap?dias=30`, `/ocr/evolucion?via=&dias=`, `/ocr/registros?rango=&estacion=&tipo=&placa=&page=`.
- Los filtros de `Detalle de registros` (estación, tipo, placa) están maquetados pero sin lógica: implementarlos server-side con paginación — 7,907 registros no se filtran en cliente.
