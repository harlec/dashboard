import { useEffect, useState } from 'react'
import { api, type IncidenteDetalle } from '../api/client'
import { TIPO_LABELS, TIPO_COLORS } from '../lib/incidentes'

interface Props { id: number | null; onClose: () => void }

const ENLACE_COLORS: Record<string, string> = {
  MPLS: 'text-brand', STARLINK: 'text-warn', SIN_CONEXION: 'text-danger', DESCONOCIDO: 'text-muted',
}

function fmt(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-PE', { hour12: false })
}

function fmtHora(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleTimeString('es-PE', { hour12: false })
}

function dur(min?: number | null) {
  if (min == null) return 'Activo'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function IncidenteDetalleModal({ id, onClose }: Props) {
  const [detalle, setDetalle] = useState<IncidenteDetalle | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (id == null) { setDetalle(null); return }
    setLoading(true)
    api.incidenteDetalle(id)
      .then(setDetalle)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (id == null) return null
  const inc = detalle?.incidente

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-2 rounded-2xl w-full max-w-[720px] max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-[#38332F]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#38332F]">
          <div className="font-bold text-[1rem] text-[#eae7e4]">
            {inc ? `${inc.equipoNombre} — ${inc.estacion} (Vía ${inc.via})` : 'Detalle del incidente'}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:bg-[#2D1212] hover:text-danger px-2 py-1 rounded-md transition-colors"
          >✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {loading || !detalle || !inc ? (
            <div className="text-center py-10 text-muted">Cargando…</div>
          ) : (
            <>
              {/* Causa destacada */}
              <div className="bg-surface-3 border border-border rounded-lg px-4 py-3 mb-4">
                <div className="text-[0.66rem] text-muted font-bold uppercase mb-1">Causa probable</div>
                <div className="text-[0.9rem] text-[#eae7e4] font-semibold">
                  {detalle.causa ?? 'No se pudo determinar automáticamente'}
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: 'Tipo', value: TIPO_LABELS[inc.tipo], cls: TIPO_COLORS[inc.tipo] },
                  { label: 'Duración', value: dur(inc.duracionMin), cls: inc.fin ? undefined : 'text-danger' },
                  { label: 'Inicio', value: fmt(inc.inicio) },
                  { label: 'Fin', value: fmt(inc.fin) },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-surface-3 rounded-lg px-3 py-2.5">
                    <div className="text-[0.66rem] text-muted font-bold uppercase">{label}</div>
                    <div className={`text-[0.95rem] font-extrabold mt-0.5 text-[#eae7e4] ${cls ?? ''}`}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Cambios de enlace en la ventana */}
              <div className="text-[0.78rem] font-bold text-muted uppercase mb-2">
                Enlace de la estación en ese momento
              </div>
              {detalle.enlaceWindow.length === 0 ? (
                <div className="text-center py-2 text-muted text-[0.8rem] mb-4">Sin cambios de enlace registrados en la ventana</div>
              ) : (
                <div className="flex flex-col gap-1.5 mb-4">
                  {detalle.enlaceWindow.map((e, i) => (
                    <div key={i} className="bg-surface-3 rounded-lg px-3 py-2 text-[0.8rem] flex items-center justify-between">
                      <span className={`font-bold ${ENLACE_COLORS[e.enlace] ?? 'text-muted'}`}>{e.enlace}</span>
                      <span className="text-muted">
                        {fmt(e.inicio)}{e.fin ? ` — ${fmt(e.fin)}` : ' (activo)'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Incidentes relacionados */}
              <div className="text-[0.78rem] font-bold text-muted uppercase mb-2">
                Otros equipos afectados a la vez
              </div>
              {detalle.relacionados.length === 0 ? (
                <div className="text-center py-2 text-muted text-[0.8rem] mb-4">Ningún otro equipo cayó en esta ventana — caída aislada</div>
              ) : (
                <div className="flex flex-col gap-1.5 mb-4">
                  {detalle.relacionados.map(r => (
                    <div key={r.id} className="bg-surface-3 rounded-lg px-3 py-2 text-[0.8rem]">
                      <span className="text-[#d4cec9] font-semibold">{r.equipoNombre}</span>
                      <span className="text-muted ml-2">{fmt(r.inicio)}{r.fin ? ` — ${fmt(r.fin)}` : ' (activo)'}</span>
                      {r.causa && <div className="text-muted text-[0.76rem] truncate">{r.causa}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Historial de ping en la ventana */}
              <div className="text-[0.78rem] font-bold text-muted uppercase mb-2">
                Historial de ping (±30min / +15min)
              </div>
              <table className="w-full text-[0.82rem] border-collapse">
                <thead>
                  <tr>
                    {['Hora', 'Estado', 'Latencia', 'Detalle'].map(h => (
                      <th key={h} className="text-left px-2 py-1.5 border-b-2 border-[#38332F] text-[0.7rem] text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalle.pingWindow.map((row, i) => (
                    <tr key={i} className="border-b border-[#2a2826]">
                      <td className="px-2 py-1.5 text-[#d4cec9]">{fmtHora(row.timestamp)}</td>
                      <td className={`px-2 py-1.5 font-bold ${row.estado === 'UP' ? 'text-brand' : 'text-danger'}`}>{row.estado}</td>
                      <td className="px-2 py-1.5 text-[#d4cec9]">{row.latenciaMs != null ? `${Math.round(row.latenciaMs)}ms` : '—'}</td>
                      <td className="px-2 py-1.5 text-muted text-[0.76rem] max-w-[220px] truncate" title={row.interpretacion ?? ''}>
                        {row.interpretacion ?? row.detalleEstado ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
