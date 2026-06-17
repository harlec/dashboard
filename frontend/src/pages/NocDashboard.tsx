import { useState } from 'react'
import type { EquipoLive } from '../api/client'
import { useLiveDashboard }    from '../hooks/useLiveDashboard'
import { NetworkTopology }     from '../components/NetworkTopology'
import { DownEquiposList }     from '../components/DownEquiposList'
import { EquipoModal }         from '../components/EquipoModal'
import { NocLatencyChart, NocStatusChart } from '../components/NocCharts'

export function NocDashboard() {
  const { data, signalStatus, lastUpdate } = useLiveDashboard()
  const [selected, setSelected] = useState<EquipoLive | null>(null)

  if (!data) return (
    <div className="flex items-center justify-center min-h-[60vh] text-muted">Cargando…</div>
  )

  const { kpis, estaciones } = data

  return (
    <div className="px-5 py-4 pb-10 flex flex-col gap-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between bg-surface rounded-xl px-5 py-3 border border-border">
        <div>
          <div className="text-[0.95rem] font-extrabold text-[#eae7e4]">NOC — Centro de Operaciones</div>
          <div className="text-[0.7rem] text-muted mt-0.5">
            {lastUpdate.toLocaleTimeString('es-PE')} · {estaciones.length} estaciones · {kpis.total} equipos monitoreados
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {[
            { val: kpis.ups,        label: 'UP',      color: 'text-brand-light' },
            { val: kpis.downs,      label: 'DOWN',    color: 'text-danger'      },
            { val: kpis.incActivos, label: 'INC',     color: 'text-warn'        },
            { val: `${kpis.uptimePct}%`, label: 'UPTIME', color: 'text-brand'  },
          ].map(({ val, label, color }) => (
            <div key={label} className="flex flex-col items-center bg-surface-2 rounded-lg px-3 py-1.5 border border-border min-w-[58px]">
              <span className={`text-[1.2rem] font-extrabold leading-none ${color}`}>{val}</span>
              <span className="text-[0.55rem] text-muted uppercase tracking-wide mt-0.5">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-[0.72rem] text-white/70 bg-white/[0.06] px-2.5 py-1.5 rounded-full border border-white/10">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              signalStatus === 'ok' ? 'bg-brand-light animate-ping-pulse' :
              signalStatus === 'error' ? 'bg-danger' : 'bg-[#a09890]'
            }`} />
            <span>{signalStatus === 'ok' ? 'En vivo' : signalStatus === 'error' ? 'Sin conexión' : 'En espera'}</span>
          </div>
        </div>
      </div>

      {/* ── Alert ── */}
      {kpis.downs > 0 && (
        <div className="flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl px-5 py-2.5 animate-blink-down">
          <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
          <span className="text-danger font-bold text-[0.84rem]">
            {kpis.downs} equipo{kpis.downs > 1 ? 's' : ''} caído{kpis.downs > 1 ? 's' : ''} en este momento
          </span>
        </div>
      )}

      {/* ── Fila principal: mapa + columna derecha ── */}
      <div className="grid grid-cols-[1fr_290px] gap-3 items-stretch">

        {/* Topología animada */}
        <NetworkTopology estaciones={estaciones} />

        {/* Columna derecha: lista caídos + panel KPI */}
        <div className="flex flex-col gap-3">

          {/* Equipos caídos — modo compacto estilo Threatrix */}
          <div className="flex-1 min-h-0">
            <DownEquiposList
              estaciones={estaciones}
              onEquipoClick={setSelected}
              compact
            />
          </div>

          {/* Panel de tendencias / KPI resumen */}
          <div className="bg-surface rounded-xl border border-border flex-shrink-0">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <span className="text-[0.65rem] text-muted font-bold uppercase tracking-widest">
                Resumen General
              </span>
            </div>
            <div className="px-4 py-2 flex flex-col gap-0">
              {[
                { label: 'Equipos totales',  val: kpis.total,               valClass: 'text-[#ccc8c4]' },
                { label: 'Operativos ahora', val: kpis.ups,                  valClass: 'text-brand-light' },
                { label: 'Caídos ahora',     val: kpis.downs,                valClass: kpis.downs > 0 ? 'text-danger' : 'text-brand-light' },
                { label: 'Incidentes activos', val: kpis.incActivos,         valClass: kpis.incActivos > 0 ? 'text-warn' : 'text-brand-light' },
                { label: 'Uptime período',   val: `${kpis.uptimePct}%`,      valClass: 'text-brand' },
              ].map(({ label, val, valClass }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
                  <span className="text-[0.72rem] text-muted">{label}</span>
                  <span className={`text-[0.82rem] font-bold ${valClass}`}>{val}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Fila inferior: dos gráficas ── */}
      <div className="grid grid-cols-2 gap-3">
        <NocLatencyChart estaciones={estaciones} />
        <NocStatusChart  estaciones={estaciones} />
      </div>

      <EquipoModal equipo={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
