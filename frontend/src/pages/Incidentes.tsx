import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { api, type IncidenteItem, type IncidenteResumen } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────
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

const DIAS_OPS = [
  { label: 'Hoy',   dias: 1  },
  { label: '7 días', dias: 7  },
  { label: '30 días', dias: 30 },
] as const

const EST_COLORS: Record<string, string> = {
  FORTALEZA: '#72BF44', HUARMEY: '#F99B1C',
  KM402: '#4A9EE0', VIRU: '#E060A0', SANTA: '#9B6BE0',
}
const RANK_COLORS = ['#F04545', '#F99B1C', '#FACC15', '#4A9EE0', '#72BF44',
                     '#9B6BE0', '#E060A0', '#a09890', '#7a7470', '#4A9EE0']

function estColor(name: string) {
  const key = Object.keys(EST_COLORS).find(k => name.toUpperCase().includes(k))
  return key ? EST_COLORS[key] : '#a09890'
}

// ── Tooltip tendencia ─────────────────────────────────────────
function TendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1e1c1a] border border-border rounded-lg px-3 py-2 text-[0.8rem]">
      <div className="text-muted mb-1">{label}</div>
      <div className="font-bold text-danger">{payload[0]?.value} incidentes</div>
    </div>
  )
}

// ── Top vías list ─────────────────────────────────────────────
function TopViasInc({ vias }: { vias: IncidenteResumen['topVias'] }) {
  const max = vias[0]?.total ?? 1
  return (
    <div className="flex flex-col gap-2">
      {vias.slice(0, 10).map((v, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="text-[0.76rem] font-extrabold w-4 text-right flex-shrink-0"
            style={{ color: RANK_COLORS[i] }}>#{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[0.8rem] text-[#eae7e4] font-semibold truncate">{v.via}</span>
              <span className="text-[0.78rem] font-bold ml-2 flex-shrink-0"
                style={{ color: RANK_COLORS[i] }}>{v.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{ width: `${Math.round(v.total / max * 100)}%`, background: estColor(v.estacion) }} />
              </div>
              <span className="text-[0.7rem] flex-shrink-0" style={{ color: estColor(v.estacion) }}>
                {v.estacion}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────
export function Incidentes() {
  const [dias,     setDias]     = useState(7)
  const [resumen,  setResumen]  = useState<IncidenteResumen | null>(null)
  const [items,    setItems]    = useState<IncidenteItem[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [estacion, setEstacion] = useState('')
  const [solo,     setSolo]     = useState(false)
  const [loadingR, setLoadingR] = useState(false)
  const [loadingL, setLoadingL] = useState(false)
  const pageSize = 50

  const loadResumen = useCallback(async () => {
    setLoadingR(true)
    try {
      setResumen(await api.incidentesResumen(dias))
    } catch (e) { console.error(e) }
    finally { setLoadingR(false) }
  }, [dias])

  const loadLista = useCallback(async () => {
    setLoadingL(true)
    const desde = dias === 1
      ? new Date(Date.now() - 86_400_000).toISOString()
      : new Date(Date.now() - dias * 86_400_000).toISOString()
    try {
      const r = await api.incidentes({
        page, pageSize,
        soloAbiertos: solo || undefined,
        estacion: estacion || undefined,
        desde,
      })
      setItems(r.items); setTotal(r.total)
    } catch (e) { console.error(e) }
    finally { setLoadingL(false) }
  }, [dias, page, solo, estacion])

  useEffect(() => { loadResumen() }, [loadResumen])
  useEffect(() => { setPage(1) }, [dias, estacion, solo])
  useEffect(() => { loadLista() }, [loadLista])

  const totalPages = Math.ceil(total / pageSize)

  // Datos para gráfica de estaciones
  const estData = (resumen?.porEstacion ?? []).map(e => ({
    name: e.estacion, total: e.total,
  }))

  return (
    <div className="px-5 py-4 pb-10">

      {/* Topbar */}
      <div className="flex items-center justify-between bg-surface rounded-xl px-6 py-3.5 mb-3.5 gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="text-[1.05rem] font-extrabold text-[#eae7e4]">Incidentes de Red</div>
          <div className="text-[0.78rem] text-muted">
            Equipos caídos detectados por el sistema de monitoreo
          </div>
        </div>

        {/* Tabs período */}
        <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5">
          {DIAS_OPS.map(({ label, dias: d }) => (
            <button key={d} onClick={() => setDias(d)}
              className={`px-3.5 py-1 rounded-md text-[0.8rem] font-semibold transition-all ${
                dias === d ? 'bg-danger text-white' : 'text-white/50 hover:text-white/80'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <span className="text-[1.8rem] font-extrabold text-danger leading-none">
              {loadingR ? '—' : resumen?.total ?? '—'}
            </span>
            <span className="text-[0.7rem] text-muted uppercase tracking-widest">en período</span>
          </div>
          <div className="w-px bg-border" />
          <div className="flex flex-col items-center">
            <span className="text-[1.8rem] font-extrabold text-warn leading-none">
              {loadingR ? '—' : resumen?.activos ?? '—'}
            </span>
            <span className="text-[0.7rem] text-muted uppercase tracking-widest">activos ahora</span>
          </div>
        </div>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-[1.4fr_2fr_1.4fr] gap-3.5 mb-3.5">

        {/* Por estación */}
        <div className="bg-surface rounded-xl p-4">
          <div className="text-[0.85rem] font-bold text-[#eae7e4] mb-3">Por estación</div>
          {loadingR ? (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm">Cargando…</div>
          ) : estData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={estData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fill: '#a09890', fontSize: 10 }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => v.length > 7 ? v.slice(0, 7) : v} />
                <YAxis tick={{ fill: '#a09890', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#1e1c1a', border: '1px solid #252220', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#d4cec9' }}
                  itemStyle={{ color: '#F04545' }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {estData.map((e, i) => (
                    <Cell key={i} fill={estColor(e.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tendencia */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[0.85rem] font-bold text-[#eae7e4]">Tendencia</div>
            <div className="text-[0.72rem] text-muted">
              {dias === 1 ? 'por hora (hoy)' : `por día (últimos ${dias}d)`}
            </div>
          </div>
          {loadingR ? (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm">Cargando…</div>
          ) : (resumen?.tendencia ?? []).length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={resumen?.tendencia} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <XAxis dataKey="fecha" tick={{ fill: '#a09890', fontSize: 10 }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#a09890', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<TendTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="total" fill="#F04545" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top vías */}
        <div className="bg-surface rounded-xl p-4">
          <div className="text-[0.85rem] font-bold text-[#eae7e4] mb-3">Top vías afectadas</div>
          {loadingR ? (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm">Cargando…</div>
          ) : (resumen?.topVias ?? []).length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm">Sin datos</div>
          ) : (
            <TopViasInc vias={resumen?.topVias ?? []} />
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[0.85rem] font-bold text-[#eae7e4]">Historial</div>
          <span className="text-[0.78rem] text-muted">{total.toLocaleString('es-PE')} registros</span>

          <div className="ml-auto flex gap-2 flex-wrap items-center">
            {/* Filtro estación */}
            <select value={estacion} onChange={e => setEstacion(e.target.value)}
              className="bg-surface-2 border border-border text-[0.82rem] text-[#eae7e4] px-2.5 py-1.5
                rounded-lg outline-none focus:border-danger/60">
              <option value="">Todas las estaciones</option>
              {(resumen?.porEstacion ?? []).map(e => (
                <option key={e.estacion} value={e.estacion}>{e.estacion} ({e.total})</option>
              ))}
            </select>

            {/* Solo activos */}
            <label className="flex items-center gap-2 text-[0.82rem] text-muted cursor-pointer select-none">
              <input type="checkbox" checked={solo}
                onChange={e => setSolo(e.target.checked)}
                className="accent-danger" />
              Solo activos
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[0.8rem] border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Equipo', 'Estación', 'Vía', 'Inicio', 'Fin', 'Duración'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-[0.75rem] text-muted font-semibold uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingL ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted">Cargando…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted">No hay incidentes en el período</td></tr>
              ) : items.map(inc => (
                <tr key={inc.id} className="border-b border-border/40 hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 text-[#d4cec9] font-medium">{inc.equipoNombre}</td>
                  <td className="px-3 py-2">
                    <span style={{ color: estColor(inc.estacion) }} className="font-semibold">
                      {inc.estacion}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">{inc.via}</td>
                  <td className="px-3 py-2 text-[#d4cec9] whitespace-nowrap">{fmt(inc.inicio)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {inc.fin
                      ? <span className="text-[#d4cec9]">{fmt(inc.fin)}</span>
                      : <span className="text-danger font-bold animate-blink-down">● Activo</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={inc.fin ? 'text-muted' : 'text-warn font-bold'}>{dur(inc.duracionMin)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 text-[0.8rem] bg-surface-2 border border-border rounded-lg
                text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
              ← Anterior
            </button>
            <span className="text-[0.8rem] text-muted">
              Página <b className="text-[#eae7e4]">{page}</b> de <b className="text-[#eae7e4]">{totalPages}</b>
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-[0.8rem] bg-surface-2 border border-border rounded-lg
                text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
