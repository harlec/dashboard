import { useEffect, useState } from 'react'
import { api, type IncidenteItem } from '../api/client'

function fmt(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-PE', { hour12: false })
}

function dur(min?: number | null) {
  if (min == null) return 'Activo'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function Incidentes() {
  const [items,  setItems]  = useState<IncidenteItem[]>([])
  const [total,  setTotal]  = useState(0)
  const [page,   setPage]   = useState(1)
  const [solo,   setSolo]   = useState(false)
  const [loading, setLoading] = useState(false)
  const pageSize = 50

  useEffect(() => {
    setLoading(true)
    api.incidentes({ page, pageSize, soloAbiertos: solo || undefined })
      .then(r => { setItems(r.items); setTotal(r.total) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, solo])

  return (
    <div className="px-5 py-4 pb-10">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold text-[#eae7e4]">Historial de Incidentes</h1>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={solo}
            onChange={e => { setSolo(e.target.checked); setPage(1) }}
            className="accent-brand"
          />
          Solo activos
        </label>
      </div>

      <div className="bg-surface rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted">Cargando…</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="border-b border-border">
              <tr>
                {['Equipo', 'Estación', 'Vía', 'Inicio', 'Fin', 'Duración'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[0.7rem] text-muted font-bold uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(inc => (
                <tr key={inc.id} className="border-b border-[#2a2826] hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 text-[#d4cec9] font-medium">{inc.equipoNombre}</td>
                  <td className="px-4 py-2.5 text-muted">{inc.estacion}</td>
                  <td className="px-4 py-2.5 text-muted">{inc.via}</td>
                  <td className="px-4 py-2.5 text-[#d4cec9]">{fmt(inc.inicio)}</td>
                  <td className="px-4 py-2.5 text-[#d4cec9]">{inc.fin ? fmt(inc.fin) : <span className="text-danger font-bold">Activo</span>}</td>
                  <td className="px-4 py-2.5 font-bold">
                    <span className={inc.fin ? 'text-muted' : 'text-warn'}>{dur(inc.duracionMin)}</span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-muted">No hay incidentes</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {total > pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted">
          <span>{total} incidentes · página {page}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 bg-surface-3 rounded-md disabled:opacity-40 hover:bg-surface-2 transition-colors"
            >← Anterior</button>
            <button
              disabled={page * pageSize >= total}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 bg-surface-3 rounded-md disabled:opacity-40 hover:bg-surface-2 transition-colors"
            >Siguiente →</button>
          </div>
        </div>
      )}
    </div>
  )
}
