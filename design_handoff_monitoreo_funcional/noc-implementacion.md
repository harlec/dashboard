# NOC · Estado en tiempo real — guía de implementación

Fuente de verdad: `pantallas/NOC - Estado en tiempo real v2.dc.html` (1920×1080). Tokens en `sistema-visual.md`.

## El modelo del grid

Es la pantalla que fija el vocabulario de estados del resto del sistema. 200 equipos en campo, agrupados por estación.

**Cada vía es una columna-tira**, no una fila de cuadritos repetidos:

- Arriba, **el número de vía una sola vez**, coloreado por el **peor estado** de todo lo que cuelga de esa vía.
- Debajo, los equipos como pips **sin texto**: PC vía · PC OCR · Display tarifario · Cámara OCR · Cámara validación.
- Al final de la tira, **DAC**: el % de discrepancia de esa vía, siempre visible en número.
- La tira completa se tiñe de ámbar cuando algo dentro falla, así el ojo encuentra primero *qué vía* y después *qué equipo*.

Debajo del bloque de tiras, una fila aparte para **PMV** (no pertenece a una vía).

## Reglas

- **El color se gasta en lo que está mal.** Operativo es un verde translúcido muy apagado; degradado y caído llevan gradiente sólido con glow. Un grid de 200 chips verde saturado no tiene foco.
- **No repetir el número de vía en cada celda.** Vivía siete veces por columna y era puro ruido.
- **Sin dato ≠ bien**: "no instalado" es transparente con borde tenue, nunca verde ni gris relleno.
- **DAC nunca pinta rojo** — como mucho ámbar: es un degradado de calidad, no una caída. Umbral ámbar en 7%.
- **DAC muestra `—` solo si el PC de vía está caído** (sin PC no hay conteo que comparar). En cualquier otra falla el % sigue siendo válido y debe verse.
- **Los KPI se calculan del mismo dataset que dibuja el grid**: operativos/instalados, caídos, degradados y su desglose por tipo. Nada escrito a mano.
- El DAC se cuenta **aparte** del KPI de degradados y así se declara en el subtítulo.
- La leyenda debe coincidir exactamente con los pips reales del grid, incluido el chip de "operativo".

## Umbrales compartidos

El umbral de DAC por vía (7% ámbar) es el mismo que alimenta la vista Discrepancias. El de error OCR por vía (≥12% ámbar, ≥20% rojo) es el de OCR de placas. Un solo lugar en el código para ambos.

## Endpoints

`GET /noc/estado` (equipos con estado por estación/vía/tipo) · `/noc/dac?ventana=` · `/noc/disponibilidad?dias=30`

Refresco en vivo cada 30–60 s, repintando sin remontar el grid (evitar saltos en el muro).
