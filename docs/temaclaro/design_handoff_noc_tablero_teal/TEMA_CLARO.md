# Tema claro — NOC Tablero analítico teal

Añadido al handoff existente. El tema oscuro ya está implementado; esto agrega **solo el tema claro**. Estructura, medidas, tipografía, simulación, transiciones y navegación son **idénticas** — sólo cambian colores.

Referencia visual: `NOC - Tablero analitico teal claro.dc.html` (en esta carpeta).

## Cómo implementarlo

1. **Extraer colores a tokens de tema.** Reemplazar cada color literal del tema oscuro por una variable (CSS custom properties, o el objeto de tema del framework). Incluye los colores generados en JS (barras rayadas, `glow()`, deltas ▲/▼, arcos, nodos de topología).
2. **Dos juegos de valores**: `[data-theme="oscuro"]` (valores actuales) y `[data-theme="claro"]` (tabla abajo).
3. **Selector de tema**: atributo en el contenedor raíz + persistencia (`localStorage` o preferencia de usuario). Opcional: respetar `prefers-color-scheme` como valor inicial.
4. **No duplicar componentes.** Un solo árbol de componentes; el tema solo cambia tokens.

## Regla de conversión (para cualquier color no listado)

Todos los colores están en oklch `(L C H / α)`. El tono **H se conserva siempre**. Aplicar:

| Caso | Regla |
|---|---|
| Sombras (L < 0.12) | `L=0.40, C=0.03`, α × 0.25 (sin α → 0.12) |
| Superficies, bordes, tintes (L < 0.45) | `L' = 0.995 − (L − 0.12) × 0.36`, `C' = C × 0.7` |
| Acentos / semánticos (L ≥ 0.45, C ≥ 0.06) | `L' = 0.95 − L × 0.55`, `C' = min(C × 1.1, 0.17)` |
| Texto neutro (L ≥ 0.45, C < 0.06) | `L' = max(0.20, 1.15 − L)`, `C' = max(C, 0.012)` |
| `#04100f`, `#061413` | `oklch(0.965 0.008 190)` |

Helper sugerido (TS):
```ts
export function aClaro(L: number, C: number, H: number, a?: number) {
  if (L < 0.12) return { L: 0.40, C: 0.03, H, a: (a ?? 0.48) * 0.25 };
  if (L < 0.45) return { L: 0.995 - (L - 0.12) * 0.36, C: C * 0.7, H, a };
  if (C >= 0.06) return { L: 0.95 - L * 0.55, C: Math.min(C * 1.1, 0.17), H, a };
  return { L: Math.max(0.2, 1.15 - L), C: Math.max(C, 0.012), H, a };
}
```
Útil si los colores dinámicos (barras, glows, severidad) se calculan en código: pasar el color base por `aClaro()` cuando el tema sea claro.

## Tokens principales

| Token | Oscuro (actual) | Claro |
|---|---|---|
| Tinta base | `oklch(0.965 0.006 190)` | `oklch(0.2 0.012 190)` |
| Fondo página | `#061413` | `oklch(0.965 0.008 190)` |
| Glow fondo 1 | `oklch(0.33 0.045 185 / 0.65)` | `oklch(0.919 0.032 185 / 0.65)` |
| Glow fondo 2 | `oklch(0.30 0.040 200 / 0.45)` | `oklch(0.93 0.028 200 / 0.45)` |
| Glow fondo 3 | `oklch(0.26 0.035 190 / 0.55)` | `oklch(0.945 0.025 190 / 0.55)` |
| Tarjeta grad. inicio | `oklch(0.250 0.030 190)` | `oklch(0.948 0.021 190)` |
| Tarjeta grad. fin | `oklch(0.185 0.024 190)` | `oklch(0.972 0.017 190)` |
| Borde tarjeta | `oklch(0.340 0.030 190)` | `oklch(0.916 0.021 190)` |
| Sombra tarjeta | `oklch(0.09 0.02 190 / 0.55)` | `oklch(0.4 0.03 190 / 0.138)` |
| Sombra KPI | `oklch(0.06 0.02 190 / 0.5)` | `oklch(0.4 0.03 190 / 0.125)` |
| Tile interior | `oklch(0.215 0.026 190)` | `oklch(0.961 0.018 190)` |
| Borde tile | `oklch(0.310 0.028 190)` | `oklch(0.927 0.02 190)` |
| Divisor | `oklch(0.325 0.026 190)` | `oklch(0.921 0.018 190)` |
| Pista arco/barras | `oklch(0.215 0.024 190)` | `oklch(0.961 0.017 190)` |
| Texto secundario | `oklch(0.820 0.018 190)` | `oklch(0.33 0.018 190)` |
| Texto apagado | `oklch(0.700 0.020 190)` | `oklch(0.45 0.02 190)` |
| Texto tenue | `oklch(0.640 0.020 190)` | `oklch(0.51 0.02 190)` |
| VERDE | `oklch(0.800 0.150 172)` | `oklch(0.51 0.165 172)` |
| AMBAR | `oklch(0.820 0.110 78)` | `oklch(0.499 0.121 78)` |
| ROJO | `oklch(0.680 0.190 18)` | `oklch(0.576 0.17 18)` |
| CIAN | `oklch(0.760 0.090 200)` | `oklch(0.532 0.099 200)` |
| LILA | `oklch(0.680 0.120 305)` | `oklch(0.576 0.132 305)` |
| Marca SIGMA | `oklch(0.860 0.100 195)` | `oklch(0.477 0.11 195)` |
| Chip ámbar texto | `oklch(0.860 0.100 75)` | `oklch(0.477 0.11 75)` |
| Chip ámbar fondo | `oklch(0.290 0.045 75)` | `oklch(0.934 0.032 75)` |
| Chip EN VIVO fondo | `oklch(0.300 0.055 172)` | `oklch(0.93 0.038 172)` |

## Notas
- **Halos / text-shadow** de cifras (`glow()`): en claro usan el acento convertido; si se ven sucios, reducir α a la mitad o quitarlos.
- **Rayado** de barras: mismo patrón, color convertido; el hueco sigue `transparent`.
- **Línea meta** (punteada ámbar) y **deltas ▲/▼** usan VERDE/ROJO convertidos.
- Contraste: texto ≥ 4.5:1 sobre tarjeta (verificado con la regla de texto neutro).
