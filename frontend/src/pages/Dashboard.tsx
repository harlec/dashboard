import { useEffect, useState, useCallback } from 'react'
import { api, type LiveDashboard, type EquipoLive, type CamaraStatus } from '../api/client'
import { DonutChart }     from '../components/DonutChart'
import { StationMatrix }  from '../components/StationMatrix'
import { EquipoModal }    from '../components/EquipoModal'
import { CamarasSection } from '../components/CamarasSection'
import { useSignalR }     from '../hooks/useSignalR'
import { useAlertSound }  from '../hooks/useAlertSound'

export function Dashboard() {
  const [data,          setData]     = useState<LiveDashboard | null>(null)
  const [camaras,       setCamaras]  = useState<CamaraStatus[]>([])
  const [selectedEquipo, setSelected] = useState<EquipoLive | null>(null)
  const [signalStatus,  setSignal]   = useState<'idle'|'ok'|'error'>('idle')
  const [lastUpdate,    setLastUpdate] = useState<Date>(new Date())
  const [muted,         setMuted]    = useState(false)
  const { playDown, playUp, toggleMute } = useAlertSound()

  const load = useCallback(async () => {
    try {
      const [live, cams] = await Promise.all([api.liveDashboard(), api.camaras()])
      setData(live)
      setCamaras(cams)
      setLastUpdate(new Date())
      setSignal('ok')
    } catch {
      setSignal('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // SignalR — actualizaciones en tiempo real
  useSignalR({
    onEquipoStatusChanged: (equipoId, estado, latenciaMs, timestamp) => {
      setSignal('ok')
      // Sonido de alerta
      if (estado === 'DOWN') playDown()
      else if (estado === 'UP') playUp()
      setData(prev => {
        if (!prev) return prev
        const estaciones = prev.estaciones.map(est => ({
          ...est,
          vias: est.vias.map(via => ({
            ...via,
            equipos: via.equipos.map(eq =>
              eq.id === equipoId
                ? { ...eq, ultimoEstado: estado, latenciaMs: latenciaMs ?? undefined, ultimoPing: timestamp }
                : eq)
          }))
        }))
        return { ...prev, estaciones }
      })
      setLastUpdate(new Date())
    },
    onKpiUpdated: (ups, downs, total, incActivos) => {
      setData(prev => {
        if (!prev) return prev
        const sinDatos  = total - ups - downs
        const uptimePct = total > 0 ? Math.round(ups / total * 100) : 0
        return { ...prev, kpis: { ...prev.kpis, ups, downs, total, sinDatos, incActivos, uptimePct } }
      })
    },
    onCamaraUpdated: (camara, ultimoEmail, minDesdeEmail, online) => {
      setCamaras(prev =>
        prev.map(c => c.camara === camara ? { ...c, ultimoEmail, minDesdeEmail, online } : c))
    },
  })

  if (!data) return (
    <div className="flex items-center justify-center min-h-[60vh] text-muted">
      Cargando…
    </div>
  )

  const { kpis, estaciones } = data
  const sinD = Math.max(kpis.total - kpis.ups - kpis.downs - kpis.incActivos, 0)

  return (
    <div className="px-5 py-4 pb-10">
      {/* Topbar */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-6 bg-surface rounded-xl px-7 py-4 mb-3.5">
        {/* Left */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[1.1rem] font-extrabold text-[#eae7e4]">Estado en Tiempo Real</div>
          <div className="text-[0.8rem] text-muted">
            Actualizado: <b className="text-[#d4cec9]">{lastUpdate.toLocaleTimeString('es-PE')}</b>
          </div>
          <div className="text-[0.75rem] text-dim">
            {new Date().toLocaleDateString('es-PE')} · {estaciones.length} estaciones activas
          </div>
        </div>

        {/* Center: donut + leyenda */}
        <div className="flex justify-center items-center gap-7">
          <DonutChart ups={kpis.ups} downs={kpis.downs} incActivos={kpis.incActivos} total={kpis.total} />
          <div className="flex flex-col gap-2.5">
            {[
              { color: '#72BF44', val: kpis.ups,       label: 'Operativos' },
              { color: '#F04545', val: kpis.downs,      label: 'Caídos' },
              { color: '#F99B1C', val: kpis.incActivos, label: 'Incidentes' },
              { color: '#38332F', val: sinD,             label: 'Sin datos', textColor: '#a09890' },
            ].map(({ color, val, label, textColor }) => (
              <div key={label} className="flex items-center gap-2.5 text-[0.88rem]">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="font-extrabold text-[1.1rem] min-w-[32px] text-right"
                  style={{ color: textColor ?? color }}>{val}</span>
                <span className="text-muted">{label}</span>
              </div>
            ))}
          </div>

          <div className="w-px h-20 bg-border" />

          <div className="flex flex-col items-center gap-0.5">
            <div className="text-[2.8rem] font-extrabold text-brand leading-none">{kpis.uptimePct}%</div>
            <div className="text-[0.78rem] text-muted uppercase tracking-widest">Uptime</div>
          </div>
        </div>

        {/* Right: status + mute */}
        <div className="flex flex-col items-end gap-2">
          <div className={`flex items-center gap-1.5 text-[0.75rem] text-white/70
            bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              signalStatus === 'ok' ? 'bg-brand animate-ping-pulse' :
              signalStatus === 'error' ? 'bg-danger' : 'bg-[#a09890]'
            }`} />
            <span>{signalStatus === 'ok' ? 'En vivo' : signalStatus === 'error' ? 'Sin conexión' : 'En espera'}</span>
          </div>
          <button
            onClick={() => setMuted(toggleMute())}
            title={muted ? 'Activar alertas sonoras' : 'Silenciar alertas sonoras'}
            className="text-[0.75rem] bg-white/[0.06] border border-white/10 px-2.5 py-1 rounded-full
              text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            {muted ? '🔇 Silenciado' : '🔔 Sonido activo'}
          </button>
        </div>
      </div>

      {/* Matriz de equipos */}
      <StationMatrix estaciones={estaciones} onEquipoClick={setSelected} />

      {/* Sección inferior */}
      <div className="mt-3.5 flex flex-col gap-3">
        {camaras.length > 0 && <CamarasSection camaras={camaras} />}
      </div>

      {/* Modal */}
      <EquipoModal equipo={selectedEquipo} onClose={() => setSelected(null)} />
    </div>
  )
}
