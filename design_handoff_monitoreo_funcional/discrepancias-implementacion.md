# Discrepancias DAC — guía de implementación

Fuente de verdad visual: `Discrepancias DAC v2.dc.html` (1920×1080). Misma familia que `NOC - Estado en tiempo real v2.dc.html`.

## Tokens (idénticos al NOC — no inventar nuevos)

| Uso | Valor |
|---|---|
| Fondo página | `#0a0d13` + 2 radiales (`oklch(0.30 0.055 250 / .55)` 12% -12%, `oklch(0.28 0.05 190 / .34)` 92% 8%) + linear `oklch(0.165 0.018 262)` → `oklch(0.112 0.014 262)` |
| Superficie panel | `linear-gradient(180deg, oklch(0.225 0.018 262 / .92), oklch(0.185 0.016 262 / .92))` |
| Borde/elevación panel | `inset 0 1px 0 oklch(1 0 0 / .07), 0 14px 40px oklch(0 0 0 / .32)` |
| Radio | 20px KPI · 22px paneles · 10–13px chips |
| Tipografía | Manrope 300/500/600/700; números `font-variant-numeric: tabular-nums` |
| Texto | primario `oklch(0.96 0.004 265)` · secundario `oklch(0.62 0.015 265)` · terciario `oklch(0.50 0.015 265)` |
| Semáforo | ok `oklch(0.78 0.13 160)` · warn `oklch(0.82 0.13 62)` · crítico `oklch(0.70 0.17 22)` · info `oklch(0.78 0.11 205)` |

**Color por estación** (único para toda la app, exportar como constante):
`402 oklch(0.78 0.11 205)` · `VIRU oklch(0.84 0.12 95)` · `FORTALEZA oklch(0.78 0.13 160)` · `HUARMEY oklch(0.78 0.13 45)` · `SANTA oklch(0.76 0.10 300)`.

## Estructura (flex column, gap 14, padding 22/30/24)

1. **Topbar 52px** — hamburger (40×40, radio 13) → abre drawer de navegación; wordmark; nav inline con tab activa en `oklch(0.34 0.045 210 / .75)` + inset ring; a la derecha chip EN VIVO, usuario, reloj 32px.
2. **Título 40px** — H1 + subtítulo explicativo; a la derecha selector de rango como segmented (pill activa ámbar sólida, texto oscuro).
3. **KPI 112px** — grid `1.05fr .78fr .78fr 2.1fr`: Efectividad (con barra de progreso mapeada 85→100%), Discrepancias, Tránsitos, y panel “Por estación” con 5 mini-barras.
4. **Fila media 350px** — grid `1fr 1.7fr 1.05fr`: Top confusiones (barras horizontales, color por severidad), Tendencia por estación (barras apiladas 25 cortes de 30 min, tope 80), Vías críticas (ranking con barra, % coloreado por umbral).
5. **Fila inferior flex:1** — grid `1.45fr 1fr`: tabla conmutable (Prioridad de mantenimiento ⇄ Detalle de discrepancias) + Tasa de error por hora (24 barras, pico en rojo, valle en cian) con nota al pie.

## Reglas de datos

- **Efectividad** = `1 − discrepancias / tránsitos` del rango. La barra mapea 85–100%, no 0–100 (si no, no se percibe variación).
- **Umbrales de vía**: ≥15% crítico (rojo), ≥10% alerta (ámbar), resto neutro. El mismo umbral debe alimentar la celda DAC del NOC.
- **Δ variación** en mantenimiento: ≥1.0 pp rojo, resto ámbar. Nunca verde: es un empeoramiento.
- **Confusiones**: ancho relativo al máximo del período; ≥150 rojo, ≥80 ámbar, resto azul.
- Todos los números de los KPI derivan del mismo dataset que pinta los gráficos — no hardcodear totales.

## Notas de build

- Sin librería de charts: barras son divs con `height`/`width` en % — suficiente para barras apiladas y series horarias, y evita el peso de una lib en un muro.
- Todo el tablero es de solo lectura salvo: hamburger, tabs de nav, selector de rango, exportar PDF y el conmutador del panel inferior.
- Endpoints sugeridos: `GET /dac/resumen?rango=`, `/dac/tendencia?rango=&bucket=30m`, `/dac/confusiones?rango=`, `/dac/vias?rango=`, `/dac/mantenimiento?semanas=2`, `/dac/error-horario?dias=7`, `/dac/detalle?rango=&page=`.
- Refresco 60 s con `stale-while-revalidate`: repintar sin limpiar el layout (evitar saltos en el muro).
