import { useEffect, useState } from 'react'
import { api, type EquipoDetail, type EquipoLive } from '../api/client'

interface Props { equipo: EquipoLive | null; onClose: () => void }

function formatTs(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-PE', { hour12: false })
}

function dur(min?: number | null) {
  if (min == null) return '—'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function EquipoModal({ equipo, onClose }: Props) {
  const [detail, setDetail] = useState<EquipoDetail | null>(null)

  useEffect(() => {
    if (!equipo) { setDetail(null); return }
    api.equipoDetail(equipo.id).then(setDetail).catch(console.error)
  }, [equipo?.id])

  if (!equipo) return null

  const estadoColor = {
    UP:   'text-brand',
    DOWN: 'text-danger',
  }[equipo.ultimoEstado ?? ''] ?? 'text-muted'

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-2 rounded-2xl w-full max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-[#38332F]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#38332F]">
          <div className="font-bold text-[1rem] text-[#eae7e4]">{equipo.nombre}</div>
          <button
            onClick={onClose}
            className="text-muted hover:bg-[#2D1212] hover:text-danger px-2 py-1 rounded-md transition-colors"
          >✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: 'Estado',    value: equipo.ultimoEstado ?? 'Sin datos', cls: estadoColor },
              { label: 'Latencia',  value: equipo.latenciaMs != null ? `${Math.round(equipo.latenciaMs)}ms` : '—' },
              { label: 'IP',        value: equipo.ip },
              { label: 'Tipo',      value: equipo.tipoNombre },
              { label: 'Último ping', value: formatTs(equipo.ultimoPing) },
              { label: 'Inc. activo', value: equipo.incMin != null ? dur(equipo.incMin) : 'No' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-surface-3 rounded-lg px-3 py-2.5">
                <div className="text-[0.66rem] text-muted font-bold uppercase">{label}</div>
                <div className={`text-[1rem] font-extrabold mt-0.5 text-[#eae7e4] ${cls ?? ''}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Historial */}
          <div className="text-[0.78rem] font-bold text-muted uppercase mb-2">Historial reciente</div>
          {!detail ? (
            <div className="text-center py-5 text-muted">Cargando…</div>
          ) : (
            <table className="w-full text-[0.82rem] border-collapse">
              <thead>
                <tr>
                  {['Timestamp', 'Estado', 'Latencia'].map(h => (
                    <th key={h} className="text-left px-2 py-1.5 border-b-2 border-[#38332F] text-[0.7rem] text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.historial.map((row, i) => (
                  <tr key={i} className="border-b border-[#2a2826]">
                    <td className="px-2 py-1.5 text-[#d4cec9]">{formatTs(row.timestamp)}</td>
                    <td className={`px-2 py-1.5 font-bold ${row.estado === 'UP' ? 'text-brand' : 'text-danger'}`}>{row.estado}</td>
                    <td className="px-2 py-1.5 text-[#d4cec9]">{row.latenciaMs != null ? `${Math.round(row.latenciaMs)}ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
