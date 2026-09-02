import { useEffect, useState } from 'react'
import { api, type SlaEstacion, type EstacionInc } from '../api/client'

type TipoReporte = 'incidentes' | 'sla'

// Mismo criterio que ReporteSLA: un <input type="date"> solo da la medianoche —
// "Hasta" debe ser el final de ese día (o el instante actual si es hoy) para
// no generar una ventana de 0 minutos.
function hastaEfectiva(hasta: string) {
  const hastaDate = new Date(hasta + 'T00:00:00')
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return hastaDate >= hoy ? new Date().toISOString() : `${hasta}T23:59:59`
}

function fechaHace(dias: number) {
  const d = new Date(); d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

export function Reportes() {
  const [tipo,    setTipo]    = useState<TipoReporte>('incidentes')
  const [desde,   setDesde]   = useState(() => fechaHace(30))
  const [hasta,   setHasta]   = useState(() => fechaHace(0))

  const [estacionesInc, setEstacionesInc] = useState<EstacionInc[]>([])
  const [estacionesSla, setEstacionesSla] = useState<SlaEstacion[]>([])

  const [estacionInc, setEstacionInc] = useState('')
  const [soloAbiertos, setSoloAbiertos] = useState(false)
  const [estacionIdSla, setEstacionIdSla] = useState<number | ''>('')

  const [descargando, setDescargando] = useState(false)

  useEffect(() => {
    api.incidentesResumen(90).then(r => setEstacionesInc(r.porEstacion)).catch(() => {})
    api.slaPorEstacion({ desde: fechaHace(90), hasta: fechaHace(0) }).then(setEstacionesSla).catch(() => {})
  }, [])

  const construirParams = () => {
    const hastaIso = hastaEfectiva(hasta)
    const params = new URLSearchParams({ desde: new Date(desde + 'T00:00:00').toISOString(), hasta: hastaIso })
    if (tipo === 'incidentes') {
      if (estacionInc) params.set('estacion', estacionInc)
      if (soloAbiertos) params.set('soloAbiertos', 'true')
    } else {
      if (estacionIdSla) params.set('estacionId', String(estacionIdSla))
    }
    return params
  }

  const descargar = (formato: 'csv' | 'pdf') => {
    setDescargando(true)
    const params = construirParams()
    const path = tipo === 'incidentes' ? `/api/incidentes/${formato}` : `/api/reporte/sla/${formato}`
    window.open(`${path}?${params}`, '_blank')
    setTimeout(() => setDescargando(false), 800)
  }

  return (
    <div className="px-5 py-4 pb-10">
      <div className="bg-surface rounded-xl px-6 py-4 mb-4">
        <div className="text-[1.05rem] font-extrabold text-[#eae7e4] mb-1">Reportes</div>
        <div className="text-[0.8rem] text-muted">Genera y descarga informes en CSV para análisis externo</div>
      </div>

      <div className="bg-surface rounded-xl p-5">
        {/* Tipo de informe */}
        <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5 mb-5 w-fit">
          {([['incidentes', 'Incidentes'], ['sla', 'Reporte SLA']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTipo(t)}
              className={`px-4 py-1.5 rounded-md text-[0.82rem] font-semibold transition-all ${
                tipo === t ? 'bg-brand text-white' : 'text-white/50 hover:text-white/80'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-end gap-4 flex-wrap">
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

          {tipo === 'incidentes' ? (
            <>
              <div className="flex items-center gap-2">
                <label className="text-[0.78rem] text-muted uppercase font-bold">Estación</label>
                <select value={estacionInc} onChange={e => setEstacionInc(e.target.value)}
                  className="bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-[#eae7e4] outline-none focus:border-brand">
                  <option value="">Todas</option>
                  {estacionesInc.map(e => (
                    <option key={e.estacion} value={e.estacion}>{e.estacion}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[0.82rem] text-muted cursor-pointer select-none pb-1.5">
                <input type="checkbox" checked={soloAbiertos}
                  onChange={e => setSoloAbiertos(e.target.checked)} className="accent-brand" />
                Solo activos
              </label>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-[0.78rem] text-muted uppercase font-bold">Peaje</label>
              <select value={estacionIdSla} onChange={e => setEstacionIdSla(e.target.value ? Number(e.target.value) : '')}
                className="bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-[#eae7e4] outline-none focus:border-brand">
                <option value="">Todos</option>
                {estacionesSla.map(e => (
                  <option key={e.estacionId} value={e.estacionId}>{e.estacion}</option>
                ))}
              </select>
            </div>
          )}

          <div className="ml-auto flex gap-2">
            <button onClick={() => descargar('pdf')} disabled={descargando}
              className="bg-danger hover:brightness-110 disabled:opacity-50 text-white font-bold px-5 py-1.5 rounded-lg transition-all flex items-center gap-2">
              ⬇ PDF
            </button>
            <button onClick={() => descargar('csv')} disabled={descargando}
              className="bg-brand hover:brightness-110 disabled:opacity-50 text-white font-bold px-5 py-1.5 rounded-lg transition-all flex items-center gap-2">
              ⬇ CSV
            </button>
          </div>
        </div>

        <div className="text-[0.75rem] text-muted mt-4">
          {tipo === 'incidentes'
            ? 'Incluye equipo, estación, vía, inicio, fin, duración, tipo y motivo de cada incidente en el rango seleccionado.'
            : 'Incluye uptime %, minutos caídos y motivos por equipo monitoreado en el rango seleccionado.'}
        </div>
      </div>
    </div>
  )
}
