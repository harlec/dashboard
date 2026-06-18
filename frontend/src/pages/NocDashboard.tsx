import { useState } from 'react'
import type { EquipoLive } from '../api/client'
import { useLiveDashboard }    from '../hooks/useLiveDashboard'
import { NetworkTopology }     from '../components/NetworkTopology'
import { DownEquiposList }     from '../components/DownEquiposList'
import { EquipoModal }         from '../components/EquipoModal'
import { NocLatencyChart, NocStatusChart } from '../components/NocCharts'

function dur(min?: number | null) {
  if (min == null) return '—'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function NocDashboard() {
  const { data, signalStatus, lastUpdate } = useLiveDashboard()
  const [selected, setSelected] = useState<EquipoLive | null>(null)

  if (!data) return (
    <div className="flex items-center justify-center min-h-[60vh] text-muted">Cargando…</div>
  )

  const { kpis, estaciones } = data

  // Equipos caídos para el ticker
  const caidos = estaciones.flatMap(est =>
    est.vias.flatMap(via =>
      via.equipos.filter(eq => eq.monitorear && eq.ultimoEstado === 'DOWN')
        .map(eq => ({ nombre: eq.nombre, estacion: est.nombre, incMin: eq.incMin }))
    )
  ).sort((a, b) => (b.incMin ?? 0) - (a.incMin ?? 0))

  return (
    /* Contenedor full-height (descontando navbar 60px) */
    <div style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', padding: '0 28px', background: 'radial-gradient(1200px 800px at 50% 30%, #0a121b 0%, #06090e 60%, #04060a 100%)' }}>

      {/* ── NOC Header (96px) ── */}
      <div style={{ height: 96, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#e6edf3', letterSpacing: '.01em' }}>
            NOC — Centro de Operaciones
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#5f7186', marginTop: 5, letterSpacing: '.04em' }}>
            {lastUpdate.toLocaleTimeString('es-PE')} · {estaciones.length} estaciones · {kpis.total} equipos monitoreados · RED MPLS AUNOR
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
          {[
            { val: kpis.ups,        label: 'UP',     color: '#3fb978', bg: 'rgba(63,185,120,.08)',  border: 'rgba(63,185,120,.32)'  },
            { val: kpis.downs,      label: 'DOWN',   color: '#ef4b54', bg: 'rgba(239,75,84,.08)',   border: 'rgba(239,75,84,.32)'   },
            { val: kpis.incActivos, label: 'INC',    color: '#e0991f', bg: 'rgba(224,153,31,.08)',  border: 'rgba(224,153,31,.32)'  },
            { val: `${kpis.uptimePct}%`, label: 'UPTIME', color: '#2dd4a7', bg: 'rgba(45,212,167,.08)', border: 'rgba(45,212,167,.32)' },
          ].map(({ val, label, color, bg, border }) => (
            <div key={label} style={{ minWidth: 90, background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 600, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#6b7a8c', marginTop: 6 }}>{label}</div>
            </div>
          ))}

          {/* SignalR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid rgba(63,185,120,.4)', borderRadius: 20, padding: '5px 14px', color: '#3fb978', fontSize: 13 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: signalStatus === 'ok' ? '#3fb978' : signalStatus === 'error' ? '#ef4b54' : '#a09890', boxShadow: signalStatus === 'ok' ? '0 0 8px #3fb978' : 'none', display: 'inline-block' }} />
            {signalStatus === 'ok' ? 'En vivo' : signalStatus === 'error' ? 'Sin conexión' : 'En espera'}
          </div>
        </div>
      </div>

      {/* ── Alert ticker (46px) ── */}
      {caidos.length > 0 ? (
        <div style={{ height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', background: 'linear-gradient(90deg,rgba(239,75,84,.16),rgba(239,75,84,.05))', borderBottom: '1px solid rgba(239,75,84,.28)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4b54', boxShadow: '0 0 10px #ef4b54', display: 'inline-block' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: '#ff9ba0' }}>
              {caidos.length} equipo{caidos.length > 1 ? 's' : ''} caído{caidos.length > 1 ? 's' : ''} en este momento
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'monospace', fontSize: 12, color: '#c98c8f' }}>
            {caidos.slice(0, 3).map((c, i) => (
              <span key={i}>
                {c.nombre} · <span style={{ color: '#ef4b54' }}>{dur(c.incMin)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px', background: 'linear-gradient(90deg,rgba(63,185,120,.10),rgba(63,185,120,.03))', borderBottom: '1px solid rgba(63,185,120,.2)' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3fb978', boxShadow: '0 0 8px #3fb978', display: 'inline-block' }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#3fb978' }}>Todos los equipos operativos — sin incidentes activos</span>
        </div>
      )}

      {/* ── Main grid (flex:1) — mapa izquierda, paneles derecha ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 0.88fr', gap: 16, padding: '16px 0 20px' }}>

        {/* Mapa — columna izquierda, plena altura */}
        <div style={{ minHeight: 0 }}>
          <NetworkTopology estaciones={estaciones} />
        </div>

        {/* Columna derecha — rejilla 2×2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 16, minHeight: 0 }}>

          {/* [0,0] Equipos caídos */}
          <DownEquiposList estaciones={estaciones} onEquipoClick={setSelected} compact />

          {/* [0,1] Resumen general */}
          <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, padding: '14px 18px', overflow: 'auto' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#7d8a9c', marginBottom: 8 }}>RESUMEN GENERAL</div>
            {[
              { label: 'Equipos totales',    val: kpis.total,           color: '#e6edf3' },
              { label: 'Operativos ahora',   val: kpis.ups,             color: '#3fb978' },
              { label: 'Caídos ahora',       val: kpis.downs,           color: kpis.downs > 0 ? '#ef4b54' : '#3fb978' },
              { label: 'Incidentes activos', val: kpis.incActivos,      color: kpis.incActivos > 0 ? '#e0991f' : '#3fb978' },
              { label: 'Uptime período',     val: `${kpis.uptimePct}%`, color: '#2dd4a7' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }} className="last:border-0">
                <span style={{ fontSize: 13, color: '#9aa7b6' }}>{label}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 600, color }}>{val}</span>
              </div>
            ))}
          </div>

          {/* [1,0] Latencia */}
          <NocLatencyChart estaciones={estaciones} />

          {/* [1,1] Estado UP/DOWN */}
          <NocStatusChart estaciones={estaciones} />
        </div>
      </div>

      <EquipoModal equipo={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
