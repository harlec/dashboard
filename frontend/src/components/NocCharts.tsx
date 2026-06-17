import type { EstacionLive } from '../api/client'

function statusColor(up: number, total: number): string {
  if (total === 0 || up === total) return '#4CAF75'
  return up / total >= 0.5 ? '#F59E0B' : '#EF4444'
}

function avgLat(est: EstacionLive): number | null {
  const lats = est.vias.flatMap(v => v.equipos)
    .filter(e => e.monitorear && e.latenciaMs != null).map(e => e.latenciaMs!)
  if (!lats.length) return null
  return Math.round(lats.reduce((a, b) => a + b) / lats.length)
}

const ML = 90   // margen izquierdo para nombres
const MR = 48   // margen derecho para valores
const MT = 32   // margen superior
const RH = 28   // alto por fila
const RG = 10   // gap entre filas

function rowY(i: number) { return MT + i * (RH + RG) }

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
    <div className="bg-[#070d12] rounded-xl border border-[#0F6F5A]/30 overflow-hidden">
      <div className="px-5 py-2.5 border-b border-[#0F6F5A]/20 flex items-center justify-between">
        <span className="text-[0.68rem] text-[#3a7060] font-bold uppercase tracking-[0.18em]">
          Latencia Promedio · ms
        </span>
        <span className="text-[0.62rem] text-[#1a3535] font-mono">por estación</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
        <rect width={W} height={H} fill="#070d12" />

        {rows.map((r, i) => {
          const y     = rowY(i)
          const barW  = r.lat != null ? Math.max((r.lat / maxLat) * (W - ML - MR), 4) : 0
          const label = r.lat != null ? `${r.lat} ms` : '—'
          return (
            <g key={r.name}>
              {/* Nombre */}
              <text x={ML - 6} y={y + RH / 2 + 4.5}
                textAnchor="end" fill="#4a6a62" fontSize="10.5"
                fontFamily="'Segoe UI', Arial, sans-serif">
                {r.name}
              </text>
              {/* Track */}
              <rect x={ML} y={y} width={W - ML - MR} height={RH}
                rx="4" fill="#0a1a14" />
              {/* Barra */}
              {r.lat != null && (
                <rect x={ML} y={y} width={barW} height={RH}
                  rx="4" fill={r.color} opacity="0.75" />
              )}
              {/* Valor */}
              <text x={ML + barW + 6} y={y + RH / 2 + 4.5}
                fill={r.color} fontSize="10" fontWeight="600"
                fontFamily="monospace">
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Estado de equipos por estación ──────────────────────────────
export function NocStatusChart({ estaciones }: { estaciones: EstacionLive[] }) {
  const W = 460
  const H = MT + estaciones.length * (RH + RG) + 16
  const BAR_W = W - ML - MR

  return (
    <div className="bg-[#070d12] rounded-xl border border-[#0F6F5A]/30 overflow-hidden">
      <div className="px-5 py-2.5 border-b border-[#0F6F5A]/20 flex items-center justify-between">
        <span className="text-[0.68rem] text-[#3a7060] font-bold uppercase tracking-[0.18em]">
          Estado de Equipos · UP / DOWN
        </span>
        <span className="text-[0.62rem] text-[#1a3535] font-mono">por estación</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
        <rect width={W} height={H} fill="#070d12" />

        {estaciones.map((est, i) => {
          const total  = est.up + est.down
          const upPct  = total > 0 ? est.up / total : 1
          const col    = statusColor(est.up, total)
          const upW    = Math.round(upPct * BAR_W)
          const downW  = BAR_W - upW
          const y      = rowY(i)

          return (
            <g key={est.id}>
              {/* Nombre */}
              <text x={ML - 6} y={y + RH / 2 + 4.5}
                textAnchor="end" fill="#4a6a62" fontSize="10.5"
                fontFamily="'Segoe UI', Arial, sans-serif">
                {est.nombre}
              </text>
              {/* Track */}
              <rect x={ML} y={y} width={BAR_W} height={RH} rx="4" fill="#0a1a14" />
              {/* UP */}
              {upW > 0 && (
                <rect x={ML} y={y} width={upW} height={RH}
                  rx="4" fill={col} opacity="0.78" />
              )}
              {/* DOWN */}
              {downW > 0 && (
                <rect x={ML + upW} y={y} width={downW} height={RH}
                  rx="4" fill="#EF4444" opacity="0.70" />
              )}
              {/* Valor */}
              <text x={W - MR + 4} y={y + RH / 2 + 4.5}
                fill={col} fontSize="10" fontWeight="600"
                fontFamily="monospace">
                {est.up}/{total}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
