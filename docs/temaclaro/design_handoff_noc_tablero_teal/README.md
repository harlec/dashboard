# Handoff: NOC — Tablero analítico teal (Pulso Vial)

## Overview
Wall-display dashboard for the Pulso Vial network operations center (Aunor). Single fixed-size board (1920 × 1360) meant to run permanently on a NOC monitor: equipment health, network topology heartbeat, OCR plate-reading quality, DAC discrepancies, SLA compliance, network incidents and platform service status — all visible without scrolling or interaction.

## About the Design Files
`NOC - Tablero analitico teal.dc.html` in this bundle is a **design reference built in HTML** — a prototype that shows the intended look, data shape and live behavior. It is **not production code to copy**. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, Angular, Blazor, etc.) using its established component library, styling approach and data layer. If no front-end environment exists yet, pick the framework most appropriate for the project and implement it there.

`support.js` is only the runtime that makes the prototype render standalone in a browser. **Do not port it.**

## Fidelity
**High-fidelity.** Final colors, typography, spacing, chart geometry and copy. Recreate pixel-accurately with the codebase's own primitives. All numbers in the file are real Pulso Vial figures used as sample data — they must come from live APIs in the implementation.

---

## Canvas & global styles

| Token | Value |
|---|---|
| Canvas | `1920 × 1360` px, fixed, `overflow: hidden` |
| Outer padding | `20px 26px 22px` |
| Root layout | `flex column`, `gap: 16px` |
| Font family | `Manrope` (Google Fonts, weights 200/300/400/500/600/700) |
| Base ink | `oklch(0.965 0.006 190)` |
| Page bg color | `#061413` (html/body `#04100f`) |
| Page bg image | three radial gradients: `radial-gradient(1200px 700px at 8% -12%, oklch(0.33 0.045 185 / 0.65), transparent 66%)`, `radial-gradient(1000px 620px at 98% 2%, oklch(0.30 0.040 200 / 0.45), transparent 64%)`, `radial-gradient(1100px 700px at 55% 120%, oklch(0.26 0.035 190 / 0.55), transparent 70%)` |

Colors are authored in **oklch** — keep that color space if the target supports it; otherwise convert and keep relative lightness/chroma relationships.

### Semantic palette
| Name | Value | Meaning |
|---|---|---|
| VERDE | `oklch(0.800 0.150 172)` | healthy / within threshold |
| AMBAR | `oklch(0.820 0.110 78)` | degraded / warning |
| ROJO | `oklch(0.680 0.190 18)` | failure / not detected |
| CIAN | `oklch(0.760 0.090 200)` | neutral metric / informational |
| LILA | `oklch(0.680 0.120 305)` | secondary category |
| Rojo alterno | `oklch(0.720 0.150 25–40)`, `oklch(0.780 0.150 22)`, `oklch(0.700 0.180 20)` | severity ramp |

### Surfaces
| Token | Value |
|---|---|
| Card background | `linear-gradient(170deg, oklch(0.250 0.030 190) 0%, oklch(0.185 0.024 190) 100%)` (topology card ends at `oklch(0.180 0.024 190)`) |
| Card border | `inset 0 0 0 1px oklch(0.340 0.030 190)` |
| Card shadow | `0 18px 44px oklch(0.09 0.02 190 / 0.55)` |
| Card radius | `22px` (KPI cards `20px`) |
| Card padding | `18px 22px` (variants `18px 22px 16px`, `18px 22px 20px`, `18px 22px 14px`) |
| Inner tile | bg `oklch(0.215 0.026 190)`, `inset 0 0 0 1px oklch(0.310 0.028 190)`, radius `14px` |
| Divider | `1px solid oklch(0.320–0.330 0.026 190)` |
| Muted text | `oklch(0.700 0.020 190)` / `oklch(0.660 0.020 190)` / `oklch(0.640 0.020 190)` |

### Signature pattern — "striped fill"
**Every** progress bar and chart bar uses the same hatch, never a solid fill:
```css
background-image: repeating-linear-gradient(90deg, <color> 0px, <color> 2px, transparent 2px, transparent 7px);
```
Bar tracks: `border-radius: 7–12px`, `box-shadow: inset 0 0 0 1px <borde>`, `padding: 3–5px`, `box-sizing: border-box`, `overflow: hidden`. The inner striped fill has `border-radius: 0` and `height: 100%`; its `width` is the percentage.

### Typography scale
| Use | Size / weight |
|---|---|
| Clock | 36px / 200, `letter-spacing: -0.02em`, tabular-nums |
| Hero numbers (SLA, OCR total) | 54–58px / 200, `-0.04em` |
| KPI numbers | 44px / 300, `-0.04em` |
| Card titles | 19px / 500 |
| Section subtitles | 17px / 500 |
| KPI eyebrow labels | 14px / 600, `letter-spacing: 0.09em`, uppercase |
| Row labels / values | 15–17px / 500–600 |
| Micro labels (axes) | 12–13px / 500 |

All numerals use `font-variant-numeric: tabular-nums`.

### Keyframes
```css
@keyframes breathe { 0%,100%{opacity:1} 50%{opacity:.35} }              /* 2.6s ease-in-out infinite — live dots */
@keyframes pk1 { 0%{transform:translate(0,0);opacity:0} 12%{opacity:1} 100%{transform:translate(0px,-198px);opacity:.15} }
/* pk2 → (-189,-61)  pk3 → (188,-61)  pk4 → (-117,161)  pk5 → (116,161) */
```
`pk1…pk5` animate packet dots from the topology core outward to each of the 5 nodes.

---

## Layout

```
┌ header (flex 0 0 auto) ─────────────────────────────────────────────┐
├ KPI wall: grid repeat(5, 1fr), gap 14px (flex 0 0 auto) ────────────┤
├ main: grid 430px | 1fr | 470px, gap 16px (flex 1 1 auto, min-h 0) ──┤
│  ┌ left col ────┐ ┌ center ─────────┐ ┌ right col ────────────────┐ │
│  │ OCR card     │ │ Topology card   │ │ SLA card                  │ │
│  │ Discrepancias│ │ (map + latency  │ │ Incidentes · detalle      │ │
│  │ · detalle    │ │  + last events) │ │ Servicios de plataforma   │ │
│  └──────────────┘ └─────────────────┘ └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```
Left column: OCR `flex 0 0 auto`, Discrepancias `flex 1 1 auto`. Right column: SLA and Incidentes `flex 0 0 auto`, Servicios `flex 1 1 auto`. Column gap inside both side columns: `16px`.

**Vertical budget is tight.** The right column's three cards fill 1077px of available row height almost exactly. Any added row, bigger chart, or larger padding will clip the last service row. If the implementation adds content, it must also reclaim the height.

---

## Screens / Views

There is one screen. Nine regions:

### 1. Header
Left group (`flex`, `gap: 20px`): a 40×40 `oklch(0.255 0.030 190)` rounded-12px tile containing three 18×2px bars (`oklch(0.800 0.020 190)`, stacked, `gap: 4px`); then a `flex gap: 14px` run of — wordmark `PULSO` (24px/600, `oklch(0.860 0.100 195)`) + `VIAL` (24px/300, `oklch(0.950 0.010 190)`); a 5px dot `oklch(0.480 0.025 190)`; "Centro de operaciones" (24px/500, `-0.01em`); and an **EN VIVO** pill — `padding: 6px 15px 6px 12px`, `border-radius: 999px`, bg `oklch(0.300 0.055 172)`, `inset 0 0 0 1px oklch(0.520 0.090 172 / 0.6)`, a 7px dot `oklch(0.840 0.150 172)` with `breathe`, label 15px/500 `letter-spacing: .04em` `oklch(0.900 0.090 172)`.

Right group (`gap: 22px`): "5 estaciones · 200 equipos · red MPLS" (17px/500, `oklch(0.740 0.020 190)`) and the clock `HH:MM`, updated every 1000 ms from local time.

### 2. KPI wall — 5 cards, identical shape
`grid-template-columns: repeat(5, 1fr)`, `gap: 14px`. Each card: `border-radius: 20px`, `padding: 15px 18px 16px`, per-card gradient background, `box-shadow: inset 0 0 0 1px <borde>, 0 16px 38px oklch(0.06 0.02 190 / 0.5)`.

Card internals, top to bottom:
1. Row (`gap: 8px`): 8px status dot + eyebrow label (14px/600, `.09em`).
2. Baseline row (`gap: 8px`, `margin-top: 8px`): big figure (44px/300) + suffix (16px/500, `oklch(0.780 0.020 190)`).
3. Note line (14px/500, `margin-top: 9px`, `min-height: 20px`) — the `min-height` keeps all five bars aligned.
4. Striped bar: `height: 18px`, radius 8px, `margin-top: 11px`, track border = card border color.

| # | Eyebrow | Figure | Suffix | Note | Bar | Accent | Card gradient / border |
|---|---|---|---|---|---|---|---|
| 1 | EQUIPOS OPERATIVOS | 200 | de 200 · 0 caídos | 5 estaciones reportando · sin caídas abiertas | 100% | VERDE (label `oklch(0.880 0.120 172)`, figure `oklch(0.900 0.140 172)`, note `oklch(0.740 0.030 172)`) | `linear-gradient(150deg, oklch(0.280 0.060 172), oklch(0.190 0.026 185) 68%)` / `oklch(0.420 0.070 172)` |
| 2 | DEGRADADOS | 2 | fuera de parámetro | 2 vías con DAC degradado | 12% | AMBAR (`0.860 0.110 78` / `0.880 0.120 78` / `0.760 0.060 78`) | `linear-gradient(150deg, oklch(0.280 0.060 68), oklch(0.188 0.024 190) 68%)` / `oklch(0.420 0.070 68)` |
| 3 | DISPONIBILIDAD 30 D | 97.07 | % | monitoreo de red · últimos 30 días | 97.07% | CIAN (`0.840 0.090 200` / `0.870 0.090 200` / `0.740 0.035 200`) | `linear-gradient(150deg, oklch(0.275 0.055 205), oklch(0.188 0.024 190) 68%)` / `oklch(0.415 0.060 205)` |
| 4 | DISCREPANCIAS DAC | 93.2 | % coincidencia | 1,144 de 16,836 tránsitos · meta 99.5% | 93.2% | AMBAR (`0.860 0.110 78` / `0.880 0.110 78` / `0.760 0.055 78`) | `linear-gradient(150deg, oklch(0.278 0.055 78), oklch(0.188 0.024 190) 68%)` / `oklch(0.418 0.062 78)` |
| 5 | INCIDENTES 7 DÍAS | 4,360 | caídas · 10 activas | pico 8/9 · MTTR 2 m | 68% | `oklch(0.780 0.150 22)` (label `0.840 0.130 25` / figure `0.870 0.130 25` / note `0.760 0.070 25`) | `linear-gradient(150deg, oklch(0.272 0.058 25), oklch(0.188 0.024 190) 68%)` / `oklch(0.410 0.070 25)` |

### 3. OCR · lectura de placas (left column, top)
Header: title 19px/500 + a "24 h" chip (`padding: 4px 12px`, radius 8px, 15px/500, fg `oklch(0.860 0.100 75)`, bg `oklch(0.290 0.045 75)`, `inset 0 0 0 1px oklch(0.440 0.060 75)`).

**Semicircular gauge** — inline SVG `viewBox="0 0 440 250"`, `aspect-ratio: 440/250`, full width:
- Inner disc: `circle cx=220 cy=230 r=152 fill=oklch(0.160 0.020 190)`.
- Track: `path d="M 40 230 A 180 180 0 1 1 400 230"`, `stroke=oklch(0.215 0.024 190)`, `stroke-width=30`, `stroke-linecap=round`.
- Segments: same path per series, `stroke-width=30`, arc length `L = π·180`, `stroke-dasharray="<frac·L> <2L>"`, `stroke-dashoffset="-<cumulative frac>·L"`; first segment `linecap: round`, the rest `butt`.
- The "No detectadas" series is **not** an arc: it is drawn as radial ticks — step `0.0055` of the total fraction, each a `line` from radius 166 to 194 at angle `π(1−t)` about (220, 230), `stroke-width: 2.6`, `linecap: butt`, color ROJO. (~40 ticks.)
- Centered inside the arc, `bottom: 20%`: `29,929` (54px/200, `-0.04em`) over "tránsitos con placa" (18px/400, `oklch(0.760 0.020 190)`, `margin-top: 6px`).

**Three stacked rows** (`gap: 8px`) below the gauge, each an inner tile (`padding: 10px 14px`, radius 14px, `flex gap: 14px`): 6×20px radius-4 color chip · name (16px/500, fixed 104px) · striped bar (`flex 1`, `height: 16px`, radius 7px, track `inset 0 0 0 1px oklch(0.460 0.035 190)`, `padding: 3px`) · count (15px/500, 74px, right, `oklch(0.640 0.020 190)`) · percent (20px/600, 62px, right).

| Series | n | % of 29,929 | Color |
|---|---|---|---|
| Aciertos | 23,732 | 79.3% | VERDE |
| Errores | 1,277 | 4.3% | AMBAR |
| No detectadas | 4,920 | 16.4% | ROJO |

Percent = `round(n/total·1000)/10`; counts formatted `es-PE`.

### 4. Discrepancias DAC · detalle (left column, fills remaining height)
Header: "Discrepancias DAC · detalle" + "12 h · refresco 60 s". The headline percentage lives in KPI card 4 — this card carries **only** the general chart plus the detail list.

**Tasa de coincidencia por hora** (general chart):
- Subhead row: "Tasa de coincidencia por hora" (17px/500) + "banda 90–100% · meta 99.5%" (15px/500 muted), `margin-bottom: 9px`.
- Track: `position: relative`, `height: 96px`, `display: flex`, `align-items: flex-end`, `gap: 6px`, `padding: 0 2px`, baseline `box-shadow: inset 0 -1px 0 oklch(0.400 0.028 190)`.
- Meta line: absolutely positioned, `bottom: 74%`, `height: 1px`, dashed via `repeating-linear-gradient(90deg, oklch(0.640 0.090 78) 0 4px, transparent 4px 9px)`.
- 12 bars, each a **direct** flex child (`flex: 1 1 0`) with `height` = scaled value and the striped fill. Scale: `clamp(4, ((v − 89) / (100 − 89)) · 100, 100)` %.
- Hour labels underneath: separate `flex gap: 6px` row, `margin-top: 6px`, 12px/500 muted, centered.
- Bar color by value: `≥94 → VERDE`, `≥92 → AMBAR`, else `oklch(0.720 0.150 30)`.

Data (hour, % match): 11 → 95.1 · 12 → 94.4 · 13 → 92.8 · 14 → 91.6 · 15 → 93.0 · 16 → 94.2 · 17 → 92.1 · 18 → 90.7 · 19 → 91.9 · 20 → 93.6 · 21 → 94.8 · 22 → 93.2

**Vías más críticas** (detail list), above a `1px solid oklch(0.330 0.026 190)` divider with `margin-top: 14px; padding-top: 14px`; the list is `flex column`, `justify-content: space-around`, `gap: 9px`, fills remaining height. Subhead row: "Vías más críticas" + "1,144 de 16,836 tránsitos".

Each row (`flex gap: 12px`): via (17px/500, 46px) · station (15px/500, `.06em`, 96px, colored) · striped bar (`flex 1`, 16px tall) · base count (15px/500 muted) · percent (17px/600, 60px, right).

| Vía | Estación | % | Base | Bar | Color |
|---|---|---|---|---|---|
| 508 | HUARMEY | 16.9% | 92/545 | 100% | `oklch(0.720 0.150 40)` |
| 609 | 402 | 15.9% | 33/207 | 94% | CIAN |
| 408 | FORTALEZA | 13.4% | 77/573 | 79% | VERDE |
| 407 | FORTALEZA | 10.9% | 52/475 | 64% | VERDE |
| 401 | FORTALEZA | 10.3% | 53/517 | 61% | VERDE |

### 5. Topología de red · heartbeat en vivo (center column)
Header: 9px breathing dot `oklch(0.840 0.150 172)` + "TOPOLOGÍA DE RED · HEARTBEAT EN VIVO" (19px/600, `.10em`, `oklch(0.880 0.090 172)`); right "5 nodos · ciclo 30 s · umbral 40 ms".

**Map** — SVG `viewBox="0 0 1000 680"`, `aspect-ratio: 1000/680`, centered, `max-height: 100%`:
- Grid: `<pattern id="rejilla" width=62 height=62>` with `path d="M 62 0 L 0 0 0 62"`, `stroke=oklch(0.300 0.026 190 / 0.55)`, `stroke-width=1`, filling a full-size rect.
- Links: line from core (485, 381) to each node, `stroke-width: 1.6`, `opacity: 0.55`, node color.
- Packets: 10 circles at the core (`r: 5`, node color), two per node with `animation: pk<n> <2.6 + i·0.25>s linear <k·1.3 + i·0.35>s infinite` (i = node index 0–4, k = 0|1).
- Nodes: three concentric circles per node — `r: 26` @ `opacity .16`, `r: 15` @ `.55`, `r: 7` solid.
- Core: `r: 52` `oklch(0.800 0.130 175)` @ `.14`; `r: 34` filled with `radialGradient #nucleo` (`oklch(0.880 0.140 172)` → `oklch(0.680 0.130 175)`); two-line "PULSO / VIAL" text, 17px/700, `letter-spacing: 1`, fill `oklch(0.140 0.030 175)`, baselines y = 376 and 396.
- Labels are **HTML** absolutely positioned over the SVG (`left: x/1000%`, `top: (ty−12)/680%`, `translate(-50%,-50%)`, `pointer-events: none`): name 19px/500, detail 15px/500 muted `margin-top: 3px`.

| Node | x, y | Label y (`ty`) | Detail | Color |
|---|---|---|---|---|
| Fortaleza | 485, 183 | 141 | 100% · 21 ms · 40/40 | AMBAR |
| Viru | 296, 320 | 278 | 100% · 10 ms · 41/41 | VERDE |
| Huarmey | 673, 320 | 278 | 100% · 9 ms · 40/40 | VERDE |
| Santa | 368, 542 | 600 | 100% · 11 ms · 37/37 | VERDE |
| KM 402 | 601, 542 | 600 | 100% · 14 ms · 42/42 | VERDE |

**Footer of the card** — `grid-template-columns: 1.05fr 1fr`, `gap: 24px`, `padding-top: 14px`, top divider.

*Latencia por estación* — subhead + "umbral 40 ms · nadie pasa del 73%"; rows (`gap: 8px`): name (16px/500, `.05em`, 108px) · striped bar (16px tall) · equipment range (14px/500 muted, 150px, right, `nowrap`) · ms (19px/600, 62px, right, colored).

| Estación | ms | Bar | Equipos | Color |
|---|---|---|---|---|
| HUARMEY | 9 ms | 22% | 40/40 · 8.5–10 ms | VERDE |
| VIRU | 10 ms | 25% | 41/41 · 9.5–11 ms | VERDE |
| SANTA | 11 ms | 28% | 37/37 · 10–12 ms | VERDE |
| KM 402 | 13 ms | 33% | 42/42 · 12.5–15 ms | VERDE |
| FORTALEZA | 29 ms | 73% | 40/40 · pico 801 ms | AMBAR |

*Últimos incidentes* — subhead + "10 activos · MTTR 2 m"; rows (`gap: 6px`) as inner tiles (`padding: 7px 12px`, radius 10px): 7px severity dot · equipment (16px/500, flex) · station (15px/500 muted, 96px) · timestamp (15px/500 muted, 82px, right) · duration (16px/600, 44px, right).

| Equipo | Estación | Hora | Dur | Color |
|---|---|---|---|---|
| PC OCR 805 | Santa | 14/9 14:47 | 0 m | ROJO |
| PC vía 704 | Viru | 14/9 14:13 | 1 m | ROJO |
| PC OCR 808 | Santa | 14/9 13:32 | 0 m | AMBAR |
| Display 602 | KM 402 | 14/9 10:37 | 0 m | AMBAR |
| Display 408 | Fortaleza | 14/9 10:33 | 0 m | AMBAR |

### 6. Cumplimiento de SLA · 30 días (right column, top)
Title 19px/500. Baseline row (`margin-top: 8px`): `97.18` (58px/200, `-0.045em`) + `%` (32px/200, `oklch(0.900 0.015 190)`); right block (16px/500 muted, `line-height: 1.45`): "meta 99.5% · faltan 2.32 pp" / "**132 de 200** equipos bajo meta" (the count in `oklch(0.780 0.150 25)`).

Hero bar: `margin-top: 14px`, `height: 38px`, radius 12px, track `inset 0 0 0 1px oklch(0.480 0.035 190)`, `padding: 5px`; striped fill in `oklch(0.720 0.085 200)`. **Width is normalized to a 90–100% window**: `width = clamp(0, ((pct − 90) / 10) · 100, 100)%`.

Below, `grid repeat(5, 1fr)`, `gap: 8px`, `margin-top: 14px`, centered: percentage (19px/500, colored) over station (14px/500 muted, `margin-top: 4px`).

| Estación | SLA | Color |
|---|---|---|
| Fortaleza | 99.92% | VERDE |
| KM 402 | 97.68% | AMBAR |
| Viru | 97.34% | AMBAR |
| Huarmey | 96.53% | `oklch(0.720 0.150 25)` |
| Santa | 94.18% | `oklch(0.700 0.180 20)` |

### 7. Incidentes de red · detalle (right column, middle)
Header: "Incidentes de red · detalle" + "7 días · agrupados por ráfaga". The 7-day total lives in KPI card 5.

**Caídas por día** (general chart): subhead "Caídas por día" + "pico 8/9 · ráfaga de enlace"; track `height: 52px`, `flex`, `align-items: flex-end`, `gap: 8px`, baseline `inset 0 -1px 0 oklch(0.400 0.028 190)`; 7 striped bars as direct children (`flex: 1 1 0`), height = `clamp(4, (v / 1300) · 100, 100)%`. Labels row `margin-top: 5px`, 13px/500 muted, centered, one line each: `<día> · <valor>` with the value in 600 weight and the bar's color. Color: `≥900 → oklch(0.720 0.150 25)`, `≥500 → AMBAR`, else CIAN.

Data: 8/9 → 1,204 · 9/9 → 812 · 10/9 → 566 · 11/9 → 431 · 12/9 → 604 · 13/9 → 487 · 14/9 → 256

**Por estación** (detail list): divider with `margin-top: 12px; padding-top: 11px`, subhead "Por estación", list `gap: 6px`, `margin-top: 8px`. Row: name (16px/500, 92px) · striped bar (16px) · percent (15px/500 muted, 44px, right) · count (17px/600, 56px, right).

| Estación | n | % | Bar | Color |
|---|---|---|---|---|
| KM 402 | 1,687 | 39% | 100% | CIAN |
| Viru | 1,601 | 37% | 95% | CIAN |
| Fortaleza | 933 | 21% | 55% | LILA |
| Huarmey | 77 | 2% | 6% | `oklch(0.520 0.040 190)` |
| Santa | 62 | 1% | 5% | `oklch(0.520 0.040 190)` |

### 8. Servicios de plataforma (right column, fills remaining height)
Header: "Servicios de plataforma" + "Aunor". Rows `flex column`, `gap: 9px`, `margin-top: 12px`; each an inner tile with `min-height: 48px`, `padding: 8px 16px`, radius 14px, `flex gap: 14px`: 9px status dot · stacked name (17px/500) + detail (15px/500 `oklch(0.680 0.020 190)`) · right-aligned uptime (20px/600) + state (14px/500 muted).

| Servicio | Detalle | Uptime | Estado | Dot / figure |
|---|---|---|---|---|
| Prepago | saldos y recargas · cola 0 | 99.98% | operativo | VERDE / `oklch(0.900 0.015 190)` |
| Facturación | 320 ms · 182 comprobantes en cola | 98.71% | degradado | AMBAR / `oklch(0.860 0.110 78)` |
| Servicio de dominio web | DNS Aunor · réplica secundaria ok | 100% | operativo | VERDE / `oklch(0.900 0.015 190)` |
| Pasarela de tránsitos | 22 ms · lag de réplica 0.4 s | 99.94% | operativo | VERDE / `oklch(0.900 0.015 190)` |

---

## Interactions & Behavior
This is an unattended wall display: **no clicks, no hovers, no navigation, no focus states**. All motion is ambient and CSS-driven:
- Clock ticks every 1000 ms (`HH:MM`, zero-padded, local time).
- `breathe` (2.6s ease-in-out infinite) on the EN VIVO dot and the topology header dot.
- `pk1…pk5` packet dots flow from core to nodes continuously, staggered per node/instance.
- No load or error states are designed. For production, define a stale-data treatment (e.g. dim the card and show "sin datos hace N min") — the current design assumes data is always fresh.

## State Management
Only one piece of local state: `reloj` (clock string) on a 1s interval, cleared on unmount. Everything else is derived from incoming data. Recommended data contracts, one per region:

- `resumenEquipos` → operativos, total, caídos, estacionesReportando
- `degradados` → count, note
- `disponibilidad30d` → pct
- `discrepanciasDac` → pctCoincidencia, discrepancias, transitos, meta, `porHora[{hora, pct}]`, `viasCriticas[{via, estacion, pct, discrepancias, transitos}]`
- `ocr` → total, `series[{nombre, n}]`
- `topologia` → `nodos[{nombre, uptime, ms, equiposOk, equiposTotal, estado}]`, umbralMs, cicloSeg
- `latencias` → per station ms, min/max, equipment counts, pico
- `incidentes` → total7d, activos, mttr, `porDia[{fecha, n}]`, `porEstacion[{estacion, n}]`, `ultimos[{equipo, estacion, ts, duracionMin, severidad}]`
- `sla` → global pct, meta, equiposBajoMeta, total, `porEstacion[{estacion, pct}]`
- `servicios` → `[{nombre, detalle, uptime, estado}]`

Derived in the view, not by the API: bar widths (normalize server values), chart heights (the `escala` clamp), severity colors (threshold functions), percentages, and `es-PE` number formatting.

Two thresholds are tunable in the prototype and should be config, not literals: the SLA window (90–100%) and the hourly-match window (89–100%).

## Design Tokens

**Colors** — see the semantic palette and surfaces tables above (all oklch).

**Spacing** — 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26 px. Gaps: cards 16px, KPI wall 14px, list rows 6–9px, chart bars 6–8px.

**Radius** — 0 (striped fills), 4, 7, 8, 10, 12, 14, 20, 22, 999px.

**Shadows** — card `0 18px 44px oklch(0.09 0.02 190 / 0.55)`; KPI card `0 16px 38px oklch(0.06 0.02 190 / 0.5)`; all borders are `inset 0 0 0 1px`, never `border`.

**Chart geometry** — OCR gauge 440×250 (r 180, stroke 30, ticks r 166→194 @ 2.6); topology 1000×680 (core 485,381; grid 62); hourly track 96px / 12 bars; daily track 52px / 7 bars.

## Assets
None. Every visual is CSS or inline SVG — the logo tile, the gauge, the topology map, the grid pattern and all bars. The only external dependency is the **Manrope** webfont from Google Fonts; substitute the codebase's own font pipeline if it self-hosts.

## Files
- `NOC - Tablero analitico teal.dc.html` — the design reference (markup + the data/derivation logic in its script block; read that block for the exact scaling and color-threshold functions).
- `support.js` — prototype runtime only. **Do not port.**
