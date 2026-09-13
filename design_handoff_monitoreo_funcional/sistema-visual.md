# Sistema visual · PulsoVial monitoreo

Todas las pantallas comparten estos valores. Implementarlos una vez, como tokens.

## Color

| Uso | Valor |
|---|---|
| Fondo página | `#0a0d13` + 2 radiales (`oklch(0.30 0.055 250 / .55)` en 12% -12%, `oklch(0.28 0.05 190 / .34)` en 92% 8%) + linear `oklch(0.165 0.018 262)` → `oklch(0.112 0.014 262)` |
| Superficie de panel | `linear-gradient(180deg, oklch(0.225 0.018 262 / .92), oklch(0.185 0.016 262 / .92))` |
| Elevación de panel | `inset 0 1px 0 oklch(1 0 0 / .07), 0 14px 40px oklch(0 0 0 / .32)` |
| Superficie de control | `oklch(0.28 0.02 262 / .80)` + `inset 0 0 0 1px oklch(1 0 0 / .07)` |
| Texto primario | `oklch(0.96 0.004 265)` |
| Texto secundario | `oklch(0.62 0.015 265)` |
| Texto terciario / ejes | `oklch(0.50 0.015 265)` |

### Semáforo

| Estado | Color |
|---|---|
| OK / operativo | `oklch(0.78 0.13 160)` |
| Degradado / atención | `oklch(0.82 0.13 62)` |
| Caído / crítico | `oklch(0.70 0.17 22)` |
| Informativo / neutro | `oklch(0.78 0.11 205)` |
| Sin dato / no instalado | transparente + `inset 0 0 0 1px oklch(0.34 0.012 265)` |

### Color por estación (constante única de la app)

| Estación | Color |
|---|---|
| KM 402 | `oklch(0.78 0.11 205)` |
| VIRU | `oklch(0.84 0.12 95)` |
| FORTALEZA | `oklch(0.78 0.13 160)` |
| HUARMEY | `oklch(0.78 0.13 45)` |
| SANTA | `oklch(0.76 0.10 300)` |

Nunca reasignar estos colores por pantalla: la estación se reconoce por color en seis vistas distintas.

## Tipografía

Manrope 300 / 400 / 500 / 600 / 700. JetBrains Mono solo para placas (comparación carácter a carácter).

| Rol | Tamaño / peso |
|---|---|
| Cifra KPI | 40–46px / 300, `letter-spacing: -0.035em` |
| Título de pantalla | 26px / 600 |
| Título de panel | 19px / 600 |
| Dato de tabla | 15px / 500–600 |
| Etiqueta de sección | 13px / 600, `uppercase`, `letter-spacing: .07em` |
| Eje de gráfico | 11–13px / 500 |

Todo número lleva `font-variant-numeric: tabular-nums`.

## Retícula

Página de 1920×1080, `padding: 22px 30px 24px`, `display: flex; flex-direction: column; gap: 13px`.

Bandas, de arriba a abajo: **topbar 52** · **título 40** · **KPI ~100–112** · una o dos filas de paneles de altura fija · un panel de tabla con `flex: 1`.

Radios: 20px tarjetas KPI · 22px paneles · 10–13px controles y chips.

## Componentes compartidos

- **Topbar**: hamburger 40×40 (radio 13) + wordmark + nav inline (tab activa `oklch(0.34 0.045 210 / .75)` con `inset 0 0 0 1px oklch(0.70 0.09 200 / .35)`) + chip EN VIVO + usuario + reloj 32px. Idéntico en las seis pantallas.
- **Segmented de rango**: contenedor `oklch(0.24 0.018 262 / .80)` con padding 4, pill activa ámbar sólida con texto oscuro.
- **Tabla**: cabecera 13px uppercase con `border-bottom: 1px solid oklch(1 0 0 / .07)`, filas con `justify-content: space-around` para repartirse el alto disponible; nunca scroll interno en vistas de muro.
- **Barra de progreso**: pista `oklch(1 0 0 / .06)`, relleno con gradiente del semáforo, altura 6–9px, `border-radius: 999px`.
- **Nota de contexto**: caja `oklch(0.32 0.04 210 / .45)` con punto de color; una frase que dice qué hacer con el dato.

## Gráficos

Sin librería: barras y apilados son divs con `height`/`width` en porcentaje. La única excepción es la evolución diaria de OCR (polilíneas SVG con `preserveAspectRatio="none"` y `vector-effect="non-scaling-stroke"`).

Reglas de eje:

- El contenedor de etiquetas del eje Y debe medir **exactamente** lo mismo que el área de barras; si hay franja de etiquetas X o nota al pie debajo, compensarlas con padding.
- Con escalas no lineales (log), posicionar cada etiqueta por su valor (`top = (1 − f(v)) * 100%`), no repartirlas con `space-between`.
- Los porcentajes de altura necesitan que el contenedor tenga altura definida (`height: 100%` en la columna), o resuelven a cero.
