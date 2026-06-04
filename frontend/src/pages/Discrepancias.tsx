import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts'
import {
  api,
  type DiscrepanciasResumen,
  type DiscrepanciasDetalle,
  type ViaConteo,
} from '../api/client'

// ── Constantes ───────────────────────────────────────────────
const HORAS = [1, 4, 8, 12] as const
type Horas = typeof HORAS[number]

const ESTACIONES = ['FORTALEZA', 'HUARMEY', '402', 'VIRU', 'SANTA'] as const

const COLORS: Record<string, string> = {
  FORTALEZA: '#72BF44',
  HUARMEY:   '#F99B1C',
  '402':     '#4A9EE0',
  VIRU:      '#E060A0',
  SANTA:     '#9B6BE0',
}

const RANK_COLORS = ['#F04545', '#F99B1C', '#FACC15', '#4A9EE0', '#a09890']

function abbrev(cat: string): string {
  if (!cat) return '?'
  if (/liviano/i.test(cat)) return 'Liviano'
  const m = cat.match(/0*(\d+)\s*[Ee]je/)
  if (m) return `P${parseInt(m[1])}`
  return cat.slice(0, 7)
}

// ── Subcomponentes ────────────────────────────────────────────

function HorasTab({ horas, onChange }: { horas: Horas; onChange: (h: Horas) => void }) {
  return (
    <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5">
      {HORAS.map(h => (
        <button key={h} onClick={() => onChange(h)}
          className={`px-3 py-1 rounded-md text-[0.8rem] font-semibold transition-all ${
            horas === h ? 'bg-brand text-[#0f0d0c]' : 'text-white/50 hover:text-white/80'
          }`}>
          {h}h
        </button>
      ))}
    </div>
  )
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0)
  return (
    <div className="bg-[#1e1c1a] border border-border rounded-lg px-3 py-2 text-[0.8rem]">
      <div className="text-muted mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[#eae7e4]">{p.dataKey}</span>
          <span className="font-bold ml-auto pl-3" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
      <div className="border-t border-border mt-1 pt-1 text-white/60">
        Total: <b className="text-[#eae7e4]">{total}</b>
      </div>
    </div>
  )
}

function ParTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-[#1e1c1a] border border-border rounded-lg px-3 py-2 text-[0.8rem] max-w-[260px]">
      <div className="text-warn font-semibold mb-0.5">{d?.desde}</div>
      <div className="text-[#4A9EE0] font-semibold mb-1">→ {d?.hasta}</div>
      <div className="text-[#eae7e4] font-bold text-base">{d?.total} discrepancias</div>
    </div>
  )
}

function TopViasPanel({ vias, loading }: { vias: ViaConteo[]; loading: boolean }) {
  const max = vias[0]?.total ?? 1
  return (
    <div className="bg-surface rounded-xl p-4">
      <div className="text-[0.85rem] font-bold text-[#eae7e4] mb-3">Top 5 vías</div>
      {loading ? (
        <div className="flex items-center justify-center h-24 text-muted text-sm">Cargando…</div>
      ) : vias.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-muted text-sm">Sin datos</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {vias.map((v, i) => {
            const pct = Math.round((v.total / max) * 100)
            return (
              <div key={i} className="flex items-center gap-2.5">
                <span className="text-[0.78rem] font-extrabold w-4 text-right flex-shrink-0"
                  style={{ color: RANK_COLORS[i] }}>
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[0.8rem] text-[#eae7e4] font-semibold truncate">{v.via}</span>
                    <span className="text-[0.78rem] font-bold ml-2 flex-shrink-0"
                      style={{ color: RANK_COLORS[i] }}>
                      {v.total.toLocaleString('es-PE')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: COLORS[v.estacion] ?? RANK_COLORS[i] }} />
                    </div>
                    <span className="text-[0.7rem] text-dim flex-shrink-0"
                      style={{ color: COLORS[v.estacion] ?? '#a09890' }}>
                      {v.estacion}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export function Discrepancias() {
  const [horas, setHoras]           = useState<Horas>(8)
  const [resumen, setResumen]       = useState<DiscrepanciasResumen | null>(null)
  const [detalle, setDetalle]       = useState<DiscrepanciasDetalle | null>(null)
  const [detalleError, setDetalleError] = useState(false)
  const [estacion, setEstacion]     = useState('')
  const [placaInput, setPlacaInput] = useState('')
  const [placa, setPlaca]           = useState('')
  const [pagina, setPagina]         = useState(1)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [signal, setSignal]         = useState<'idle' | 'ok' | 'error'>('idle')
  const [loadingResumen, setLoadingResumen] = useState(false)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadResumen = useCallback(async () => {
    setLoadingResumen(true)
    try {
      const r = await api.discrepanciasResumen(horas)
      setResumen(r)
      setLastUpdate(new Date())
      setSignal('ok')
    } catch {
      setSignal('error')
    } finally {
      setLoadingResumen(false)
    }
  }, [horas])

  const loadDetalle = useCallback(async () => {
    setLoadingDetalle(true)
    setDetalleError(false)
    try {
      const d = await api.discrepanciasDetalle({
        horas,
        estacion: estacion || undefined,
        placa: placa || undefined,
        pagina,
        porPagina: 50,
      })
      setDetalle(d)
    } catch {
      setDetalleError(true)
    } finally {
      setLoadingDetalle(false)
    }
  }, [horas, estacion, placa, pagina])

  useEffect(() => {
    setPagina(1)
    loadResumen()
    loadDetalle()
  }, [horas, estacion, placa]) // eslint-disable-line

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
      total: p.total, desde: p.desde, hasta: p.hasta,
    })).reverse(),
  [resumen?.topPares])

  const totalPaginas = detalle ? Math.ceil(detalle.total / detalle.porPagina) : 1

  return (
    <div className="px-5 py-4 pb-10">

      {/* Topbar */}
      <div className="flex items-center justify-between bg-surface rounded-xl px-6 py-3.5 mb-3.5 gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="text-[1.05rem] font-extrabold text-[#eae7e4]">Discrepancias DAC</div>
          <div className="text-[0.78rem] text-muted">
            Actualizado: <b className="text-[#d4cec9]">{lastUpdate.toLocaleTimeString('es-PE')}</b>
            {' · '}refresco automático cada 60s
          </div>
        </div>

        <div className="flex items-center gap-4">
          <HorasTab horas={horas} onChange={h => { setHoras(h); setPagina(1) }} />
          <div className="flex flex-col items-center">
            <span className="text-[2rem] font-extrabold text-warn leading-none">
              {resumen?.total?.toLocaleString('es-PE') ?? '—'}
            </span>
            <span className="text-[0.7rem] text-muted uppercase tracking-widest">discrepancias</span>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 text-[0.75rem] text-white/70
          bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10`}>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            signal === 'ok' ? 'bg-brand animate-ping-pulse' :
            signal === 'error' ? 'bg-danger' : 'bg-[#a09890]'
          }`} />
          <span>{signal === 'ok' ? 'En vivo' : signal === 'error' ? 'Sin conexión' : 'En espera'}</span>
        </div>
      </div>

      {/* Pills por estación */}
      {resumen && (
        <div className="flex gap-2 mb-3.5 flex-wrap">
          {resumen.porEstacion.map(e => (
            <button key={e.estacion}
              onClick={() => { setEstacion(est => est === e.estacion ? '' : e.estacion); setPagina(1) }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[0.82rem] font-semibold
                border transition-all ${
                estacion === e.estacion
                  ? 'border-transparent text-[#0f0d0c]'
                  : 'border-border text-[#eae7e4] bg-surface hover:bg-surface-2'
              }`}
              style={estacion === e.estacion ? { background: COLORS[e.estacion] ?? '#72BF44' } : {}}>
              <div className="w-2 h-2 rounded-full" style={{ background: COLORS[e.estacion] ?? '#888' }} />
              {e.estacion}
              <span className={`font-extrabold ${estacion === e.estacion ? 'text-[#0f0d0c]' : 'text-warn'}`}>
                {e.total.toLocaleString('es-PE')}
              </span>
            </button>
          ))}
          {estacion && (
            <button onClick={() => { setEstacion(''); setPagina(1) }}
              className="px-2.5 py-1.5 rounded-lg text-[0.78rem] text-white/50 border border-border hover:text-white/80">
              ✕ limpiar
            </button>
          )}
        </div>
      )}

      {/* Gráficas: top confusiones | tendencia | top 5 vías */}
      <div className="grid grid-cols-[2fr_3fr_1.6fr] gap-3.5 mb-3.5">

        {/* Top confusiones */}
        <div className="bg-surface rounded-xl p-4">
          <div className="text-[0.85rem] font-bold text-[#eae7e4] mb-3">Top confusiones</div>
          {loadingResumen ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">Cargando…</div>
          ) : paresData.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, paresData.length * 26)}>
              <BarChart data={paresData} layout="vertical"
                margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fill: '#a09890', fontSize: 11 }}
                  tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={108}
                  tick={{ fill: '#d4cec9', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ParTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {paresData.map((_, i) => (
                    <Cell key={i}
                      fill={i >= paresData.length - 3 ? '#F04545' :
                            i >= paresData.length - 6 ? '#F99B1C' : '#4A9EE0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tendencia por estación */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[0.85rem] font-bold text-[#eae7e4]">Tendencia por estación</div>
            <div className="text-[0.72rem] text-muted">
              cada {horas === 1 ? '10' : horas === 4 ? '20' : horas === 8 ? '30' : '60'} min
            </div>
          </div>
          {loadingResumen ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">Cargando…</div>
          ) : trendPivot.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendPivot} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <XAxis dataKey="bucket" tick={{ fill: '#a09890', fontSize: 10 }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#a09890', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={v => <span style={{ color: '#d4cec9' }}>{v}</span>} />
                {ESTACIONES.map(est => (
                  <Bar key={est} dataKey={est} stackId="a" fill={COLORS[est]} maxBarSize={40} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 5 vías */}
        <TopViasPanel vias={resumen?.topVias ?? []} loading={loadingResumen} />
      </div>

      {/* Tabla de detalle */}
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[0.85rem] font-bold text-[#eae7e4]">Detalle de discrepancias</div>
          <div className="text-[0.78rem] text-muted ml-1">
            {detalle ? `${detalle.total.toLocaleString('es-PE')} registros` : ''}
          </div>

          <div className="ml-auto flex gap-2 flex-wrap">
            <select value={estacion} onChange={e => { setEstacion(e.target.value); setPagina(1) }}
              className="bg-surface-2 border border-border text-[0.82rem] text-[#eae7e4] px-2.5 py-1.5
                rounded-lg outline-none focus:border-warn/60">
              <option value="">Todas las estaciones</option>
              {ESTACIONES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>

            <form onSubmit={e => { e.preventDefault(); setPlaca(placaInput.trim().toUpperCase()); setPagina(1) }}
              className="flex gap-1">
              <input type="text" placeholder="Buscar placa…" value={placaInput}
                onChange={e => setPlacaInput(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setPlacaInput(''), setPlaca(''))}
                className="bg-surface-2 border border-border text-[0.82rem] text-[#eae7e4] px-2.5 py-1.5
                  rounded-lg w-28 outline-none focus:border-warn/60 placeholder:text-dim" />
              <button type="submit"
                className="px-2.5 py-1.5 bg-surface-2 border border-border rounded-lg text-[0.82rem]
                  text-white/60 hover:text-white hover:bg-surface-3 transition-colors">
                🔍
              </button>
              {placa && (
                <button type="button"
                  onClick={() => { setPlacaInput(''); setPlaca(''); setPagina(1) }}
                  className="px-2 py-1.5 text-[0.78rem] text-white/40 hover:text-white/70">✕</button>
              )}
            </form>
          </div>
        </div>

        {/* Error de detalle */}
        {detalleError && (
          <div className="mb-3 px-3 py-2 bg-danger/10 border border-danger/30 rounded-lg
            text-[0.82rem] text-danger">
            Error al cargar el detalle. Verifica la conexión con la BD consolidado.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[0.8rem] border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Fecha', 'Estación', 'VIA', 'Ticket', 'Tabulada', 'Detectada',
                  'Placa Tab.', 'Placa Det.', 'Cobrador'].map(h => (
                  <th key={h} className="text-left py-2 px-2.5 text-muted font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingDetalle ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted">Cargando…</td></tr>
              ) : (detalle?.items ?? []).length === 0 && !detalleError ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted">Sin discrepancias en el período</td></tr>
              ) : (
                (detalle?.items ?? []).map((item, i) => {
                  const placaDiff = !!item.placaTabulada && !!item.placaDetectada
                    && item.placaTabulada !== item.placaDetectada
                  return (
                    <tr key={i}
                      className="border-b border-border/40 hover:bg-white/[0.02] transition-colors">
                      <td className="py-1.5 px-2.5 text-dim whitespace-nowrap">{item.fecha}</td>
                      <td className="py-1.5 px-2.5">
                        <span className="font-semibold" style={{ color: COLORS[item.unidad] ?? '#a09890' }}>
                          {item.unidad}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-muted">{item.via}</td>
                      <td className="py-1.5 px-2.5 text-dim">{item.ticket ?? '—'}</td>
                      <td className="py-1.5 px-2.5">
                        <span className="bg-warn/10 text-warn px-1.5 py-0.5 rounded text-[0.76rem] font-mono">
                          {abbrev(item.catTabulada)}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5">
                        <span className="bg-[#4A9EE0]/10 text-[#4A9EE0] px-1.5 py-0.5 rounded text-[0.76rem] font-mono">
                          {abbrev(item.catDetectada)}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-[0.78rem] text-[#eae7e4]">
                        {item.placaTabulada || '—'}
                      </td>
                      <td className={`py-1.5 px-2.5 font-mono text-[0.78rem] ${
                        placaDiff ? 'text-danger font-bold' : 'text-muted'
                      }`}>
                        {item.placaDetectada || '—'}
                      </td>
                      <td className="py-1.5 px-2.5 text-dim">{item.cobrador}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {detalle && totalPaginas > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
              className="px-3 py-1.5 text-[0.8rem] bg-surface-2 border border-border rounded-lg
                text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
              ← Anterior
            </button>
            <span className="text-[0.8rem] text-muted">
              Página <b className="text-[#eae7e4]">{pagina}</b> de <b className="text-[#eae7e4]">{totalPaginas}</b>
            </span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
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
