import { useEffect, useRef } from 'react'
import type { EstacionLive } from '../api/client'
import { SEMAFORO, TEXTO, PANEL } from '../lib/theme'

// Mapa de conectividad para el tablero SIGMA (design_handoff_sigma/README.md §5) —
// misma mecánica de animación (paquetes viajando por la línea, calculados con
// getPointAtLength) que components/NetworkTopology.tsx usada en /noc, pero con la
// paleta y el núcleo "SIGMA" del rediseño en vez del verde ALEATICA. Vive dentro de
// un <Card> del Dashboard, por eso no trae su propio fondo/borde de panel.

interface Props { estaciones: EstacionLive[]; hud?: boolean }

const W = 900, H = 600
const HUB = { x: 450, y: 300 }
const R_RING = 182, R_NODE = 13
const PACK_DUR = 2000, STAGGER = 400

// Estilo HUD (un solo tono verde azulado): el hue verde 172/175 pasa a 192
const tono = (hud: boolean) => (c: string) => hud ? c.replace(/ 17[25]\)/, ' 192)') : c

// Mismo umbral de latencia que la tarjeta de Latencia del tablero
const UMBRAL_LAT_MS = 24

function statusColor(up: number, total: number, hud = false, lat: number | null = null): string {
  if (total === 0 || up === total) {
    if (lat != null && lat >= UMBRAL_LAT_MS) return hud ? 'oklch(0.93 0.05 195)' : PANEL.naranja
    return hud ? 'oklch(0.82 0.11 192)' : SEMAFORO.ok
  }
  return up / total >= 0.5 ? (hud ? 'oklch(0.93 0.05 195)' : PANEL.naranja) : PANEL.rojo
}

function staPos(i: number, total: number) {
  const deg = -90 + (360 / total) * i
  const rad = (deg * Math.PI) / 180
  return { x: HUB.x + R_RING * Math.cos(rad), y: HUB.y + R_RING * Math.sin(rad), deg }
}

function labelPos(deg: number) {
  const rad = (deg * Math.PI) / 180
  const d = R_RING + R_NODE + 26
  return {
    x: HUB.x + d * Math.cos(rad),
    y: HUB.y + d * Math.sin(rad),
    anchor: Math.cos(rad) > 0.22 ? 'start' : Math.cos(rad) < -0.22 ? 'end' : 'middle',
  }
}

function avgLat(est: EstacionLive): number | null {
  const lats = est.vias.flatMap(v => v.equipos).filter(e => e.monitorear && e.latenciaMs != null).map(e => e.latenciaMs!)
  if (!lats.length) return null
  return Math.round(lats.reduce((a, b) => a + b, 0) / lats.length)
}

export function SigmaTopologia({ estaciones, hud = false }: Props) {
  const T = tono(hud)
  const estRef = useRef(estaciones)
  const lineRefs = useRef<(SVGLineElement | null)[]>([])
  const outRefs = useRef<(SVGCircleElement | null)[]>([])
  const backRefs = useRef<(SVGCircleElement | null)[]>([])

  useEffect(() => { estRef.current = estaciones }, [estaciones])

  useEffect(() => {
    let rafId: number
    let t0: number | null = null
    const loop = (now: number) => {
      if (t0 === null) t0 = now
      const elapsed = now - t0
      estRef.current.forEach((est, i) => {
        const line = lineRefs.current[i], out = outRefs.current[i], back = backRefs.current[i]
        if (!line || !out || !back) return
        const len = line.getTotalLength()
        const total = est.up + est.down
        const col = statusColor(est.up, total, hud, avgLat(est))
        if (est.up === 0) { out.setAttribute('opacity', '0'); back.setAttribute('opacity', '0'); return }
        const off = i * STAGGER
        const tO = ((elapsed + off) % PACK_DUR) / PACK_DUR
        const pO = line.getPointAtLength(tO * len)
        out.setAttribute('cx', pO.x.toFixed(1)); out.setAttribute('cy', pO.y.toFixed(1)); out.setAttribute('fill', col)
        out.setAttribute('opacity', (tO < 0.07 ? tO / 0.07 : tO > 0.88 ? (1 - tO) / 0.12 : 1).toFixed(2))
        const tB = ((elapsed + off + PACK_DUR / 2) % PACK_DUR) / PACK_DUR
        const pB = line.getPointAtLength((1 - tB) * len)
        back.setAttribute('cx', pB.x.toFixed(1)); back.setAttribute('cy', pB.y.toFixed(1)); back.setAttribute('fill', col)
        back.setAttribute('opacity', ((tB < 0.07 ? tB / 0.07 : tB > 0.88 ? (1 - tB) / 0.12 : 1) * 0.65).toFixed(2))
      })
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: '0 0 auto', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: T('oklch(0.840 0.150 172)'), animation: 'breathe 2.6s ease-in-out infinite' }} />
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '.10em', color: T('oklch(0.880 0.090 172)') }}>CONECTIVIDAD DE NODOS DE PEAJE · EN VIVO</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: TEXTO.terciario }}>{estaciones.length} nodos · ciclo 30 s · umbral 24 ms</div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', flex: '1 1 auto', minHeight: 0, display: 'block' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="sigma-grid" width="62" height="62" patternUnits="userSpaceOnUse">
            <path d="M 62 0 L 0 0 0 62" fill="none" stroke="oklch(0.300 0.026 190 / 0.55)" strokeWidth={1} />
          </pattern>
          <radialGradient id="sigma-nucleo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={T('oklch(0.880 0.140 172)')} />
            <stop offset="100%" stopColor={T('oklch(0.680 0.130 175)')} />
          </radialGradient>
        </defs>

        <rect width={W} height={H} fill="url(#sigma-grid)" />
        <circle cx={HUB.x} cy={HUB.y} r={R_RING} fill="none" stroke="oklch(0.760 0.090 200)" strokeWidth={0.5} strokeDasharray="4 14" opacity={0.18} />

        {estaciones.map((est, i) => {
          const { x, y } = staPos(i, estaciones.length)
          const col = statusColor(est.up, est.up + est.down, hud, avgLat(est))
          return (
            <g key={`link-${est.id}`}>
              <line x1={HUB.x} y1={HUB.y} x2={x} y2={y} stroke={col} strokeWidth={3} opacity={0.06} />
              <line ref={el => { lineRefs.current[i] = el }} x1={HUB.x} y1={HUB.y} x2={x} y2={y}
                stroke={col} strokeWidth={1.6} opacity={0.55} strokeDasharray={est.up === 0 ? '4 8' : undefined} />
              <circle ref={el => { outRefs.current[i] = el }} cx={HUB.x} cy={HUB.y} r={5} fill={col} opacity={0} />
              <circle ref={el => { backRefs.current[i] = el }} cx={x} cy={y} r={3.5} fill={col} opacity={0} />
            </g>
          )
        })}

        {estaciones.map((est, i) => {
          const { x, y, deg } = staPos(i, estaciones.length)
          const lbl = labelPos(deg)
          const total = est.up + est.down
          const lat = avgLat(est)
          const col = statusColor(est.up, total, hud, lat)
          const pct = total > 0 ? Math.round(est.up / total * 100) : 100
          return (
            <g key={`node-${est.id}`}>
              {est.up === 0 && [0, 0.9].map((d2, k) => (
                <circle key={k} cx={x} cy={y} fill="none" stroke={col} strokeWidth={1.4}>
                  <animate attributeName="r" from={R_NODE + 2} to={R_NODE + 30} dur="2.4s" begin={`${d2}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="2.4s" begin={`${d2}s`} repeatCount="indefinite" />
                </circle>
              ))}
              <circle cx={x} cy={y} r={26} fill={col} opacity={0.16} />
              <circle cx={x} cy={y} r={15} fill={col} opacity={0.55} />
              <circle cx={x} cy={y} r={7} fill={col} />
              <text x={lbl.x} y={lbl.y} textAnchor={lbl.anchor as 'start' | 'end' | 'middle'} fill={TEXTO.primario} fontSize={16} fontWeight={500}>
                {est.nombre}
              </text>
              <text x={lbl.x} y={lbl.y + 17} textAnchor={lbl.anchor as 'start' | 'end' | 'middle'} fill={TEXTO.terciario} fontSize={13} fontWeight={500}>
                {`${pct}%${lat != null ? ` · ${lat} ms` : ''} · ${est.up}/${total}`}
              </text>
            </g>
          )
        })}

        {/* Núcleo — SIGMA */}
        <circle cx={HUB.x} cy={HUB.y} r={44} fill={T('oklch(0.800 0.130 175)')} opacity={0.14} />
        <circle cx={HUB.x} cy={HUB.y} r={34} fill="url(#sigma-nucleo)" />
        <circle cx={HUB.x} cy={HUB.y} r={34} fill="none" stroke={T('oklch(0.900 0.100 172)')} strokeWidth={1} opacity={0.5} />
        <text x={HUB.x} y={HUB.y + 5} textAnchor="middle" fontSize={16} fontWeight={700} letterSpacing="1.2"
          fill={T('oklch(0.140 0.030 175)')}>SIGMA</text>
      </svg>
    </div>
  )
}
