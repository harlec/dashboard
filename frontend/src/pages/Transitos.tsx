import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode, type CSSProperties } from 'react'
import { api, type TransitosVia, type TransitoViaCatalogo } from '../api/client'
import { ESTACION_COLOR } from '../lib/theme'
import { ScaledStage } from '../components/ScaledStage'
import { WallTopbar } from '../components/WallTopbar'

// Detalle de tránsitos por vía: se elige estación + vía + período y se ve el
// volumen, el mix de medios de pago, las categorías, la serie en el tiempo y los
// últimos tránsitos registrados. Mismo sistema visual que Discrepancias.

const PERIODOS = [
  { key: '15m', label: '15 min' }, { key: '30m', label: '30 min' }, { key: '1h', label: '1 h' },
  { key: '4h', label: '4 h' },     { key: '12h', label: '12 h' },   { key: '24h', label: '24 h' },
  { key: 'ayer', label: 'Ayer' },  { key: 'mes', label: 'Mes actual' }, { key: 'rango', label: 'Rango' },
] as const
type Periodo = typeof PERIODOS[number]['key']

const ESTACIONES = ['FORTALEZA', 'HUARMEY', '402', 'VIRU', 'SANTA'] as const
const gris = 'var(--tx-muted)'

// Color fijo por medio de pago (código tra_tipop).
const MEDIO_COLOR: Record<string, string> = {
  E: 'light-dark(oklch(0.499 0.143 85), oklch(0.82 0.13 85))',   // efectivo
  T: 'light-dark(oklch(0.521 0.121 205), oklch(0.78 0.11 205))',  // tag
  S: 'light-dark(oklch(0.532 0.110 300), oklch(0.76 0.10 300))',  // tarjeta
  O: 'light-dark(oklch(0.521 0.143 160), oklch(0.78 0.13 160))',  // por placa
  X: 'var(--tx-muted)', // exento
}
const colorMedio = (c: string) => MEDIO_COLOR[c] ?? 'light-dark(oklch(0.554 0.132 30), oklch(0.72 0.12 30))'
const ORDEN_MEDIOS = ['E', 'T', 'S', 'O', 'X']

function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      boxSizing: 'border-box', borderRadius: 22, padding: '16px 22px', display: 'flex',
      flexDirection: 'column', minWidth: 0,
      background: 'linear-gradient(180deg, rgb(var(--s1) / 0.92) 0%, rgb(var(--s0) / 0.92) 100%)',
      boxShadow: 'inset 0 1px 0 rgb(var(--ov) / 0.07), 0 14px 40px rgb(var(--shadow) / 0.32)',
      ...style,
    }}>{children}</div>
  )
}

const selectStyle: CSSProperties = {
  colorScheme: 'var(--color-scheme)', padding: '7px 12px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 600,
  color: 'var(--tx)', background: 'rgb(var(--s2))', cursor: 'pointer',
}

function Kpi({ titulo, valor, sub, fondo, colorTitulo, colorValor }: {
  titulo: string; valor: string; sub: string; fondo: string; colorTitulo: string; colorValor: string
}) {
  return (
    <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: fondo, boxShadow: 'inset 0 1px 0 rgb(var(--ov) / 0.09), 0 12px 34px rgb(var(--shadow) / 0.30)' }}>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: colorTitulo }}>{titulo}</div>
      <div style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: colorValor }}>{valor}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'light-dark(oklch(0.570 0.020 265), oklch(0.58 0.02 265))' }}>{sub}</div>
    </div>
  )
}

export function Transitos() {
  const hoy = new Date().toISOString().slice(0, 10)
  const [vias, setVias]         = useState<TransitoViaCatalogo[]>([])
  const [estacion, setEstacion] = useState<string>('FORTALEZA')
  const [via, setVia]           = useState<number | null>(null)
  const [periodo, setPeriodo]   = useState<Periodo>('30m')
  const [desde, setDesde]       = useState(hoy)
  const [hasta, setHasta]       = useState(hoy)
  // Por defecto solo cobro real (TR); apagado incluye violaciones, cierres, abortadas, etc.
  const [soloCobro, setSoloCobro] = useState(true)
  const [data, setData]        = useState<TransitosVia | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState(false)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const seq = useRef(0)

  const rangoInvalido = periodo === 'rango' && (!desde || !hasta || desde > hasta)
  const viasEstacion = useMemo(() => vias.filter(v => v.estacion === estacion), [vias, estacion])

  useEffect(() => { api.transitosVias().then(setVias).catch(() => setError(true)) }, [])

  // Al cambiar de estación (o llegar el catálogo) se selecciona la primera vía si
  // la actual no pertenece a la estación.
  useEffect(() => {
    if (viasEstacion.length && !viasEstacion.some(v => v.numero === via)) setVia(viasEstacion[0].numero)
  }, [viasEstacion, via])

  const load = useCallback(async () => {
    if (via == null || rangoInvalido) return
    const id = seq.current
    try {
      const r = await api.transitosVia({ estacion, via, periodo, limite: 50, desde, hasta, soloCobro })
      if (id === seq.current) { setData(r); setError(false); setLastUpdate(new Date()) }
    } catch { if (id === seq.current) setError(true) }
  }, [estacion, via, periodo, desde, hasta, rangoInvalido, soloCobro])

  useEffect(() => {
    seq.current++
    if (via == null || rangoInvalido) return
    setCargando(true)
    load().finally(() => setCargando(false))
  }, [load, via, rangoInvalido])

  // Ventanas cortas refrescan más seguido.
  useEffect(() => {
    const ms = periodo === '15m' || periodo === '30m' ? 15_000 : 60_000
    const t = setInterval(load, ms)
    return () => clearInterval(t)
  }, [load, periodo])

  const total = data?.total ?? 0
  const medios = useMemo(() => {
    const lista = [...(data?.porMedio ?? [])]
    lista.sort((a, b) => {
      const ia = ORDEN_MEDIOS.indexOf(a.codigo), ib = ORDEN_MEDIOS.indexOf(b.codigo)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    return lista
  }, [data?.porMedio])

  // Serie apilada por medio
  const serie = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const p of data?.serie ?? []) {
      if (!map.has(p.bucket)) map.set(p.bucket, {})
      map.get(p.bucket)![p.medio] = p.total
    }
    const buckets = [...map.entries()]
    const tope = Math.max(1, Math.max(...buckets.map(([, s]) => Object.values(s).reduce((a, b) => a + b, 0)), 1) * 1.1)
    const step = Math.max(1, Math.ceil(buckets.length / 14))
    return buckets.map(([bucket, segs], i) => ({
      bucket, total: Object.values(segs).reduce((a, b) => a + b, 0),
      mostrar: i % step === 0,
      segs: medios.map(m => ({ codigo: m.codigo, n: segs[m.codigo] ?? 0, alto: `${((segs[m.codigo] ?? 0) / tope) * 100}%` })),
    }))
  }, [data?.serie, medios])

  const categorias = (data?.porCategoria ?? []).slice(0, 8)
  const maxCat = categorias[0]?.total ?? 1
  const etiquetaPeriodo = periodo === 'rango' ? `${desde} → ${hasta}` : PERIODOS.find(p => p.key === periodo)?.label

  // Descarga con la misma vía y período que se ven en pantalla (la cookie de sesión viaja sola).
  const puedeExportar = via != null && !rangoInvalido && !cargando
  const exportar = (formato: 'xlsx' | 'pdf') => {
    if (via == null) return
    const q = new URLSearchParams({ estacion, via: String(via), periodo, formato, soloCobro: String(soloCobro) })
    if (periodo === 'rango') { q.set('desde', desde); q.set('hasta', hasta) }
    window.open(`/api/transitos/via/exportar?${q}`, '_blank')
  }

  return (
    <ScaledStage>
      <WallTopbar activo="Tránsitos" />

      {/* ── Título + selectores ───────────────────────────── */}
      <div style={{ height: 40, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em' }}>Tránsitos por vía</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: error ? 'light-dark(oklch(0.537 0.165 25), oklch(0.75 0.15 25))' : 'var(--tx-dim)' }}>
            {error ? 'sin conexión con la base de tránsitos · reintentando' : `${cargando ? 'cargando…' : `actualizado ${lastUpdate.toLocaleTimeString('es-PE', { hour12: false })}`} · refresco automático`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select value={estacion} onChange={e => setEstacion(e.target.value)} style={{ ...selectStyle, color: ESTACION_COLOR[estacion] }}>
            {ESTACIONES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={via ?? ''} onChange={e => setVia(Number(e.target.value))} style={selectStyle}>
            {viasEstacion.map(v => <option key={v.numero} value={v.numero}>{v.nombre}</option>)}
          </select>
          {(() => {
            const otros = (data?.porTipo ?? []).filter(t => t.tipo !== 'TR')
            const nOtros = otros.reduce((a, t) => a + t.total, 0)
            const detalle = otros.map(t => `${t.tipo || 'sin tipo'}: ${t.total}`).join(' · ')
            return (
              <div onClick={() => setSoloCobro(v => !v)}
                title={nOtros > 0 ? `Tránsitos que no son cobro (TR) en el período — ${detalle}` : 'Sin tránsitos fuera de cobro en el período'}
                style={{ padding: '7px 13px', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  color: soloCobro ? 'light-dark(oklch(0.510 0.088 200), oklch(0.80 0.08 200))' : 'light-dark(oklch(0.510 0.132 62), oklch(0.80 0.12 62))',
                  background: soloCobro ? 'light-dark(oklch(0.912 0.035 210 / 0.45), oklch(0.35 0.05 210 / 0.45))' : 'light-dark(oklch(0.901 0.056 62 / 0.45), oklch(0.38 0.08 62 / 0.45))',
                  boxShadow: 'inset 0 0 0 1px rgb(var(--ov) / 0.07)' }}>
                {soloCobro ? `Solo cobro (TR)${nOtros > 0 ? ` · ocultos ${nOtros}` : ''}` : `Todos los tipos${detalle ? ` · ${detalle}` : ''}`}
              </div>
            )
          })()}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 4, borderRadius: 13, background: 'rgb(var(--s1) / 0.80)', boxShadow: 'inset 0 0 0 1px rgb(var(--ov) / 0.05)' }}>
            {PERIODOS.map(({ key, label }) => (
              <div key={key} onClick={() => setPeriodo(key)} style={{
                padding: '7px 13px', borderRadius: 10, fontSize: 15, fontWeight: periodo === key ? 600 : 500, cursor: 'pointer',
                color: periodo === key ? 'light-dark(oklch(0.959 0.028 62), oklch(0.22 0.04 62))' : 'var(--tx-muted)',
                background: periodo === key ? 'linear-gradient(180deg, light-dark(oklch(0.488 0.143 68), oklch(0.84 0.13 68)), light-dark(oklch(0.532 0.143 62), oklch(0.76 0.13 62)))' : 'transparent',
              }}>{label}</div>
            ))}
            {periodo === 'rango' && (['desde', 'hasta'] as const).map(k => (
              <input key={k} type="date" title={k === 'desde' ? 'Fecha de inicio' : 'Fecha de fin'}
                value={k === 'desde' ? desde : hasta} max={hoy}
                onChange={e => (k === 'desde' ? setDesde : setHasta)(e.target.value)}
                style={{ colorScheme: 'var(--color-scheme)', padding: '5px 8px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 500, color: 'var(--tx)', background: 'rgb(var(--s2))' }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI: total · ritmo · último · medios de pago ───── */}
      <div style={{ height: 112, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '0.9fr 0.8fr 0.8fr 2.4fr', gap: 14, opacity: cargando ? 0.35 : 1, transition: 'opacity .2s' }}>
        <Kpi titulo="Tránsitos" valor={cargando ? '···' : total.toLocaleString('en-US')} sub={`${data?.via ?? ''} · ${etiquetaPeriodo}`}
          fondo="linear-gradient(160deg, light-dark(oklch(0.930 0.032 200 / 0.55), oklch(0.30 0.045 200 / 0.55)) 0%, rgb(var(--s1) / 0.55) 100%)"
          colorTitulo="light-dark(oklch(0.532 0.066 200), oklch(0.76 0.06 200))" colorValor="light-dark(oklch(0.444 0.066 200), oklch(0.92 0.06 200))" />
        <Kpi titulo="Ritmo" valor={cargando ? '···' : data?.porHora != null ? data.porHora.toLocaleString('en-US') : '—'} sub="tránsitos por hora"
          fondo="linear-gradient(160deg, rgb(var(--s2) / 0.60) 0%, rgb(var(--s1) / 0.55) 100%)"
          colorTitulo="light-dark(oklch(0.430 0.030 265), oklch(0.72 0.03 265))" colorValor="var(--tx)" />
        <Kpi titulo="Último tránsito" valor={cargando ? '···' : data?.ultimoTransito?.slice(11) ?? '—'} sub={data?.ultimoTransito?.slice(0, 10) ?? 'sin tránsitos en el período'}
          fondo="linear-gradient(160deg, light-dark(oklch(0.901 0.063 62 / 0.5), oklch(0.38 0.09 62 / 0.50)) 0%, rgb(var(--s1) / 0.55) 100%)"
          colorTitulo="light-dark(oklch(0.488 0.099 62), oklch(0.84 0.09 62))" colorValor="light-dark(oklch(0.455 0.121 62), oklch(0.90 0.11 62))" />

        <Panel style={{ padding: '12px 20px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'light-dark(oklch(0.530 0.020 265), oklch(0.62 0.02 265))' }}>Medios de pago</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx-dim)' }}>prepago (subforma 1): {(data?.prepago ?? 0).toLocaleString('en-US')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(medios.length, 1)}, 1fr)`, gap: 12 }}>
            {medios.length === 0 && <div style={{ color: gris, fontSize: 13 }}>Sin datos</div>}
            {medios.map(m => {
              const pct = total > 0 ? m.total / total * 100 : 0
              return (
                <div key={m.codigo} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: colorMedio(m.codigo) }}>{m.nombre}</span>
                    <span style={{ fontSize: 19, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--tx)' }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'rgb(var(--ov) / 0.07)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: colorMedio(m.codigo) }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--tx-dim)' }}>{m.total.toLocaleString('en-US')} tráns.</div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {/* ── Serie en el tiempo · categorías ─────────────────── */}
      <div style={{ height: 300, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 14, opacity: cargando ? 0.35 : 1, transition: 'opacity .2s' }}>
        <Panel>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>Tránsitos en el tiempo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {medios.map(m => (
                <div key={m.codigo} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 500, color: 'var(--tx-muted)' }}>
                  <div style={{ width: 11, height: 11, borderRadius: 4, background: colorMedio(m.codigo) }} />{m.nombre}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 14 }}>
            <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: 3, borderBottom: '1px solid rgb(var(--ov) / 0.10)' }}>
              {serie.length === 0
                ? <div style={{ color: gris, fontSize: 13, margin: 'auto' }}>Sin tránsitos en el período</div>
                : serie.map(col => (
                  <div key={col.bucket} title={`${col.bucket} · ${col.total} tránsitos`} style={{ flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 1, borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                    {col.segs.map(s => <div key={s.codigo} style={{ height: s.alto, background: colorMedio(s.codigo) }} />)}
                  </div>
                ))}
            </div>
            <div style={{ height: 20, flex: '0 0 auto', display: 'flex', gap: 3, paddingTop: 5 }}>
              {serie.map(col => (
                <div key={col.bucket} style={{ flex: '1 1 0', minWidth: 0, overflow: 'visible', textAlign: 'center', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: col.mostrar ? gris : 'transparent' }}>{col.bucket}</div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>Por categoría</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx-dim)' }}>tarifa del tránsito</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 10 }}>
            {categorias.length === 0
              ? <div style={{ color: gris, fontSize: 13, textAlign: 'center' }}>Sin datos</div>
              : categorias.map(c => (
                <div key={c.categoria} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 150, flex: '0 0 auto', textAlign: 'right', fontSize: 14, fontWeight: 500, color: 'var(--tx-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.categoria}</div>
                  <div style={{ flex: '1 1 auto', minWidth: 0, height: 13, borderRadius: 5, background: 'rgb(var(--ov) / 0.05)' }}>
                    <div style={{ width: `${c.total / maxCat * 100}%`, height: '100%', borderRadius: 5, background: 'linear-gradient(90deg, light-dark(oklch(0.664 0.099 210), oklch(0.52 0.09 210)), light-dark(oklch(0.576 0.121 205), oklch(0.68 0.11 205)))' }} />
                  </div>
                  <div style={{ width: 48, flex: '0 0 auto', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--tx-muted)' }}>{c.total.toLocaleString('en-US')}</div>
                </div>
              ))}
          </div>
        </Panel>
      </div>

      {/* ── Últimos tránsitos ───────────────────────────────── */}
      <Panel style={{ flex: '1 1 auto', minHeight: 0, opacity: cargando ? 0.35 : 1, transition: 'opacity .2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 13 }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>Últimos tránsitos</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx-dim)' }}>
              {data ? `${data.estacion} · ${data.via} · más recientes primero (en pantalla máx. 50; la exportación trae todo el período)` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, opacity: puedeExportar ? 1 : 0.4, pointerEvents: puedeExportar ? 'auto' : 'none' }}>
            {(['xlsx', 'pdf'] as const).map(f => (
              <div key={f} onClick={() => exportar(f)} title={`Exportar ${f === 'xlsx' ? 'Excel' : 'PDF'} de ${data?.via ?? 'la vía'} · ${etiquetaPeriodo}`}
                style={{ padding: '6px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'light-dark(oklch(0.510 0.088 200), oklch(0.80 0.08 200))', background: 'light-dark(oklch(0.912 0.035 210 / 0.45), oklch(0.35 0.05 210 / 0.45))', boxShadow: 'inset 0 0 0 1px rgb(var(--ov) / 0.07)' }}>
                {f === 'xlsx' ? 'Exportar Excel' : 'Exportar PDF'}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '10px 0 6px', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tx-dim)', borderBottom: '1px solid rgb(var(--ov) / 0.07)' }}>
          {['Hora', 'Ticket', 'Sentido', 'Placa', 'Categoría', 'Medio de pago', 'Prepago', 'Tipo', 'Cobrador'].map(h => <div key={h}>{h}</div>)}
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
          {(data?.ultimos ?? []).length === 0
            ? <div style={{ color: gris, fontSize: 13, textAlign: 'center', paddingTop: 20 }}>Sin tránsitos en el período</div>
            : data!.ultimos.map(r => (
              <div key={`${r.numev}-${r.fecha}`} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '5px 0', fontSize: 15, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid rgb(var(--ov) / 0.03)' }}>
                <div style={{ color: gris, fontWeight: 500 }}>{r.fecha.slice(11)}</div>
                <div style={{ color: gris }}>{r.ticket || '—'}</div>
                <div style={{ color: gris }}>{r.sentido || '—'}</div>
                <div style={{ fontWeight: 600 }}>{r.placa || r.placaOcr || '—'}</div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.categoria}</div>
                <div style={{ fontWeight: 600, color: colorMedio(r.medio) }}>{nombreMedio(r.medio)}</div>
                <div style={{ color: r.prepago ? 'light-dark(oklch(0.499 0.143 160), oklch(0.82 0.13 160))' : 'var(--tx-dim)' }}>{r.prepago ? 'Sí' : '—'}</div>
                <div style={{ color: gris }}>{r.tipoTransito || '—'}</div>
                <div style={{ color: gris, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.cobrador || '—'}</div>
              </div>
            ))}
        </div>
      </Panel>
    </ScaledStage>
  )
}

const COLS = '90px 1fr 0.7fr 1fr 1.3fr 1.1fr 0.7fr 0.6fr 1fr'

function nombreMedio(c: string) {
  return ({ E: 'Efectivo', T: 'Tag', S: 'Tarjeta', O: 'Por placa', X: 'Exento' } as Record<string, string>)[c] ?? (c ? `Otros (${c})` : 'Sin dato')
}
