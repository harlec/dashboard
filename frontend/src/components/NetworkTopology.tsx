import { useEffect, useRef } from 'react'
import type { EstacionLive } from '../api/client'

interface Props { estaciones: EstacionLive[] }

const W        = 900
const H        = 600
const HUB      = { x: 450, y: 298 }
const R_RING   = 182
const R_NODE   = 13
const R_HUB    = 26
const PACK_DUR = 2000
const STAGGER  = 400

// Verde si 100% operativo · Ámbar si algo down · Rojo si mayoría down
function statusColor(up: number, total: number): string {
  if (total === 0 || up === total) return '#4CAF75'
  return up / total >= 0.5 ? '#F59E0B' : '#EF4444'
}

// Path de sector de pastel (sentido horario desde la cima)
function sector(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const s  = ((fromDeg - 90) * Math.PI) / 180
  const e  = ((toDeg   - 90) * Math.PI) / 180
  const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
  const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
  const large = (toDeg - fromDeg) > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
}

function staPos(i: number, total: number) {
  const deg = -90 + (360 / total) * i
  const rad = (deg * Math.PI) / 180
  return { x: HUB.x + R_RING * Math.cos(rad), y: HUB.y + R_RING * Math.sin(rad), deg }
}

function labelPos(deg: number) {
  const rad = (deg * Math.PI) / 180
  const d   = R_RING + R_NODE + 24
  return {
    x:      HUB.x + d * Math.cos(rad),
    y:      HUB.y + d * Math.sin(rad),
    anchor: Math.cos(rad) > 0.22 ? 'start' : Math.cos(rad) < -0.22 ? 'end' : 'middle',
  }
}

function avgLat(est: EstacionLive): number | null {
  const lats = est.vias.flatMap(v => v.equipos)
    .filter(e => e.monitorear && e.latenciaMs != null).map(e => e.latenciaMs!)
  if (!lats.length) return null
  return Math.round(lats.reduce((a, b) => a + b) / lats.length)
}

// Mini pie SVG en posición (cx,cy) con radio r
function MiniPie({ cx, cy, r, upPct, col }: { cx:number; cy:number; r:number; upPct:number; col:string }) {
  const upDeg = upPct * 360
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#06101a" />
      {/* Sector UP */}
      {upPct > 0.005 && upPct < 0.995
        ? <path d={sector(cx, cy, r, 0, upDeg)} fill={col} opacity="0.85" />
        : upPct >= 0.995
        ? <circle cx={cx} cy={cy} r={r} fill={col} opacity="0.85" />
        : null}
      {/* Sector DOWN */}
      {upPct < 0.995 && upPct > 0.005
        ? <path d={sector(cx, cy, r, upDeg, 360)} fill="#EF4444" opacity="0.55" />
        : upPct <= 0.005
        ? <circle cx={cx} cy={cy} r={r} fill="#EF4444" opacity="0.85" />
        : null}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth="0.8" opacity="0.6" />
    </g>
  )
}

export function NetworkTopology({ estaciones }: Props) {
  const estRef   = useRef(estaciones)
  const lineRefs = useRef<(SVGLineElement   | null)[]>([])
  const outRefs  = useRef<(SVGCircleElement | null)[]>([])
  const backRefs = useRef<(SVGCircleElement | null)[]>([])

  useEffect(() => { estRef.current = estaciones }, [estaciones])

  useEffect(() => {
    let rafId: number
    let t0: number | null = null
    const loop = (now: number) => {
      if (t0 === null) t0 = now
      const elapsed = now - t0
      estRef.current.forEach((est, i) => {
        const line = lineRefs.current[i]
        const out  = outRefs.current[i]
        const back = backRefs.current[i]
        if (!line || !out || !back) return
        const len   = line.getTotalLength()
        const total = est.up + est.down
        const col   = statusColor(est.up, total)
        if (est.up === 0) {
          out.setAttribute('opacity', '0')
          back.setAttribute('opacity', '0')
          return
        }
        const off = i * STAGGER
        const tO  = ((elapsed + off) % PACK_DUR) / PACK_DUR
        const pO  = line.getPointAtLength(tO * len)
        out.setAttribute('cx', pO.x.toFixed(1))
        out.setAttribute('cy', pO.y.toFixed(1))
        out.setAttribute('fill', col)
        out.setAttribute('opacity', (tO < 0.07 ? tO / 0.07 : tO > 0.88 ? (1 - tO) / 0.12 : 1).toFixed(2))
        const tB  = ((elapsed + off + PACK_DUR / 2) % PACK_DUR) / PACK_DUR
        const pB  = line.getPointAtLength((1 - tB) * len)
        back.setAttribute('cx', pB.x.toFixed(1))
        back.setAttribute('cy', pB.y.toFixed(1))
        back.setAttribute('fill', col)
        back.setAttribute('opacity', ((tB < 0.07 ? tB / 0.07 : tB > 0.88 ? (1 - tB) / 0.12 : 1) * 0.65).toFixed(2))
      })
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="bg-[#070d12] rounded-xl border border-[#0F6F5A]/30 overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#0F6F5A]/20 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4CAF75] opacity-70" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#4CAF75]" />
          </span>
          <span className="text-[0.7rem] text-[#3a7060] font-bold uppercase tracking-[0.18em]">
            Topología de Red · Heartbeat en Vivo
          </span>
        </div>
        <span className="text-[0.66rem] text-[#1a3535] font-mono">
          {estaciones.length} nodos · ciclo 30 s
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 min-h-0" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="nt-g" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#0F6F5A" strokeWidth="0.35" opacity="0.15" />
          </pattern>
          <filter id="f-gn" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="13" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="f-am" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="14" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="f-rd" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="15" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="f-pk" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="4.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="f-hub" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="18" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <rect width={W} height={H} fill="#070d12" />
        <rect width={W} height={H} fill="url(#nt-g)" />

        {/* Anillo guía */}
        <circle cx={HUB.x} cy={HUB.y} r={R_RING}
          fill="none" stroke="#0F6F5A" strokeWidth="0.5"
          strokeDasharray="4 14" opacity="0.13" />

        {/* Líneas y paquetes (debajo de nodos) */}
        {estaciones.map((est, i) => {
          const { x, y }  = staPos(i, estaciones.length)
          const total = est.up + est.down
          const col   = statusColor(est.up, total)
          return (
            <g key={`link-${est.id}`}>
              <line x1={HUB.x} y1={HUB.y} x2={x} y2={y}
                stroke={col} strokeWidth="3" opacity="0.05" />
              <line ref={el => { lineRefs.current[i] = el }}
                x1={HUB.x} y1={HUB.y} x2={x} y2={y}
                stroke={col} strokeWidth="1" opacity="0.20"
                strokeDasharray={est.up === 0 ? '4 8' : ''} />
              <circle ref={el => { outRefs.current[i] = el }}
                cx={HUB.x} cy={HUB.y} r="5" fill={col} opacity="0" filter="url(#f-pk)" />
              <circle ref={el => { backRefs.current[i] = el }}
                cx={x} cy={y} r="3.5" fill={col} opacity="0" filter="url(#f-pk)" />
            </g>
          )
        })}

        {/* Nodos estación */}
        {estaciones.map((est, i) => {
          const { x, y, deg } = staPos(i, estaciones.length)
          const lbl   = labelPos(deg)
          const total = est.up + est.down
          const upPct = total > 0 ? est.up / total : 1
          const col   = statusColor(est.up, total)
          const lat   = avgLat(est)
          const pct   = Math.round(upPct * 100)
          const glowF = col === '#4CAF75' ? 'f-gn' : col === '#F59E0B' ? 'f-am' : 'f-rd'
          const lblFill = col === '#4CAF75' ? '#ccc8c4' : col === '#F59E0B' ? '#F5C56A' : '#FF8888'
          const lblFill2 = col === '#4CAF75' ? '#1e4040' : col === '#F59E0B' ? '#6a4208' : '#5a1a1a'

          return (
            <g key={`node-${est.id}`}>
              {/* Pulso si todo caído */}
              {est.up === 0 && [0, 0.9].map((d2, k) => (
                <circle key={k} cx={x} cy={y} fill="none" stroke={col} strokeWidth="1.4">
                  <animate attributeName="r" from={R_NODE + 2} to={R_NODE + 34}
                    dur="2.4s" begin={`${d2}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0"
                    dur="2.4s" begin={`${d2}s`} repeatCount="indefinite" />
                </circle>
              ))}

              {/* Glow + cuerpo */}
              <circle cx={x} cy={y} r={R_NODE} fill={col} opacity="0.20" filter={`url(#${glowF})`} />
              <circle cx={x} cy={y} r={R_NODE} fill={col} opacity="0.10" />
              <circle cx={x} cy={y} r={R_NODE} fill="none" stroke={col} strokeWidth="1.4" opacity="0.60" />

              {/* Pastel dentro del nodo */}
              <MiniPie cx={x} cy={y} r={5} upPct={upPct} col={col} />

              {/* Nombre */}
              <text x={lbl.x} y={lbl.y + 2}
                textAnchor={lbl.anchor as 'start'|'end'|'middle'}
                fill={lblFill} fontSize="12" fontWeight="700"
                fontFamily="'Segoe UI', Arial, sans-serif">
                {est.nombre}
              </text>

              {/* Stats */}
              <text x={lbl.x} y={lbl.y + 16}
                textAnchor={lbl.anchor as 'start'|'end'|'middle'}
                fill={lblFill2} fontSize="9"
                fontFamily="'Segoe UI', Arial, sans-serif">
                {`${pct}%`}{lat != null ? ` · ${lat}ms` : ''}{` · ${est.up}/${total}`}
              </text>
            </g>
          )
        })}

        {/* Hub — PULSO VIAL */}
        <circle cx={HUB.x} cy={HUB.y} r={R_HUB}
          fill="#0F6F5A" opacity="0.50" filter="url(#f-hub)" />
        <circle cx={HUB.x} cy={HUB.y} r={R_HUB + 9}
          fill="none" stroke="#4CAF75" strokeWidth="0.5"
          strokeDasharray="2 8" opacity="0.18" />
        <circle cx={HUB.x} cy={HUB.y} r={R_HUB}
          fill="#0F6F5A" stroke="#4CAF75" strokeWidth="1.5" opacity="0.88" />
        <circle cx={HUB.x} cy={HUB.y} r={R_HUB - 7}
          fill="none" stroke="#4CAF75" strokeWidth="0.6" opacity="0.35" />
        <text x={HUB.x} y={HUB.y - 3} textAnchor="middle"
          fill="#DAFFF0" fontSize="7.5" fontWeight="900"
          fontFamily="'Segoe UI', Arial, sans-serif" letterSpacing="1">
          PULSO
        </text>
        <text x={HUB.x} y={HUB.y + 8} textAnchor="middle"
          fill="#DAFFF0" fontSize="7.5" fontWeight="900"
          fontFamily="'Segoe UI', Arial, sans-serif" letterSpacing="1">
          VIAL
        </text>

        {/* Watermark */}
        <text x="16" y={H - 14} fill="#0b2520" fontSize="7.5" fontFamily="monospace">
          RED MPLS AUNOR · ciclo 30s
        </text>
        <text x={W - 16} y={H - 14} textAnchor="end" fill="#0b2520" fontSize="7.5" fontFamily="monospace">
          {estaciones.length} peajes · {estaciones.reduce((a, e) => a + e.up + e.down, 0)} equipos
        </text>
      </svg>
    </div>
  )
}
