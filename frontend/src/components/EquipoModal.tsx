import { useEffect, useState } from 'react'
import { api, type EquipoDetail, type EquipoLive, type IncidenteItem, type IncidenteTipo } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { TIPO_LABELS, TIPO_COLORS } from '../lib/incidentes'

interface Props { equipo: EquipoLive | null; onClose: () => void }

const TIPOS_CAMARA = ['Camara OCR', 'Cámara Validación']
const TIPOS_PC      = ['PC Via', 'PC OCR']

function descargarVnc(equipo: EquipoLive) {
  const contenido = `[Connection]\nHost=${equipo.ip}\nPort=5900\n`
  const blob = new Blob([contenido], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${equipo.nombre}.vnc`
  a.click()
  URL.revokeObjectURL(url)
}

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
  const { user } = useAuth()
  const [detail, setDetail]         = useState<EquipoDetail | null>(null)
  const [incidentes, setIncidentes] = useState<IncidenteItem[] | null>(null)
  const [editId,     setEditId]     = useState<number | null>(null)
  const [editTipo,   setEditTipo]   = useState<IncidenteTipo>('Real')
  const [editMotivo, setEditMotivo] = useState('')
  const [saving,     setSaving]     = useState(false)

  const cargarIncidentes = (equipoId: number) =>
    api.incidentes({ equipoId, pageSize: 20 }).then(r => setIncidentes(r.items)).catch(console.error)

  useEffect(() => {
    if (!equipo) { setDetail(null); setIncidentes(null); return }
    api.equipoDetail(equipo.id).then(setDetail).catch(console.error)
    cargarIncidentes(equipo.id)
  }, [equipo?.id])

  const empezarEdicion = (inc: IncidenteItem) => {
    setEditId(inc.id); setEditTipo(inc.tipo); setEditMotivo(inc.motivo ?? '')
  }

  const guardarEdicion = async () => {
    if (editId == null || !equipo) return
    setSaving(true)
    try {
      await api.etiquetarIncidentes([editId], editTipo, editMotivo || undefined)
      setEditId(null)
      await cargarIncidentes(equipo.id)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

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
          {user?.rol === 'admin' && (TIPOS_CAMARA.includes(equipo.tipoNombre) || TIPOS_PC.includes(equipo.tipoNombre)) && (
            <div className="flex gap-2 mb-4">
              {TIPOS_CAMARA.includes(equipo.tipoNombre) && (
                <a href={`http://${equipo.ip}`} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all">
                  📷 Abrir cámara
                </a>
              )}
              {TIPOS_PC.includes(equipo.tipoNombre) && (
                <button onClick={() => descargarVnc(equipo)}
                  className="px-3 py-2 bg-surface-3 text-[#eae7e4] text-sm font-bold rounded-lg hover:brightness-110 transition-all border border-border">
                  🖥 Abrir VNC
                </button>
              )}
            </div>
          )}

          {equipo.tipoDescripcion && (
            <div className="text-[0.78rem] text-muted bg-surface-3 rounded-lg px-3 py-2 mb-4">
              ℹ {equipo.tipoDescripcion}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: 'Estado',    value: equipo.ultimoEstado ?? 'Sin datos', cls: estadoColor },
              { label: equipo.ultimoEstado === 'DOWN' ? 'Latencia (previa a caer)' : 'Latencia',
                value: equipo.latenciaMs != null ? `${Math.round(equipo.latenciaMs)}ms` : '—' },
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

          {/* Incidentes */}
          <div className="text-[0.78rem] font-bold text-muted uppercase mb-2">Incidentes</div>
          {!incidentes ? (
            <div className="text-center py-3 text-muted text-[0.82rem]">Cargando…</div>
          ) : incidentes.length === 0 ? (
            <div className="text-center py-3 text-muted text-[0.82rem] mb-4">Sin incidentes registrados</div>
          ) : (
            <div className="flex flex-col gap-1.5 mb-4">
              {incidentes.map(inc => (
                <div key={inc.id} className="bg-surface-3 rounded-lg px-3 py-2 text-[0.8rem]">
                  {editId === inc.id ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex gap-1.5 items-center">
                        <select value={editTipo} onChange={e => setEditTipo(e.target.value as IncidenteTipo)}
                          className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[0.78rem] text-[#eae7e4] outline-none focus:border-brand">
                          {(Object.keys(TIPO_LABELS) as IncidenteTipo[]).map(t => (
                            <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                          ))}
                        </select>
                        <input value={editMotivo} onChange={e => setEditMotivo(e.target.value)}
                          placeholder="Motivo (opcional)"
                          className="flex-1 bg-surface-2 border border-border rounded-md px-2 py-1 text-[0.78rem] text-[#eae7e4] outline-none focus:border-brand" />
                      </div>
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => setEditId(null)}
                          className="px-2.5 py-1 rounded-md bg-surface-2 text-muted text-[0.76rem] hover:text-[#eae7e4]">Cancelar</button>
                        <button onClick={guardarEdicion} disabled={saving}
                          className="px-2.5 py-1 rounded-md bg-brand text-white text-[0.76rem] font-bold disabled:opacity-50">
                          {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`font-bold ${TIPO_COLORS[inc.tipo]}`}>{TIPO_LABELS[inc.tipo]}</span>
                        <span className="text-muted ml-2">{formatTs(inc.inicio)}{inc.fin ? ` — ${formatTs(inc.fin)}` : ' (activo)'}</span>
                        {inc.motivo && <div className="text-muted text-[0.76rem] truncate">{inc.motivo}</div>}
                      </div>
                      {user?.rol === 'admin' && (
                        <button onClick={() => empezarEdicion(inc)}
                          className="flex-shrink-0 px-2.5 py-1 rounded-md bg-surface-2 text-muted text-[0.76rem] hover:text-[#eae7e4] transition-colors">
                          Editar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Historial */}
          <div className="text-[0.78rem] font-bold text-muted uppercase mb-2">Historial reciente</div>
          {!detail ? (
            <div className="text-center py-5 text-muted">Cargando…</div>
          ) : (
            <table className="w-full text-[0.82rem] border-collapse">
              <thead>
                <tr>
                  {['Timestamp', 'Estado', 'Latencia', 'Detalle'].map(h => (
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
                    <td className="px-2 py-1.5 text-muted text-[0.76rem] max-w-[160px] truncate" title={row.interpretacion ?? ''}>
                      {row.detalleEstado ?? '—'}
                    </td>
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
