import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell,
} from 'recharts'
import { api, type DiscrepanciasResumen, type DiscrepanciasDetalle, type ViaConteo } from '../api/client'

// ── Períodos ──────────────────────────────────────────────────
const PERIODOS = [
  { key: '1h',   label: '1h'   },
  { key: '4h',   label: '4h'   },
  { key: '12h',  label: '12h'  },
  { key: '24h',  label: '24h'  },
  { key: 'ayer', label: 'Ayer' },
  { key: 'mes',  label: 'Mes'  },
] as const
type Periodo = typeof PERIODOS[number]['key']

const ESTACIONES = ['FORTALEZA', 'HUARMEY', '402', 'VIRU', 'SANTA'] as const

// Paleta Grafana — una por estación
const EST_COLOR: Record<string, string> = {
  FORTALEZA: '#73BF69',
  HUARMEY:   '#5794F2',
  '402':     '#FADE2A',
  VIRU:      '#FF9830',
  SANTA:     '#B877D9',
}

function abbrev(cat: string): string {
  if (!cat) return '?'
  if (/liviano/i.test(cat)) return 'Liviano'
  const m = cat.match(/0*(\d+)\s*[Ee]je/)
  if (m) return `P${parseInt(m[1])}`
  return cat.slice(0, 7)
}

function efColor(pct: number) {
  if (pct >= 99) return '#73BF69'
  if (pct >= 95) return '#FF9830'
  return '#F2495C'
}

// ── Tooltip compartido ────────────────────────────────────────
function GrafTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1f2229] border border-white/10 rounded px-3 py-2 text-[0.78rem] shadow-lg">
      <div className="text-[#8c8c8c] mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.color ?? p.fill }} />
          <span className="text-[#c0c4cc]">{p.dataKey}</span>
          <span className="font-bold ml-auto pl-4 text-[#e0e0e0]">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Panel genérico estilo Grafana ─────────────────────────────
function Panel({ title, info, children, className = '' }:
  { title: string; info?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#181b1f] border border-white/[0.07] rounded-sm ${className}`}>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1 border-b border-white/[0.05]">
        <span className="text-[0.8rem] font-semibold text-[#c0c4cc]">{title}</span>
        {info && <span className="text-[0.7rem] text-[#5c5c5c]">{info}</span>}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// ── Stat tipo Grafana ─────────────────────────────────────────
function StatPanel({ label, value, color, small }: {
  label: string; value: string; color?: string; small?: boolean
}) {
  return (
    <div className="bg-[#181b1f] border border-white/[0.07] rounded-sm px-4 py-3 flex flex-col justify-center">
      <div className="text-[0.68rem] text-[#5c5c5c] uppercase tracking-widest mb-1">{label}</div>
      <div className={`font-bold leading-none ${small ? 'text-[1.6rem]' : 'text-[2rem]'}`}
        style={{ color: color ?? '#e0e0e0' }}>
        {value}
      </div>
    </div>
  )
}

// ── Top vías ──────────────────────────────────────────────────
function TopViasPanel({ vias, loading }: { vias: ViaConteo[]; loading: boolean }) {
  const max = vias[0]?.total ?? 1
  return (
    <Panel title="Top 5 vías">
      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-[#5c5c5c] text-sm">Cargando…</div>
      ) : vias.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-[#5c5c5c] text-sm">Sin datos</div>
      ) : (
        <div className="flex flex-col gap-3 pt-1">
          {vias.map((v, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[0.78rem] text-[#c0c4cc] truncate">{v.via}</span>
                <span className="text-[0.78rem] font-bold text-[#e0e0e0] ml-2 flex-shrink-0">
                  {v.total.toLocaleString('es-PE')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/[0.05] rounded-none h-1">
                  <div className="h-full" style={{
                    width: `${Math.round(v.total / max * 100)}%`,
                    background: EST_COLOR[v.estacion] ?? '#73BF69',
                  }} />
                </div>
                <span className="text-[0.65rem] text-[#5c5c5c] w-16 flex-shrink-0">{v.estacion}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ── Página ────────────────────────────────────────────────────
export function Discrepancias() {
  const [periodo, setPeriodo]           = useState<Periodo>('12h')
  const [resumen, setResumen]           = useState<DiscrepanciasResumen | null>(null)
  const [detalle, setDetalle]           = useState<DiscrepanciasDetalle | null>(null)
  const [detalleError, setDetalleError] = useState(false)
  const [estacion, setEstacion]         = useState('')
  const [placaInput, setPlacaInput]     = useState('')
  const [placa, setPlaca]               = useState('')
  const [pagina, setPagina]             = useState(1)
  const [lastUpdate, setLastUpdate]     = useState<Date>(new Date())
  const [loadingR, setLoadingR]         = useState(false)
  const [loadingD, setLoadingD]         = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadResumen = useCallback(async () => {
    setLoadingR(true)
    try {
      setResumen(await api.discrepanciasResumen(periodo))
      setLastUpdate(new Date())
    } catch { /* silencioso */ }
    finally { setLoadingR(false) }
  }, [periodo])

  const loadDetalle = useCallback(async () => {
    setLoadingD(true)
    setDetalleError(false)
    try {
      setDetalle(await api.discrepanciasDetalle({
        periodo, estacion: estacion || undefined,
        placa: placa || undefined, pagina, porPagina: 50,
      }))
    } catch { setDetalleError(true) }
    finally { setLoadingD(false) }
  }, [periodo, estacion, placa, pagina])

  useEffect(() => { setPagina(1); loadResumen(); loadDetalle() }, [periodo, estacion, placa]) // eslint-disable-line
  useEffect(() => { loadDetalle() }, [pagina]) // eslint-disable-line
  useEffect(() => {
    timerRef.current = setInterval(loadResumen, 60_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loadResumen])

  const trendPivot = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>()
    for (const p of resumen?.trend ?? []) {
      if (!map.has(p.bucket)) map.set(p.bucket, { bucket: p.bucket })
      map.get(p.bucket)![p.estacion] = p.total
    }
    return [...map.values()]
  }, [resumen?.trend])

  const paresData = useMemo(() =>
    (resumen?.topPares ?? []).map(p => ({
      label: `${abbrev(p.desde)} → ${abbrev(p.hasta)}`,
      total: p.total,
    })).reverse(),
  [resumen?.topPares])

  const totalPaginas = detalle ? Math.ceil(detalle.total / detalle.porPagina) : 1
  const ef = resumen?.efectividad ?? null

  const bucketLabel = periodo === '1h' ? 'c/10 min' : periodo === '4h' ? 'c/20 min' :
    periodo === '12h' ? 'c/30 min' : periodo === 'mes' ? 'por día' : 'por hora'

  return (
    <div className="px-4 py-3 pb-10 bg-[#111317] min-h-screen">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[0.95rem] font-semibold text-[#c0c4cc]">Discrepancias DAC</div>
          <div className="text-[0.7rem] text-[#5c5c5c]">
            {lastUpdate.toLocaleTimeString('es-PE')} · refresco 60s
          </div>
        </div>

        {/* Tabs de período estilo Grafana */}
        <div className="flex border border-white/[0.1] rounded-sm overflow-hidden">
          {PERIODOS.map(({ key, label }) => (
            <button key={key} onClick={() => { setPeriodo(key); setPagina(1) }}
              className={`px-3 py-1.5 text-[0.75rem] font-medium border-r border-white/[0.07] last:border-0
                transition-colors ${
                periodo === key
                  ? 'bg-white/[0.12] text-[#e0e0e0]'
                  : 'text-[#5c5c5c] hover:text-[#a0a0a0] hover:bg-white/[0.04]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatPanel
          label="Efectividad"
          value={ef !== null ? `${ef.toFixed(2)}%` : '—'}
          color={ef !== null ? efColor(ef) : '#5c5c5c'}
        />
        <StatPanel
          label="Meta"
          value="99.50%"
          color="#5794F2"
          small
        />
        <StatPanel
          label="Discrepancias"
          value={resumen?.total?.toLocaleString('es-PE') ?? '—'}
          color="#F2495C"
        />
        <StatPanel
          label="Transacciones"
          value={resumen?.totalTransacciones?.toLocaleString('es-PE') ?? '—'}
          color="#e0e0e0"
        />
      </div>

      {/* ── Gráficas ───────────────────────────────────────── */}
      <div className="grid grid-cols-[2fr_3fr_1.5fr] gap-2 mb-3">

        {/* Top confusiones */}
        <Panel title="Top confusiones" info="categoría manual → DAC">
          {loadingR ? (
            <div className="h-[240px] flex items-center justify-center text-[#5c5c5c] text-sm">Cargando…</div>
          ) : paresData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-[#5c5c5c] text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, paresData.length * 26)}>
              <BarChart data={paresData} layout="vertical"
                margin={{ left: 4, right: 32, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" tick={{ fill: '#5c5c5c', fontSize: 10 }}
                  tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={100}
                  tick={{ fill: '#a0a4ad', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<GrafTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="total" maxBarSize={14} radius={1}>
                  {paresData.map((_, i) => {
                    const t = paresData.length
                    const pct = (t - i) / t
                    const r = Math.round(242 * (1 - pct) + 115 * pct)
                    const g = Math.round(73  * (1 - pct) + 191 * pct)
                    const b = Math.round(76  * (1 - pct) + 105 * pct)
                    return <Cell key={i} fill={`rgb(${r},${g},${b})`} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Tendencia */}
        <Panel title="Tendencia por estación" info={bucketLabel}>
          {loadingR ? (
            <div className="h-[240px] flex items-center justify-center text-[#5c5c5c] text-sm">Cargando…</div>
          ) : trendPivot.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-[#5c5c5c] text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendPivot} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  {ESTACIONES.map(est => (
                    <linearGradient key={est} id={`fill-${est}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={EST_COLOR[est]} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={EST_COLOR[est]} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fill: '#5c5c5c', fontSize: 9 }}
                  tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#5c5c5c', fontSize: 10 }}
                  tickLine={false} axisLine={false} />
                <Tooltip content={<GrafTooltip />} />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }}
                  formatter={v => <span style={{ color: EST_COLOR[v] ?? '#a0a4ad' }}>{v}</span>} />
                {ESTACIONES.map(est => (
                  <Area key={est}
                    type="monotone"
                    dataKey={est}
                    stroke={EST_COLOR[est]}
                    strokeWidth={1.5}
                    fill={`url(#fill-${est})`}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Top 5 vías */}
        <TopViasPanel vias={resumen?.topVias ?? []} loading={loadingR} />
      </div>

      {/* ── Filtros + tabla ────────────────────────────────── */}
      <div className="bg-[#181b1f] border border-white/[0.07] rounded-sm">

        {/* Barra de filtros */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] flex-wrap">
          <span className="text-[0.78rem] font-semibold text-[#c0c4cc]">Detalle</span>
          <span className="text-[0.72rem] text-[#5c5c5c]">
            {detalle ? `${detalle.total.toLocaleString('es-PE')} registros` : ''}
          </span>
          <div className="ml-auto flex gap-2 flex-wrap items-center">
            <select value={estacion} onChange={e => { setEstacion(e.target.value); setPagina(1) }}
              className="bg-[#111317] border border-white/[0.1] text-[0.78rem] text-[#c0c4cc]
                px-2 py-1 rounded-sm outline-none focus:border-white/30">
              <option value="">Todas las estaciones</option>
              {ESTACIONES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <form onSubmit={e => { e.preventDefault(); setPlaca(placaInput.trim().toUpperCase()); setPagina(1) }}
              className="flex gap-1">
              <input type="text" placeholder="Placa…" value={placaInput}
                onChange={e => setPlacaInput(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setPlacaInput(''), setPlaca(''))}
                className="bg-[#111317] border border-white/[0.1] text-[0.78rem] text-[#c0c4cc]
                  px-2 py-1 rounded-sm w-24 outline-none focus:border-white/30 placeholder:text-[#3c3c3c]" />
              <button type="submit"
                className="px-2 py-1 bg-[#111317] border border-white/[0.1] rounded-sm
                  text-[0.75rem] text-[#5c5c5c] hover:text-[#c0c4cc]">
                Buscar
              </button>
              {placa && (
                <button type="button" onClick={() => { setPlacaInput(''); setPlaca(''); setPagina(1) }}
                  className="px-1.5 text-[0.72rem] text-[#5c5c5c] hover:text-[#c0c4cc]">✕</button>
              )}
            </form>
          </div>
        </div>

        {detalleError && (
          <div className="mx-3 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-sm
            text-[0.78rem] text-red-400">
            Error al conectar con la BD consolidado.
          </div>
        )}

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-[0.76rem] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Fecha', 'Estación', 'Vía', 'Ticket', 'Tabulada', 'Detectada',
                  'Placa Tab.', 'Placa Det.', 'Cobrador'].map(h => (
                  <th key={h}
                    className="text-left py-2 px-2.5 text-[#5c5c5c] font-medium uppercase tracking-wide text-[0.68rem] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingD ? (
                <tr><td colSpan={9} className="py-8 text-center text-[#5c5c5c]">Cargando…</td></tr>
              ) : (detalle?.items ?? []).length === 0 && !detalleError ? (
                <tr><td colSpan={9} className="py-8 text-center text-[#5c5c5c]">Sin discrepancias en este período</td></tr>
              ) : (detalle?.items ?? []).map((item, i) => {
                const placaDiff = !!item.placaTabulada && !!item.placaDetectada
                  && item.placaTabulada !== item.placaDetectada
                return (
                  <tr key={i}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-1.5 px-2.5 text-[#5c5c5c] whitespace-nowrap font-mono">{item.fecha}</td>
                    <td className="py-1.5 px-2.5">
                      <span className="text-[0.72rem] font-medium" style={{ color: EST_COLOR[item.unidad] ?? '#a0a4ad' }}>
                        {item.unidad}
                      </span>
                    </td>
                    <td className="py-1.5 px-2.5 text-[#8c8c8c]">{item.via}</td>
                    <td className="py-1.5 px-2.5 text-[#5c5c5c] font-mono">{item.ticket ?? '—'}</td>
                    <td className="py-1.5 px-2.5">
                      <span className="font-mono text-[0.72rem] text-[#FF9830]">{abbrev(item.catTabulada)}</span>
                    </td>
                    <td className="py-1.5 px-2.5">
                      <span className="font-mono text-[0.72rem] text-[#5794F2]">{abbrev(item.catDetectada)}</span>
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-[#a0a4ad]">{item.placaTabulada || '—'}</td>
                    <td className={`py-1.5 px-2.5 font-mono ${placaDiff ? 'text-[#F2495C] font-bold' : 'text-[#5c5c5c]'}`}>
                      {item.placaDetectada || '—'}
                    </td>
                    <td className="py-1.5 px-2.5 text-[#5c5c5c]">{item.cobrador}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {detalle && totalPaginas > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.05]">
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
              className="px-2.5 py-1 text-[0.75rem] border border-white/[0.1] rounded-sm
                text-[#5c5c5c] hover:text-[#c0c4cc] hover:border-white/20 disabled:opacity-30">
              ← Anterior
            </button>
            <span className="text-[0.75rem] text-[#5c5c5c]">
              {pagina} / {totalPaginas}
            </span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
              className="px-2.5 py-1 text-[0.75rem] border border-white/[0.1] rounded-sm
                text-[#5c5c5c] hover:text-[#c0c4cc] hover:border-white/20 disabled:opacity-30">
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
