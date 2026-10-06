# Handoff: SIGMA — Tablero NOC

**SIGMA** — Sistema integral de gestión y monitoreo avanzado. Wall-display dashboard for the toll-road network operations center (Aunor). One fixed board (1920 × 1360) meant to run permanently on a NOC monitor: equipment health, node connectivity, OCR plate-reading quality, DAC discrepancies, SLA compliance, network incidents and platform services — all visible at once, no scrolling.

## About the Design Files
`SIGMA - Tablero NOC.dc.html` is a **design reference built in HTML** — a prototype showing the intended look, data shape and live behavior. It is **not production code to copy**. Recreate this design in the target codebase using its existing framework, component library, styling approach and data layer. If no front-end environment exists yet, pick the framework most appropriate for the project.

`support.js` is only the runtime that makes the prototype render standalone in a browser. **Do not port it.**

## Fidelity
**High-fidelity.** Final colors, typography, spacing, chart geometry and copy. All figures in the file are real sample values driven by a client-side simulator — in production every one comes from live APIs.

---

## Canvas & global styles

| Token | Value |
|---|---|
| Canvas | `1920 × 1360` px, fixed, `overflow: hidden` |
| Outer padding | `18px 26px 18px` |
| Root layout | `flex column`, `gap: 13px` |
| Font family | `Manrope` (Google Fonts, weights 200/300/400/500/600/700) |
| Base ink | `oklch(0.965 0.006 190)` |
| Page bg color | `#061413` (html/body `#04100f`) |
| Page bg image | `radial-gradient(1200px 700px at 8% -12%, oklch(0.33 0.045 185 / 0.65), transparent 66%)`, `radial-gradient(1000px 620px at 98% 2%, oklch(0.30 0.040 200 / 0.45), transparent 64%)`, `radial-gradient(1100px 700px at 55% 120%, oklch(0.26 0.035 190 / 0.55), transparent 70%)` |

Colors are authored in **oklch** — keep that space if supported; otherwise convert preserving relative lightness/chroma.

### Semantic palette
| Name | Value | Meaning |
|---|---|---|
| VERDE | `oklch(0.800 0.150 172)` | healthy / within threshold |
| AMBAR | `oklch(0.820 0.110 78)` | degraded / warning |
| ROJO | `oklch(0.680 0.190 18)` | failure / not detected |
| ROJO_D | `oklch(0.760 0.150 28)` | negative delta indicator |
| CIAN | `oklch(0.760 0.090 200)` | neutral metric / focus accent |
| LILA | `oklch(0.680 0.120 305)` | secondary category |
| Verde-lima | `oklch(0.800 0.090 120)` | latency in mid band (16–25 ms) |

### Surfaces
| Token | Value |
|---|---|
| Card background | `linear-gradient(170deg, oklch(0.250 0.030 190) 0%, oklch(0.185 0.024 190) 100%)` (topology card ends `oklch(0.180 0.024 190)`) |
| Card border | `inset 0 0 0 1px oklch(0.340 0.030 190)` |
| Card shadow | `0 18px 44px oklch(0.09 0.02 190 / 0.55)` |
| Card radius | `22px` (KPI cards `20px`, chips `999px`) |
| Card padding | `18px 22px` (+ variants `18px 22px 16px`, `18px 22px 20px`, `18px 22px 14px`) |
| Inner tile | bg `oklch(0.215 0.026 190)`, `inset 0 0 0 1px oklch(0.310 0.028 190)`, radius `14px` |
| Divider | `1px solid oklch(0.320–0.330 0.026 190)` |
| Muted text ramp | `oklch(0.700 / 0.660 / 0.640 / 0.600 0.020 190)` |
| Period chip | `padding: 4px 12px`, radius 8px, 15px/500, fg `oklch(0.860 0.100 75)`, bg `oklch(0.290 0.045 75)`, `inset 0 0 0 1px oklch(0.440 0.060 75)` |

### Signature pattern — "striped fill"
No bar in this design is a solid fill. Two hatch directions, chosen by bar orientation:

```css
/* horizontal bars (progress, SLA, list rows, OCR rows) — stripes across the length */
background-image: repeating-linear-gradient(90deg, C 0px, C 2px, transparent 2px, transparent 7px);
/* vertical chart columns — stripes stack as the column grows, so height reads as magnitude */
background-image: repeating-linear-gradient(0deg,  C 0px, C 2px, transparent 2px, transparent 7px);
```

Bar tracks: radius `7–12px`, `box-shadow: inset 0 0 0 1px <borde>`, `padding: 3–5px`, `box-sizing: border-box`, `overflow: hidden`. The inner striped fill has `border-radius: 0`, `height: 100%`, and its `width` is the percentage.

### Typography scale
| Use | Size / weight |
|---|---|
| Clock | 36px / 200, `-0.02em`, tabular |
| Hero numbers (SLA, OCR total) | 54–58px / 200, `-0.04em` |
| KPI numbers | 44px / 300, `-0.04em` |
| Wordmark SIGMA | 21px / 600, `letter-spacing: .07em` |
| Product definition line | 18px / 500, `oklch(0.820 0.018 190)` |
| Card titles | 19px / 500 |
| Section subtitles | 17px / 500 |
| KPI eyebrow labels | 14px / 600, `.09em`, uppercase |
| Row labels / values | 15–17px / 500–600 |
| Micro labels (axes, chips) | 12–14px / 500–600 |

All numerals use `font-variant-numeric: tabular-nums`.

### Keyframes
```css
@keyframes breathe { 0%,100%{opacity:1} 50%{opacity:.35} }   /* 2.6s ease-in-out infinite */
@keyframes pk1 { 0%{transform:translate(0,0);opacity:0} 12%{opacity:1} 100%{transform:translate(0px,-198px);opacity:.15} }
/* pk2 → (-189,-61)  pk3 → (188,-61)  pk4 → (-117,161)  pk5 → (116,161) */
```

### Transitions (the "live" feel — see Interactions)
| Property | Value |
|---|---|
| Bar width / column height | `1.2s cubic-bezier(0.4, 0, 0.2, 1)` |
| OCR gauge `stroke-dasharray` | `1.2s cubic-bezier(0.4, 0, 0.2, 1)` |
| Figure `text-shadow` (flash) | `1.1s ease-out` |
| Panel `opacity` / `outline-color` (focus) | `0.5s ease` |
| Nav chip `background` / `box-shadow` | `0.35s ease` |

---

## Layout

```
┌ header ─────────────────────────────────────────────────────────────┐
├ KPI wall: grid repeat(5, 1fr), gap 14px ────────────────────────────┤
├ main: grid 430px | 1fr | 470px, gap 16px (flex 1 1 auto, min-h 0) ──┤
│  ┌ left ────────┐ ┌ center ─────────┐ ┌ right ────────────────────┐ │
│  │ OCR          │ │ Conectividad    │ │ SLA                       │ │
│  │ Discrepancias│ │ (map + latency  │ │ Incidentes                │ │
│  │              │ │  + last events) │ │ Servicios                 │ │
│  └──────────────┘ └─────────────────┘ └───────────────────────────┘ │
├ nav "IR A": flex row of 6 section chips + VER TODO ─────────────────┤
└─────────────────────────────────────────────────────────────────────┘
```
Left column: OCR `flex 0 0 auto`, Discrepancias `flex 1 1 auto`. Right column: SLA and Incidentes `flex 0 0 auto`, Servicios `flex 1 1 auto`. Inner column gap `16px`.

**The vertical budget is exhausted.** The right column's three cards fill the available row height almost exactly (~20px slack). Any added row, taller chart, or larger padding clips the last service row. If the implementation adds content it must also reclaim height — the chart heights (42px), service row `min-height` (42px) and root `gap` (13px) are already trimmed for this reason.

---

## Regions

### 1. Header
Left group (`flex`, `gap: 20px`): a 40×40 `oklch(0.255 0.030 190)` radius-12 tile holding three 18×2px bars (`oklch(0.800 0.020 190)`, `gap: 4px`); then a `flex gap: 14px` run —
- wordmark **SIGMA** (21px/600, `.07em`, `oklch(0.860 0.100 195)`)
- 5px dot `oklch(0.480 0.025 190)`
- "Sistema integral de gestión y monitoreo avanzado" (18px/500, `oklch(0.820 0.018 190)`)
- **EN VIVO** pill: `padding: 6px 15px 6px 12px`, radius 999, bg `oklch(0.300 0.055 172)`, `inset 0 0 0 1px oklch(0.520 0.090 172 / 0.6)`, 7px dot `oklch(0.840 0.150 172)` with `breathe`, label 15px/500 `.04em` `oklch(0.900 0.090 172)`.

Right group (`gap: 22px`): "5 estaciones · 200 equipos · red MPLS" (17px/500, `oklch(0.740 0.020 190)`) and the clock `HH:MM`, retimed every 1000 ms.

### 2. KPI wall — 5 cards, identical geometry
`grid-template-columns: repeat(5, 1fr)`, `gap: 14px`. Each card: radius 20, `padding: 15px 18px 16px`, own gradient bg, `box-shadow: inset 0 0 0 1px <borde>, 0 16px 38px oklch(0.06 0.02 190 / 0.5)`, `cursor: pointer` (clicking focuses the related section — see Interactions).

Internals:
1. Row (`gap: 8px`): 8px status dot + eyebrow label (14px/600, `.09em`). **Every label names its measurement window** — that is the convention, keep it.
2. Baseline row (`gap: 8px`, `margin-top: 8px`): figure (44px/300) + suffix (16px/500, `oklch(0.780 0.020 190)`). The figure carries the flash `text-shadow`.
3. Note row (`flex`, `justify-content: space-between`, `margin-top: 9px`, **`min-height: 20px`**): note text (14px/500) + delta chip (14px/600). The `min-height` and one-line notes are what keep all five bars on the same baseline — **do not let a note wrap.**
4. Striped bar: `height: 18px`, radius 8, `margin-top: 11px`, track border = card border color.

| # | Eyebrow | Figure | Suffix | Note | Bar | Accent / gradient / border |
|---|---|---|---|---|---|---|
| 1 | DISPONIBILIDAD · 30 DÍAS | `disp` (2 dp) | % | monitoreo de red · últimos 30 días | `disp`% | CIAN; label `0.840 0.090 200`, figure `0.870 0.090 200`, note `0.740 0.035 200`; `linear-gradient(150deg, oklch(0.275 0.055 205), oklch(0.188 0.024 190) 68%)`; `oklch(0.415 0.060 205)` |
| 2 | EQUIPOS OPERATIVOS · AHORA | `200 − fuera` | de 200 · `fuera` fuera de línea | `fuera === 0` ? "5 estaciones reportando · todos en línea" : "`fuera` sin reportar · reintentando enlace" | `operativos/200` | VERDE; `0.880 0.120 172` / `0.900 0.140 172` / `0.740 0.030 172`; `linear-gradient(150deg, oklch(0.280 0.060 172), oklch(0.190 0.026 185) 68%)`; `oklch(0.420 0.070 172)` |
| 3 | DEGRADADOS · AHORA | `degradados` | fuera de parámetro | 0 → "sin vías fuera de parámetro"; else "`n` vía/vías con DAC degradado" | `degradados/16` | AMBAR; `0.860 0.110 78` / `0.880 0.120 78` / `0.760 0.060 78`; `linear-gradient(150deg, oklch(0.280 0.060 68), oklch(0.188 0.024 190) 68%)`; `oklch(0.420 0.070 68)` |
| 4 | DISCREPANCIAS DAC · 12 H | `dac` (1 dp) | % coincidencia | "`discrepancias` de `transitos` tránsitos · meta 99.5%" | `dac`% | AMBAR; `0.860 0.110 78` / `0.880 0.110 78` / `0.760 0.055 78`; `linear-gradient(150deg, oklch(0.278 0.055 78), oklch(0.188 0.024 190) 68%)`; `oklch(0.418 0.062 78)` |
| 5 | INCIDENTES · 7 DÍAS | `eventos` | eventos · `activos` activos | pico 8/9 · MTTR 2 m | `activos/18` | `oklch(0.780 0.150 22)`; `0.840 0.130 25` / `0.870 0.130 25` / `0.760 0.070 25`; `linear-gradient(150deg, oklch(0.272 0.058 25), oklch(0.188 0.024 190) 68%)`; `oklch(0.410 0.070 25)` |

Seed values: `disp 97.07`, `fuera 0`, `degradados 2`, `dac 93.2`, `activos 10`, `eventos 4360`. Derived: `transitos = 16836 + max(0, ocr − 29929)`, `discrepancias = round(transitos × (1 − dac/100))`. Numbers format `es-PE`.

**Delta chip** — `delta(ahora, antes, polaridad, dec)`:
- no change → text "estable", `oklch(0.620 0.020 190)`
- change → `"▲ "`/`"▼ "` + `abs(d).toFixed(dec)`
- color: VERDE when the move is *good*, ROJO_D when *bad*. Polarity per card: 1 alta, 2 alta, 3 **baja**, 4 alta, 5 **baja** (more degraded equipment or more active incidents is worse).

### 3. OCR · lectura de placas (left, top)
Header: title + period chip "24 h".

**Semicircular gauge** — inline SVG `viewBox="0 0 440 250"`, `aspect-ratio: 440/250`, full width:
- Inner disc `circle cx=220 cy=230 r=152 fill=oklch(0.160 0.020 190)`.
- Track `path d="M 40 230 A 180 180 0 1 1 400 230"`, `stroke=oklch(0.215 0.024 190)`, `stroke-width=30`, `linecap=round`.
- Arc segments: same path per series, `stroke-width=30`, arc length `L = π·180`, `stroke-dasharray="<frac·L> <2L>"`, `stroke-dashoffset="−<cumulative>·L"`; first segment `linecap: round`, rest `butt`; transition on `stroke-dasharray`.
- "No detectadas" is **not** an arc — radial ticks: step `0.0055` of total fraction, each a `line` from r 166 to r 194 at angle `π(1−t)` about (220, 230), `stroke-width: 2.6`, `linecap: butt`, ROJO (~40 ticks).
- Centered inside the arc at `bottom: 20%`: total (54px/200, `-0.04em`) over "tránsitos con placa" (18px/400, `oklch(0.760 0.020 190)`, `margin-top: 6px`).

**Three rows** (`gap: 8px`), each an inner tile (`padding: 10px 14px`, `flex gap: 14px`): 6×20 radius-4 color chip · name (16px/500, 104px) · striped bar (`flex 1`, 16px, radius 7, track `inset 0 0 0 1px oklch(0.460 0.035 190)`, `padding: 3px`) · count (15px/500, 74px, right, `oklch(0.640 0.020 190)`) · percent (20px/600, 62px, right).

Series are fixed shares of the live total: Aciertos `0.7929` VERDE · Errores `0.0427` AMBAR · No detectadas `0.1644` ROJO. Percent = `round(n/total·1000)/10`. Seed total 29,929.

### 4. Discrepancias DAC · detalle (left, fills remaining height)
Header: "Discrepancias DAC · detalle" + period chip **"12 h"** (same chip style as OCR — the period belongs on the card, not the refresh interval). The headline percentage lives in KPI card 4; this card carries only the chart and the detail list.

**Tasa de coincidencia por hora**
- Subhead "Tasa de coincidencia por hora" (17px/500) + "banda 90–100% · meta 99.5%" (15px/500 muted), `margin-bottom: 9px`.
- Track: `position: relative`, `height: 96px`, `flex`, `align-items: flex-end`, `gap: 6px`, `padding: 0 2px`, baseline `inset 0 -1px 0 oklch(0.400 0.028 190)`.
- Meta line: absolute, `bottom: 74%`, `height: 1px`, `repeating-linear-gradient(90deg, oklch(0.640 0.090 78) 0 4px, transparent 4px 9px)`.
- 12 columns, each a **direct** flex child (`flex: 1 1 0`) with `height` = `escala(v, 89, 100)` and the 0deg hatch. `escala(v,min,max) = clamp(4, ((v−min)/(max−min))·100, 100)%`.
- Hour labels: separate `flex gap: 6px` row, `margin-top: 6px`, 12px/500 muted, centered.
- Column color: `≥94 → VERDE`, `≥92 → AMBAR`, else `oklch(0.720 0.150 30)`.

Seeds (hour → % match): 11→95.1 · 12→94.4 · 13→92.8 · 14→91.6 · 15→93.0 · 16→94.2 · 17→92.1 · 18→90.7 · 19→91.9 · 20→93.6 · 21→94.8 · 22→**live `hora`** (the current hour is the one that moves).

**Vías más críticas** — divider `margin-top: 14px; padding-top: 14px`; list `flex column`, `justify-content: space-around`, `gap: 9px`, fills remaining height. Subhead "Vías más críticas" + "1,144 de 16,836 tránsitos". Row (`gap: 12px`): via (17px/500, 46px) · station (15px/500, `.06em`, 96px, colored) · striped bar (`flex 1`, 16px) · base count (15px/500 muted) · percent (17px/600, 60px, right).

| Vía | Estación | % | Base | Bar | Color |
|---|---|---|---|---|---|
| 508 | HUARMEY | 16.9% | 92/545 | 100% | `oklch(0.720 0.150 40)` |
| 609 | 402 | 15.9% | 33/207 | 94% | CIAN |
| 408 | FORTALEZA | 13.4% | 77/573 | 79% | VERDE |
| 407 | FORTALEZA | 10.9% | 52/475 | 64% | VERDE |
| 401 | FORTALEZA | 10.3% | 53/517 | 61% | VERDE |

### 5. Conectividad de nodos de peaje · en vivo (center)
Header: 9px breathing dot `oklch(0.840 0.150 172)` + "CONECTIVIDAD DE NODOS DE PEAJE · EN VIVO" (19px/600, `.10em`, `oklch(0.880 0.090 172)`); right "5 nodos · ciclo 30 s · umbral 40 ms".

**Map** — SVG `viewBox="0 0 1000 680"`, `aspect-ratio: 1000/680`, centered, `max-height: 100%`:
- Grid `<pattern id="rejilla" width=62 height=62>` with `path d="M 62 0 L 0 0 0 62"`, `stroke=oklch(0.300 0.026 190 / 0.55)`, `stroke-width=1`, over a full-size rect.
- Links: line from core (485, 381) to each node, `stroke-width: 1.6`, `opacity: 0.55`, node color.
- Packets: 10 circles at the core (`r: 5`, node color), two per node, `animation: pk<n> <2.6 + i·0.25>s linear <k·1.3 + i·0.35>s infinite` (i = node 0–4, k = 0|1).
- Nodes: three concentric circles — `r: 26` @ `.16`, `r: 15` @ `.55`, `r: 7` solid.
- Core: `r: 52` `oklch(0.800 0.130 175)` @ `.14`; `r: 34` filled with `radialGradient #nucleo` (`oklch(0.880 0.140 172)` → `oklch(0.680 0.130 175)`); centered text **SIGMA**, y 388, 16px/700, `letter-spacing: 1.2`, fill `oklch(0.140 0.030 175)`.
- Labels are **HTML** absolutely positioned over the SVG (`left: x/1000%`, `top: (ty−12)/680%`, `translate(-50%,-50%)`, `pointer-events: none`): name 19px/500, detail 15px/500 muted `margin-top: 3px`.

| Node | x, y | Label y | Detail | Color |
|---|---|---|---|---|
| Fortaleza | 485, 183 | 141 | `100% · <lat[4]> ms · 40/40` | AMBAR when `lat[4] ≥ 26`, else VERDE |
| Viru | 296, 320 | 278 | `100% · <lat[1]> ms · 41/41` | VERDE |
| Huarmey | 673, 320 | 278 | `100% · <lat[0]> ms · 40/40` | VERDE |
| Santa | 368, 542 | 600 | `100% · <lat[2]> ms · 37/37` | VERDE |
| KM 402 | 601, 542 | 600 | `100% · <lat[3]> ms · 42/42` | VERDE |

**Card footer** — `grid-template-columns: 1.05fr 1fr`, `gap: 24px`, `padding-top: 14px`, top divider.

*Latencia por estación* — subhead + "umbral 40 ms · nadie pasa del 73%"; rows (`gap: 8px`): name (16px/500, `.05em`, 108px) · striped bar (16px) · equipment range (14px/500 muted, 150px, right, `nowrap`) · ms (19px/600, 62px, right, colored). Bar width `min(100, ms/40·100)%`. Color: `ms ≥ 26 → AMBAR`, `≥ 16 → oklch(0.800 0.090 120)`, else VERDE.

| Estación | index | Seed ms | Equipos |
|---|---|---|---|
| HUARMEY | lat[0] | 9 | 40/40 · 8.5–10 ms |
| VIRU | lat[1] | 10 | 41/41 · 9.5–11 ms |
| SANTA | lat[2] | 11 | 37/37 · 10–12 ms |
| KM 402 | lat[3] | 13 | 42/42 · 12.5–15 ms |
| FORTALEZA | lat[4] | 29 | 40/40 · pico 801 ms |

*Últimos incidentes* — subhead + "10 activos · MTTR 2 m"; rows (`gap: 6px`) as inner tiles (`padding: 7px 12px`, radius 10): 7px severity dot · equipment (16px/500, flex) · station (15px/500 muted, 96px) · timestamp (15px/500 muted, 82px, right) · duration (16px/600, 44px, right).

| Equipo | Estación | Hora | Dur | Color |
|---|---|---|---|---|
| PC OCR 805 | Santa | 14/9 14:47 | 0 m | ROJO |
| PC vía 704 | Viru | 14/9 14:13 | 1 m | ROJO |
| PC OCR 808 | Santa | 14/9 13:32 | 0 m | AMBAR |
| Display 602 | KM 402 | 14/9 10:37 | 0 m | AMBAR |
| Display 408 | Fortaleza | 14/9 10:33 | 0 m | AMBAR |

### 6. Cumplimiento de SLA · 30 días (right, top)
Title 19px/500. Baseline row (`margin-top: 8px`): `sla` (2 dp, 58px/200, `-0.045em`, flash `text-shadow`) + `%` (32px/200, `oklch(0.900 0.015 190)`); right block (16px/500 muted, `line-height: 1.45`): "meta 99.5% · faltan `(99.5 − sla).toFixed(2)` pp" / "**132 de 200** equipos bajo meta" (count in `oklch(0.780 0.150 25)`).

Hero bar: `margin-top: 14px`, `height: 38px`, radius 12, track `inset 0 0 0 1px oklch(0.480 0.035 190)`, `padding: 5px`; striped fill `oklch(0.720 0.085 200)`. **Width is normalized to a 90–100% window**: `clamp(0, ((pct − 90)/10)·100, 100)%` — a raw percentage here would make every station look identical.

Below: `grid repeat(5, 1fr)`, `gap: 8px`, `margin-top: 14px`, centered — percentage (19px/500, colored) over station (14px/500 muted, `margin-top: 4px`).

| Estación | SLA | Color |
|---|---|---|
| Fortaleza | 99.92% | VERDE |
| KM 402 | 97.68% | AMBAR |
| Viru | 97.34% | AMBAR |
| Huarmey | 96.53% | `oklch(0.720 0.150 25)` |
| Santa | 94.18% | `oklch(0.700 0.180 20)` |

### 7. Incidentes de red · detalle (right, middle)
Header: title + "7 días · agrupados por ráfaga". The 7-day total lives in KPI card 5.

**Equipos fuera de línea por día**: subhead + "pico 8/9 · ráfaga de enlace"; track `height: 42px`, `flex`, `align-items: flex-end`, `gap: 8px`, baseline `inset 0 -1px 0 oklch(0.400 0.028 190)`; 7 columns as direct children (`flex: 1 1 0`), `height = escala(v, 0, 1300)`, 0deg hatch. Labels row `margin-top: 5px`, stacked two lines per column, `white-space: nowrap`, centered: value (12px/600, column color) over date (12px/500, `oklch(0.640 0.020 190)`). Color: `≥900 → oklch(0.720 0.150 25)`, `≥500 → AMBAR`, else CIAN.

Data: 8/9 → 1,204 · 9/9 → 812 · 10/9 → 566 · 11/9 → 431 · 12/9 → 604 · 13/9 → 487 · 14/9 → 256

**Por estación**: divider `margin-top: 12px; padding-top: 11px`, subhead "Por estación", list `gap: 6px`, `margin-top: 8px`. Row: name (16px/500, 92px) · striped bar (16px) · percent (15px/500 muted, 44px, right) · count (17px/600, 56px, right).

| Estación | n | % | Bar | Color |
|---|---|---|---|---|
| KM 402 | 1,687 | 39% | 100% | CIAN |
| Viru | 1,601 | 37% | 95% | CIAN |
| Fortaleza | 933 | 21% | 55% | LILA |
| Huarmey | 77 | 2% | 6% | `oklch(0.520 0.040 190)` |
| Santa | 62 | 1% | 5% | `oklch(0.520 0.040 190)` |

### 8. Servicios de plataforma (right, fills remaining height)
Header: "Servicios de plataforma" + "Aunor". Rows `flex column`, `gap: 9px`, `margin-top: 12px`; each an inner tile, **`min-height: 42px`**, `padding: 7px 16px`, radius 14, `flex gap: 14px`: 9px status dot · stacked name (17px/500) + detail (15px/500 `oklch(0.680 0.020 190)`) · right-aligned uptime (20px/600) + state (14px/500 muted).

| Servicio | Detalle | Uptime | Estado |
|---|---|---|---|
| Prepago | saldos y recargas · cola 0 | 99.98% | operativo (VERDE) |
| Facturación | `<fact>` ms · `<cola>` comprobantes en cola | 98.71% | `cola > 120` ? degradado (AMBAR, figure `oklch(0.860 0.110 78)`) : operativo |
| Servicio de dominio web | DNS Aunor · réplica secundaria ok | 100% | operativo (VERDE) |
| Pasarela de tránsitos | `<lat[1] + 12>` ms · lag de réplica 0.4 s | 99.94% | operativo (VERDE) |

Operative figure color `oklch(0.900 0.015 190)`.

### 9. Nav "IR A" (footer)
`flex`, `align-items: center`, `gap: 10px`. Leading label "IR A" (13px/600, `.12em`, `oklch(0.600 0.020 190)`). Six chips, each `flex: 1 1 0`, `padding: 7px 16px`, radius 999, `cursor: pointer`, `justify-content: space-between`: label (15px/500, `nowrap`) + live figure (14px/600, tabular). Trailing "VER TODO" (14px/600, `.04em`) — `oklch(0.860 0.100 195)` when a section is focused, `oklch(0.560 0.020 190)` when idle.

| Chip | Label | Live figure |
|---|---|---|
| conectividad | Vías y conectividad | `operativos`/200 |
| discrepancias | Discrepancias DAC | `dac`% |
| ocr | OCR de placas | `ocr` total |
| sla | Cumplimiento SLA | `sla`% |
| incidentes | Incidentes | `activos` activos |
| servicios | Servicios | `cola > 120` ? "1 degradado" : "todo ok" |

Chip state — idle: fg `oklch(0.880 0.015 190)`, figure `oklch(0.660 0.020 190)`, bg `oklch(0.225 0.026 190)`, border `oklch(0.360 0.028 190)`. Active: fg `oklch(0.150 0.030 200)`, figure `oklch(0.300 0.040 200)`, bg `oklch(0.760 0.090 200)`, border `oklch(0.840 0.090 200)`.

---

## Interactions & Behavior

This is a wall board, so there is **no navigation, no routing, no hover-only affordance and no text input**. Two behaviors only:

**A. Live data with change feedback.** A simulator ticks every `ritmoSeg` seconds (default 4) and nudges each metric with a bounded random walk; production replaces it with the real feed, but the *presentation* rules must survive:
- Bars and gauge arcs **interpolate** to the new value over 1.2s — they never jump.
- On each new reading the big figure gets `text-shadow: 0 0 22px <accent>`, cleared 160ms later, so the 1.1s transition fades the glow out. That flash is what makes an idle board feel alive; implement it as "apply glow, then remove" rather than a keyframe, so it re-fires on every update.
- KPI delta chips show the signed change since the previous reading, colored by whether the move is good for that metric.
- The clock retimes every 1000ms independently of the data cadence.

Simulator parameters (seed → step, min, max, decimals), useful as the feed's sanity bounds:

| Field | Step | Range | Note |
|---|---|---|---|
| `disp` | ±0.05 | 96.20–99.10 | 2 dp |
| `dac` | ±0.40 | 90.80–96.60 | 1 dp |
| `sla` | ±0.05 | 96.40–98.60 | 2 dp |
| `hora` | ±0.55 | 90.20–96.50 | current hour's match rate |
| `ocr` | +7…+31 | monotonic | transit counter |
| `cola` | ±28 | 0–340 | billing queue |
| `fact` | ±45 | 180–620 | billing latency ms |
| `lat[i]` | ±1.3 (±3.2 for i=4) | 7–19 (18–44 for i=4) | integer ms |
| `fuera` | ±1 @ 18% | 0–4 | discrete |
| `degradados` | ±1 @ 14% | 0–6 | discrete |
| `activos` | ±1 @ 22% | 3–18 | discrete |
| `eventos` | +0…+3 | monotonic | 7-day counter |

**B. Section focus.** Clicking a nav chip — or a KPI card — sets `foco` to a section id; clicking the same one again, or "VER TODO", clears it. When `foco` is set, the matching panel gets `outline: 2px solid oklch(0.760 0.090 200)` with `outline-offset: -1px` and every other panel drops to `opacity: 0.34`, both transitioned over 0.5s. Six focusable panels: `ocr`, `discrepancias`, `conectividad`, `sla`, `incidentes`, `servicios`. KPI card → section mapping, in card order: `conectividad`, `conectividad`, `discrepancias`, `discrepancias`, `incidentes`.

Focus is a highlight, **not** a route. If the production system has real detail screens, this is the natural place to hook navigation — but keep the highlight for the wall-only deployment, where there is no pointer.

**Caveat to resolve with the client:** chips only work on a touch-enabled wall. On a read-only monitor, render them as informational labels (same chip styling, no pointer, no focus behavior).

No load, empty or error states are designed. Production must define a stale-feed treatment (e.g. dim the card and show "sin datos hace N min") — the current design assumes data is always fresh.

## State Management
Local state is only presentational: `reloj` (clock string, 1s interval), `pulso` (data-tick counter), `brillo` (flash flag, 160ms timeout), `foco` (focused section id). Intervals are cleared on unmount and restarted when the cadence changes. Everything else is derived from incoming data.

Suggested data contracts, one per region:

- `resumenEquipos` → operativos, total, fuera, estacionesReportando
- `degradados` → count
- `disponibilidad30d` → pct
- `discrepanciasDac` → pctCoincidencia, discrepancias, transitos, meta, `porHora[{hora, pct}]`, `viasCriticas[{via, estacion, pct, discrepancias, transitos}]`
- `ocr` → total, `series[{nombre, n}]`
- `conectividad` → `nodos[{nombre, uptime, ms, equiposOk, equiposTotal}]`, umbralMs, cicloSeg
- `latencias` → per station ms, min/max, equipment counts, pico
- `incidentes` → total7d, activos, mttr, `porDia[{fecha, n}]`, `porEstacion[{estacion, n}]`, `ultimos[{equipo, estacion, ts, duracionMin, severidad}]`
- `sla` → global pct, meta, equiposBajoMeta, total, `porEstacion[{estacion, pct}]`
- `servicios` → `[{nombre, detalle, uptime, estado}]`

Derived in the view, never by the API: bar widths and column heights (the `escala` clamp and the SLA 90–100 normalization), severity colors (threshold functions), percentages, delta signs, and `es-PE` number formatting.

Three thresholds are literals in the prototype and should be config: the SLA window (90–100), the hourly-match window (89–100), and the billing-queue degraded cutoff (120).

## Design Tokens
**Colors** — palette and surface tables above (all oklch).
**Spacing** — 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26 px. Gaps: cards 16, KPI wall 14, root 13, nav 10, list rows 6–9, chart columns 6–8.
**Radius** — 0 (striped fills), 4, 7, 8, 10, 12, 14, 20, 22, 999.
**Shadows** — card `0 18px 44px oklch(0.09 0.02 190 / 0.55)`; KPI `0 16px 38px oklch(0.06 0.02 190 / 0.5)`; all borders `inset 0 0 0 1px`, never `border`; focus ring uses `outline`, not box-shadow, so it composes with the border.
**Chart geometry** — OCR gauge 440×250 (r 180, stroke 30, ticks r 166→194 @ 2.6); topology 1000×680 (core 485,381; grid 62); hourly track 96px / 12 columns; daily track 42px / 7 columns.

## Escalado — un mismo tablero en 13", 21" y 65"

The board is authored at a fixed **1920 × 1360** (aspect 1.412). Do **not** try to make the regions reflow fluidly: this is an information-dense wall layout where the three-column grid, the 5-card wall and the chart geometry are the design. Reflowing it produces a different, worse product.

Instead **scale the whole board uniformly to fit the viewport**, so a 13" laptop, a 21" desk monitor and a 65" wall panel all show the identical composition at different physical sizes:

```css
.sigma-viewport {               /* fills the screen, centers the board */
  position: fixed; inset: 0;
  display: grid; place-items: center;
  background: #04100f;          /* letterbox color = page bg */
  overflow: hidden;
}
.sigma-board {                  /* the 1920×1360 design, untouched */
  width: 1920px; height: 1360px;
  transform: scale(var(--sigma-scale, 1));
  transform-origin: center center;
}
```
```js
const fit = () => {
  const s = Math.min(innerWidth / 1920, innerHeight / 1360);
  document.documentElement.style.setProperty('--sigma-scale', s);
};
addEventListener('resize', fit); fit();
```

Notes for the implementation:

- **Use `transform: scale`, not `zoom` or rem-scaling.** Scale keeps every ratio, stroke width and SVG geometry exact, and it costs nothing at runtime (one composited layer). rem-scaling would re-lay-out the board and re-introduce the wrap bugs the fixed heights were tuned to avoid.
- **Only scale down, never up past ~1.0 unless the panel is genuinely larger.** On a 4K 65" wall, `min(3840/1920, 2160/1360) = 1.59` — scaling up is correct there and text gets *more* legible, not blurrier (it's vector, not raster).
- **Letterbox rather than stretch.** Different aspect ratios leave bars of page background at top/bottom or left/right; that reads as intentional on a wall. Never use two different X/Y scales.
- **Legibility floor.** The smallest type is 12px at scale 1. On a 13" laptop (≈1440×900 usable) the scale lands near `0.66`, i.e. ~8px effective — readable at desk distance, but this is the practical lower bound. If the client wants the board usable on small laptops as a working view rather than a glance view, that is a **different deliverable**: a stacked single-column variant where the KPI wall becomes 2 columns and the three panel columns stack. Ask before building it; don't derive it from this file.
- **Reference distance.** At scale 1 the board is designed to be read from ~2–3 m on a 55–65" panel. A 21" monitor at 1920×1080 scales to `0.79` and is comfortable at desk distance.
- Keep the scaling wrapper outside the board component, so the board itself stays a pure 1920×1360 layout and can also be screenshotted or printed at native size.

## Assets
None. Every visual is CSS or inline SVG — logo tile, gauge, topology map, grid pattern, all bars. Only external dependency is the **Manrope** webfont from Google Fonts; substitute the codebase's font pipeline if it self-hosts.

## Files
- `SIGMA - Tablero NOC.dc.html` — the design reference. Its script block holds the exact simulator, `escala`, `delta` and color-threshold functions; read it for anything this document leaves ambiguous.
- `support.js` — prototype runtime only. **Do not port.**
