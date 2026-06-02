import { useEffect, useState } from 'react'
import { api, type SlaEquipo } from '../api/client'

function uptimeColor(pct: number) {
  if (pct >= 99) return 'text-brand'
  if (pct >= 95) return 'text-warn'
  return 'text-danger'
}

function dur(min: number) {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function ReporteSLA() {
  const [rows,    setRows]    = useState<SlaEquipo[]>([])
  const [loading, setLoading] = useState(false)
  const [desde,   setDesde]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10))

  const load = () => {
    setLoading(true)
    api.sla({ desde, hasta })
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const global = rows.length
    ? rows.reduce((s, r) => s + r.uptimePct, 0) / rows.length
    : 0

  return (
    <div className="px-5 py-4 pb-10">
      {/* Filtros */}
      <div className="flex items-end gap-4 mb-4 flex-wrap">
        <h1 className="text-xl font-extrabold text-[#eae7e4] mr-auto">Reporte SLA</h1>
        <div className="flex items-center gap-2">
          <label className="text-[0.78rem] text-muted uppercase font-bold">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-[#eae7e4] outline-none focus:border-brand" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[0.78rem] text-muted uppercase font-bold">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-[#eae7e4] outline-none focus:border-brand" />
        </div>
        <button onClick={load} className="bg-brand hover:brightness-110 text-white font-bold px-4 py-1.5 rounded-lg transition-all">
          Consultar
        </button>
      </div>

      {/* KPI global */}
      {rows.length > 0 && (
        <div className="bg-surface rounded-xl px-6 py-4 mb-4 flex items-center gap-4">
          <div className={`text-4xl font-extrabold ${uptimeColor(global)}`}>{global.toFixed(2)}%</div>
          <div>
            <div className="text-sm font-bold text-[#eae7e4]">Uptime promedio global</div>
            <div className="text-xs text-muted">{rows.length} equipos monitoreados</div>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted">Cargando…</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="border-b border-border">
              <tr>
                {['Equipo', 'Tipo', 'Vía', 'Uptime %', 'Caído', 'Total'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[0.7rem] text-muted font-bold uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.equipoId} className="border-b border-[#2a2826] hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 text-[#d4cec9] font-medium">{r.nombre}</td>
                  <td className="px-4 py-2.5 text-muted">{r.tipoNombre}</td>
                  <td className="px-4 py-2.5 text-muted">{r.via}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${r.uptimePct}%`, background: r.uptimePct >= 99 ? '#72BF44' : r.uptimePct >= 95 ? '#F99B1C' : '#F04545' }} />
                      </div>
                      <span className={`font-bold ${uptimeColor(r.uptimePct)}`}>{r.uptimePct.toFixed(2)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-danger font-medium">{dur(r.downMin)}</td>
                  <td className="px-4 py-2.5 text-muted">{dur(r.totalMin)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-muted">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
