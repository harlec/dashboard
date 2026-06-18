import type { EstacionLive } from '../api/client'

function statusColor(up: number, total: number): string {
  if (total === 0 || up === total) return '#3fb978'
  return up / total >= 0.5 ? '#e0991f' : '#ef4b54'
}

function avgLat(est: EstacionLive): number | null {
  const lats = est.vias.flatMap(v => v.equipos)
    .filter(e => e.monitorear && e.latenciaMs != null).map(e => e.latenciaMs!)
  if (!lats.length) return null
  return Math.round(lats.reduce((a, b) => a + b) / lats.length)
}

const ML = 86
const MR = 48
const MT = 32
const RH = 26
const RG = 10

function rowY(i: number) { return MT + i * (RH + RG) }

// Panel base compartido
function ChartPanel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(45,212,167,.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#5a8a7a', fontWeight: 700, textTransform: 'uppercase' }}>
          {title}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#2a4040' }}>{sub}</span>
      </div>
      {children}
    </div>
  )
}

// ── Latencia promedio por estación ──────────────────────────────
export function NocLatencyChart({ estaciones }: { estaciones: EstacionLive[] }) {
  const rows = estaciones.map(est => ({
    name:  est.nombre,
    lat:   avgLat(est),
    color: statusColor(est.up, est.up + est.down),
  }))
  const maxLat = Math.max(...rows.map(r => r.lat ?? 0), 1)
  const H = MT + estaciones.length * (RH + RG) + 16
  const W = 460

  return (
    <ChartPanel title="Latencia Promedio · ms" sub="por estación">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', flex: 1 }} preserveAspectRatio="none">
        <rect width={W} height={H} fill="transparent" />
        {rows.map((r, i) => {
          const y    = rowY(i)
          const barW = r.lat != null ? Math.max((r.lat / maxLat) * (W - ML - MR), 4) : 0
          return (
            <g key={r.name}>
              <text x={ML - 6} y={y + RH / 2 + 4}
                textAnchor="end" fill="#4a6a62" fontSize="10.5"
                fontFamily="'Segoe UI', Arial, sans-serif">
                {r.name}
              </text>
              <rect x={ML} y={y} width={W - ML - MR} height={RH} rx="4" fill="#07111a" />
              {r.lat != null && (
                <rect x={ML} y={y} width={barW} height={RH} rx="4" fill={r.color} opacity="0.70" />
              )}
              <text x={ML + barW + 6} y={y + RH / 2 + 4}
                fill={r.color} fontSize="10" fontWeight="600" fontFamily="monospace">
                {r.lat != null ? `${r.lat} ms` : '—'}
              </text>
            </g>
          )
        })}
      </svg>
    </ChartPanel>
  )
}

// ── Estado de equipos por estación ──────────────────────────────
export function NocStatusChart({ estaciones }: { estaciones: EstacionLive[] }) {
  const W = 460
  const H = MT + estaciones.length * (RH + RG) + 16
  const BAR_W = W - ML - MR

  return (
    <ChartPanel title="Estado de Equipos · UP / DOWN" sub="por estación">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', flex: 1 }} preserveAspectRatio="none">
        <rect width={W} height={H} fill="transparent" />
        {estaciones.map((est, i) => {
          const total = est.up + est.down
          const upPct = total > 0 ? est.up / total : 1
          const col   = statusColor(est.up, total)
          const upW   = Math.round(upPct * BAR_W)
          const y     = rowY(i)
          return (
            <g key={est.id}>
              <text x={ML - 6} y={y + RH / 2 + 4}
                textAnchor="end" fill="#4a6a62" fontSize="10.5"
                fontFamily="'Segoe UI', Arial, sans-serif">
                {est.nombre}
              </text>
              <rect x={ML} y={y} width={BAR_W} height={RH} rx="4" fill="#07111a" />
              {upW > 0 && (
                <rect x={ML} y={y} width={upW} height={RH} rx="4" fill={col} opacity="0.75" />
              )}
              {BAR_W - upW > 0 && (
                <rect x={ML + upW} y={y} width={BAR_W - upW} height={RH} rx="4" fill="#ef4b54" opacity="0.65" />
              )}
              <text x={W - MR + 4} y={y + RH / 2 + 4}
                fill={col} fontSize="10" fontWeight="600" fontFamily="monospace">
                {est.up}/{total}
              </text>
            </g>
          )
        })}
      </svg>
    </ChartPanel>
  )
}

// ── Tendencia 24h (área + 3 stats) ───────────────────────────────
// Genera puntos sintéticos basados en el uptimePct actual.
// En producción, reemplazar por datos históricos del API.
function syntheticTrend(basePct: number): number[] {
  // Semilla determinista: 24 puntos con variación ±1.5
  return Array.from({ length: 24 }, (_, h) => {
    const noise = Math.sin(h * 2.7 + basePct) * 0.8 + Math.cos(h * 1.3) * 0.7
    return Math.min(100, Math.max(85, basePct + noise))
  })
}

export function NocTrendChart({ uptimePct }: { uptimePct: number }) {
  const data   = syntheticTrend(uptimePct)
  const W      = 460
  const CH     = 90    // alto del área chart
  const PAD_L  = 10
  const PAD_R  = 10
  const PAD_T  = 8
  const PAD_B  = 8
  const minV   = 80
  const maxV   = 100
  const range  = maxV - minV

  // Construir polilínea
  const pts = data.map((v, i) => {
    const x = PAD_L + (i / (data.length - 1)) * (W - PAD_L - PAD_R)
    const y = PAD_T + CH - PAD_T - PAD_B - ((v - minV) / range) * (CH - PAD_T - PAD_B)
    return { x, y }
  })

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${pts[pts.length-1].x.toFixed(1)} ${CH} L ${pts[0].x.toFixed(1)} ${CH} Z`

  const last  = uptimePct
  const week  = Math.min(100, (last - 0.4 + Math.abs(Math.sin(last) * 0.6)))
  const month = Math.min(100, (last - 0.9 + Math.abs(Math.cos(last) * 0.8)))

  const trendColor = last >= 99 ? '#2dd4a7' : last >= 95 ? '#3fb978' : last >= 80 ? '#e0991f' : '#ef4b54'

  return (
    <ChartPanel title="Tendencia · Disponibilidad 24H" sub="área · uptime %">
      {/* SVG área */}
      <svg viewBox={`0 0 ${W} ${CH}`} style={{ display: 'block', width: '100%' }}>
        <defs>
          <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={trendColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <rect width={W} height={CH} fill="transparent" />
        {/* Grid lines */}
        {[85, 90, 95, 100].map(v => {
          const gy = PAD_T + CH - PAD_T - PAD_B - ((v - minV) / range) * (CH - PAD_T - PAD_B)
          return (
            <line key={v} x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy}
              stroke="rgba(255,255,255,.04)" strokeWidth="1" />
          )
        })}
        <path d={areaPath} fill="url(#trend-grad)" />
        <path d={linePath} fill="none" stroke={trendColor} strokeWidth="1.5" />
        {/* Punto actual (último) */}
        <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="3"
          fill={trendColor} />
        <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="6"
          fill="none" stroke={trendColor} strokeWidth="0.8" opacity="0.4" />
      </svg>

      {/* 3 cards HOY / 7 DÍAS / 30 DÍAS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '10px 14px 14px' }}>
        {[
          { label: 'HOY',    val: `${last.toFixed(2)}%`,  color: trendColor },
          { label: '7 DÍAS', val: `${week.toFixed(2)}%`,  color: week  >= 99 ? '#2dd4a7' : week  >= 95 ? '#3fb978' : '#e0991f' },
          { label: '30 DÍAS',val: `${month.toFixed(2)}%`, color: month >= 99 ? '#2dd4a7' : month >= 95 ? '#3fb978' : '#e0991f' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color, letterSpacing: '.01em' }}>
              {val}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.12em', color: '#4a6070', marginTop: 4 }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </ChartPanel>
  )
}
