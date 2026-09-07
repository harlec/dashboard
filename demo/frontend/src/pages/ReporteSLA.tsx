import { useEffect, useState } from 'react'
import { api, type SlaEquipo, type SlaEstacion } from '../api/client'

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
  const [rows,        setRows]        = useState<SlaEquipo[]>([])
  const [porEstacion, setPorEstacion] = useState<SlaEstacion[]>([])
  const [estacionId,  setEstacionId]  = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [desde,   setDesde]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10))

  // El input <input type="date"> solo da el día (medianoche) — si "Hasta" fuera
  // literalmente esa medianoche, elegir el mismo día en Desde y Hasta daría un
  // período de 0 minutos (y el cálculo cae a 100% por defecto, ver ReporteService).
  // Si es hoy, se usa la hora actual; si es un día pasado, el final de ese día.
  const hastaEfectiva = () => {
    const hastaDate = new Date(hasta + 'T00:00:00')
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    return hastaDate >= hoy ? new Date().toISOString() : `${hasta}T23:59:59`
  }

  const load = () => {
    setLoading(true)
    const hastaIso = hastaEfectiva()
    Promise.all([
      api.sla({ desde, hasta: hastaIso, estacionId: estacionId || undefined }),
      api.slaPorEstacion({ desde, hasta: hastaIso }),
    ])
      .then(([r, pe]) => { setRows(r); setPorEstacion(pe) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    api.sla({ desde, hasta: hastaEfectiva(), estacionId: estacionId || undefined }).then(setRows).catch(console.error)
  }, [estacionId])

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
        <div className="flex items-center gap-2">
          <label className="text-[0.78rem] text-muted uppercase font-bold">Peaje</label>
          <select value={estacionId} onChange={e => setEstacionId(e.target.value ? Number(e.target.value) : '')}
            className="bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-[#eae7e4] outline-none focus:border-brand">
            <option value="">Todos</option>
            {porEstacion.map(e => (
              <option key={e.estacionId} value={e.estacionId}>{e.estacion}</option>
            ))}
          </select>
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
            <div className="text-sm font-bold text-[#eae7e4]">Uptime promedio {estacionId ? '(filtrado)' : 'global'}</div>
            <div className="text-xs text-muted">{rows.length} equipos monitoreados</div>
          </div>
        </div>
      )}

      {/* Cards por peaje */}
      {porEstacion.length > 0 && (
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(porEstacion.length, 5)}, minmax(0,1fr))` }}>
          {porEstacion.map(e => (
            <button key={e.estacionId}
              onClick={() => setEstacionId(estacionId === e.estacionId ? '' : e.estacionId)}
              className={`bg-surface rounded-xl px-4 py-3 text-left border transition-all ${
                estacionId === e.estacionId ? 'border-brand' : 'border-border hover:border-brand/50'
              }`}>
              <div className={`text-2xl font-extrabold ${uptimeColor(e.uptimePct)}`}>{e.uptimePct.toFixed(2)}%</div>
              <div className="text-xs font-bold text-[#eae7e4] mt-0.5">{e.estacion}</div>
              <div className="text-[0.7rem] text-muted">{e.total} equipos</div>
            </button>
          ))}
        </div>
      )}

      <div className="bg-surface rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-muted">Cargando…</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="border-b border-border">
              <tr>
                {['Peaje', 'Equipo', 'Tipo', 'Vía', 'Uptime %', 'Caído', 'Total', 'Motivo'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[0.7rem] text-muted font-bold uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.equipoId} className="border-b border-[#2a2826] hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 text-muted">{r.estacion}</td>
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
                  <td className="px-4 py-2.5 text-muted text-[0.78rem] max-w-[220px] truncate" title={r.motivos ?? ''}>{r.motivos ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-muted">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
