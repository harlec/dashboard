import { useEffect, useState, useCallback, useMemo, type ReactNode, type CSSProperties } from 'react'
import { api, type DiscrepanciasResumen, type DiscrepanciasDetalle, type DiscrepanciasAnalisis } from '../api/client'
import { ESTACION_COLOR } from '../lib/theme'
import { ScaledStage } from '../components/ScaledStage'
import { WallTopbar } from '../components/WallTopbar'

// Fuente de verdad visual: design_handoff_monitoreo_funcional/pantallas/Discrepancias DAC v2.dc.html
// Calcado 1:1 — retícula, bandas, colores y umbrales exactos del mockup, con
// datos reales de la API en vez de los de muestra. Ver sistema-visual.md.

const PERIODOS = [
  { key: '1h',   label: 'Última hora' }, { key: '4h',   label: '4 h' },
  { key: '12h',  label: '12 h' },        { key: '24h',  label: '24 h' },
  { key: 'ayer', label: 'Ayer' },        { key: 'mes',  label: 'Mes actual' },
] as const
type Periodo = typeof PERIODOS[number]['key']
const ESTACIONES = ['FORTALEZA', 'HUARMEY', '402', 'VIRU', 'SANTA'] as const
const COLORS = ESTACION_COLOR

const gris = 'oklch(0.62 0.015 265)'

function abbrev(cat: string): string {
  if (!cat) return '?'
  if (/liviano/i.test(cat)) return 'Liviano'
  const m = cat.match(/0*(\d+)\s*[Ee]je/)
  if (m) return `P${parseInt(m[1])}`
  return cat.slice(0, 7)
}

// ── Panel shell — superficie estándar del sistema visual ─────────
function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      boxSizing: 'border-box', borderRadius: 22, padding: '16px 22px', display: 'flex',
      flexDirection: 'column', minWidth: 0,
      background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / 0.92) 0%, oklch(0.185 0.016 262 / 0.92) 100%)',
      boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.32)',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function Discrepancias() {
  const [periodo, setPeriodo]       = useState<Periodo>('12h')
  const [resumen, setResumen]       = useState<DiscrepanciasResumen | null>(null)
  const [detalle, setDetalle]       = useState<DiscrepanciasDetalle | null>(null)
  const [analisis, setAnalisis]     = useState<DiscrepanciasAnalisis | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [panelInferior, setPanelInferior] = useState<'mantenimiento' | 'detalle'>('mantenimiento')

  const loadResumen = useCallback(async () => {
    try { setResumen(await api.discrepanciasResumen(periodo)); setLastUpdate(new Date()) }
    catch { /* mantiene el último dato bueno */ }
  }, [periodo])

  const loadDetalle = useCallback(async () => {
    try { setDetalle(await api.discrepanciasDetalle({ periodo, pagina: 1, porPagina: 12 })) }
    catch { /* mantiene el último dato bueno */ }
  }, [periodo])

  useEffect(() => { loadResumen(); loadDetalle() }, [loadResumen, loadDetalle])
  useEffect(() => {
    const t = setInterval(() => { loadResumen(); loadDetalle() }, 60_000)
    return () => clearInterval(t)
  }, [loadResumen, loadDetalle])

  // Análisis (prioridad de mantenimiento + tasa por hora) — ventanas fijas
  // (2 semanas / 7 días), independientes del selector de período de arriba.
  useEffect(() => {
    api.discrepanciasAnalisis().then(setAnalisis).catch(() => {})
  }, [])

  // ── KPI ──────────────────────────────────────────────────────
  const ef = resumen?.efectividad ?? 0
  const brecha = Math.max(0, 99.5 - ef).toFixed(1)
  const barraEf = Math.max(0, Math.min(100, (ef - 85) / 15 * 100))

  // ── Top confusiones ─────────────────────────────────────────
  const confusiones = useMemo(() => {
    const pares = (resumen?.topPares ?? []).slice(0, 12)
    const max = pares[0]?.total ?? 1
    return pares.map(p => ({
      par: `${abbrev(p.desde)} → ${abbrev(p.hasta)}`, n: p.total,
      ancho: `${Math.round(p.total / max * 100)}%`,
      color: p.total >= 150
        ? 'linear-gradient(90deg, oklch(0.58 0.15 20), oklch(0.70 0.17 22))'
        : p.total >= 80
          ? 'linear-gradient(90deg, oklch(0.66 0.12 62), oklch(0.80 0.14 62))'
          : 'linear-gradient(90deg, oklch(0.52 0.09 210), oklch(0.68 0.11 205))',
    }))
  }, [resumen?.topPares])

  // ── Tendencia por estación (apilada, 25 cortes) ──────────────
  const tendencia = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const p of resumen?.trend ?? []) {
      if (!map.has(p.bucket)) map.set(p.bucket, {})
      map.get(p.bucket)![p.estacion] = p.total
    }
    const buckets = [...map.entries()]
    const stackSums = buckets.map(([, segs]) => ESTACIONES.reduce((s, e) => s + (segs[e] ?? 0), 0))
    const tope = Math.max(1, Math.ceil(Math.max(...stackSums, 1) * 1.1))
    return buckets.map(([bucket, segs], i) => ({
      hora: bucket, fg: i % 2 ? 'transparent' : gris,
      segs: ESTACIONES.map(e => ({
        alto: `${Math.round((segs[e] ?? 0) / tope * 1000) / 10}%`, color: COLORS[e],
      })),
    }))
  }, [resumen?.trend])

  // ── Vías críticas ────────────────────────────────────────────
  const vias = useMemo(() => (resumen?.topVias ?? []).slice(0, 7).map((v, i) => ({
    rank: i + 1, via: v.via, est: v.estacion, ratio: `${v.total}/${v.totalTransitos}`,
    pct: `${v.pct.toFixed(1)}%`,
    pctFg: v.pct >= 15 ? 'oklch(0.80 0.15 22)' : v.pct >= 10 ? 'oklch(0.86 0.13 62)' : 'oklch(0.88 0.02 265)',
    ancho: `${Math.min(100, Math.round(v.pct / 20 * 100))}%`,
    color: COLORS[v.estacion] ?? 'oklch(0.70 0.02 265)',
  })), [resumen?.topVias])

  // ── Panel inferior conmutable ─────────────────────────────────
  const panel = useMemo(() => {
    if (panelInferior === 'detalle') {
      const items = detalle?.items ?? []
      return {
        titulo: 'Detalle de discrepancias',
        sub: `${(detalle?.total ?? 0).toLocaleString('es-PE')} registros · últimos primero`,
        cols: '68px 1.2fr 62px 1fr 0.9fr 0.9fr 1fr',
        encabezados: ['Hora', 'Estación', 'Vía', 'Ticket', 'Tabulada', 'Detectada', 'Placa'],
        filas: items.map(r => [
          { txt: r.fecha.slice(-5), fg: gris, peso: 500 },
          { txt: r.unidad, fg: COLORS[r.unidad] ?? gris, peso: 600 },
          { txt: r.via, fg: null, peso: 600 },
          { txt: r.ticket ? String(r.ticket) : '—', fg: gris, peso: 500 },
          { txt: r.catTabulada, fg: 'oklch(0.86 0.12 62)', peso: 600 },
          { txt: r.catDetectada, fg: 'oklch(0.82 0.11 205)', peso: 600 },
          { txt: r.placaDetectada || r.placaTabulada || '—', fg: gris, peso: 500 },
        ]),
      }
    }
    const items = (analisis?.prioridadMantenimiento ?? []).slice(0, 9)
    return {
      titulo: 'Prioridad de mantenimiento',
      sub: 'últimas 2 semanas por vía · ordenado por variación',
      cols: '62px 1.3fr 1fr 1fr 0.9fr 0.9fr',
      encabezados: ['Vía', 'Estación', 'Sem. anterior', 'Sem. actual', 'Δ variación', 'Discr. 7 d'],
      filas: items.map(v => [
        { txt: v.via, fg: null, peso: 600 },
        { txt: v.estacion, fg: COLORS[v.estacion] ?? gris, peso: 600 },
        { txt: `${v.tasaSem1.toFixed(1)}%`, fg: gris, peso: 500 },
        { txt: `${v.tasaSem2.toFixed(1)}%`, fg: null, peso: 600 },
        { txt: `${v.delta > 0 ? '+' : ''}${v.delta.toFixed(1)} pp`, fg: v.delta >= 1 ? 'oklch(0.80 0.14 25)' : 'oklch(0.86 0.12 62)', peso: 600 },
        { txt: String(v.totalSem2), fg: gris, peso: 500 },
      ]),
    }
  }, [panelInferior, detalle, analisis])

  // ── Tasa de error por hora ────────────────────────────────────
  const horas = useMemo(() => {
    const datos = analisis?.porHora ?? []
    if (datos.length === 0) return { barras: [] as { txt: string; fg: string; alto: string; color: string }[], nota: '', maxLabel: 0 }
    const max = Math.max(...datos.map(h => h.tasaError), 1)
    const min = Math.min(...datos.map(h => h.tasaError))
    const peak = datos.reduce((a, b) => a.tasaError > b.tasaError ? a : b)
    const valle = datos.reduce((a, b) => a.tasaError < b.tasaError ? a : b)
    const barras = datos.map((h, i) => ({
      txt: String(h.hora).padStart(2, '0'), fg: i % 2 ? 'transparent' : 'oklch(0.48 0.015 265)',
      alto: `${Math.round(Number(h.tasaError) / max * 100)}%`,
      color: h.tasaError === max
        ? 'linear-gradient(180deg, oklch(0.70 0.17 22), oklch(0.58 0.16 20))'
        : h.tasaError === min
          ? 'linear-gradient(180deg, oklch(0.76 0.11 205), oklch(0.62 0.10 205))'
          : 'linear-gradient(180deg, oklch(0.82 0.13 62), oklch(0.70 0.12 62))',
    }))
    const nota = `Pico ${String(peak.hora).padStart(2, '0')}:00 con ${peak.tasaError}% — revisar calibración por volumen · valle ${String(valle.hora).padStart(2, '0')}:00 con ${valle.tasaError}%`
    return { barras, maxLabel: max, nota }
  }, [analisis?.porHora])

  return (
    <ScaledStage>
      <WallTopbar activo="Discrepancias" />

      {/* ── Título ─────────────────────────────────────────── */}
      <div style={{ height: 40, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em' }}>Discrepancias DAC</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.56 0.015 265)' }}>
            tabulado del cobrador vs. clasificación automática · actualizado {lastUpdate.toLocaleTimeString('es-PE', { hour12: false })} · refresco 60 s
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 4, borderRadius: 13, background: 'oklch(0.24 0.018 262 / 0.80)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.05)' }}>
          {PERIODOS.map(({ key, label }) => (
            <div key={key} onClick={() => setPeriodo(key)} style={{
              padding: '7px 15px', borderRadius: 10, fontSize: 15, fontWeight: periodo === key ? 600 : 500, cursor: 'pointer',
              color: periodo === key ? 'oklch(0.22 0.04 62)' : 'oklch(0.64 0.015 265)',
              background: periodo === key ? 'linear-gradient(180deg, oklch(0.84 0.13 68), oklch(0.76 0.13 62))' : 'transparent',
            }}>{label}</div>
          ))}
        </div>
      </div>

      {/* ── KPI ────────────────────────────────────────────── */}
      <div style={{ height: 112, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1.05fr 0.78fr 0.78fr 2.1fr', gap: 14 }}>

        <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.38 0.09 62 / 0.50) 0%, oklch(0.22 0.03 265 / 0.55) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.84 0.09 62)' }}>Efectividad</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.90 0.11 62)' }}>
              {ef.toFixed(1)}<span style={{ fontSize: 24 }}>%</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 400, color: 'oklch(0.68 0.05 62)' }}>meta 99.5% · faltan {brecha} pp</div>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'oklch(1 0 0 / 0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${barraEf}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, oklch(0.74 0.13 85), oklch(0.84 0.13 62))', boxShadow: '0 0 12px oklch(0.82 0.13 62 / 0.50)' }} />
          </div>
        </div>

        <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.30 0.04 265 / 0.60) 0%, oklch(0.21 0.022 265 / 0.55) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.72 0.03 265)' }}>Discrepancias</div>
          <div style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.95 0.01 265)' }}>
            {(resumen?.total ?? 0).toLocaleString('en-US')}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.58 0.02 265)' }}>{PERIODOS.find(p => p.key === periodo)?.label}</div>
        </div>

        <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.30 0.045 200 / 0.55) 0%, oklch(0.22 0.025 250 / 0.55) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.76 0.06 200)' }}>Tránsitos</div>
          <div style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.92 0.06 200)' }}>
            {(resumen?.totalTransacciones ?? 0).toLocaleString('en-US')}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.60 0.03 200)' }}>base del cálculo</div>
        </div>

        <Panel style={{ padding: '12px 20px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.62 0.02 265)' }}>Por estación</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>% efectividad · discrepancias del período</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {(resumen?.porEstacion ?? []).map(e => (
              <div key={e.estacion} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.01em', color: COLORS[e.estacion] ?? gris }}>{e.estacion}</span>
                  <span style={{ fontSize: 19, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.92 0.01 265)' }}>{e.efectividad.toFixed(0)}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 999, background: 'oklch(1 0 0 / 0.07)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, (e.efectividad - 85) / 15 * 100))}%`, height: '100%', borderRadius: 999, background: COLORS[e.estacion] ?? gris }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.54 0.015 265)' }}>{e.total} disc.</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Fila 350: confusiones · tendencia · vías críticas ── */}
      <div style={{ height: 350, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1fr 1.7fr 1.05fr', gap: 14 }}>

        <Panel>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>Top confusiones</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>tabulada → detectada</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 12 }}>
            {confusiones.length === 0
              ? <div style={{ color: gris, fontSize: 13, textAlign: 'center' }}>Sin datos</div>
              : confusiones.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 104, flex: '0 0 auto', textAlign: 'right', fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.70 0.015 265)' }}>{c.par}</div>
                  <div style={{ flex: '1 1 auto', minWidth: 0, height: 13, borderRadius: 5, background: 'oklch(1 0 0 / 0.05)' }}>
                    <div style={{ width: c.ancho, height: '100%', borderRadius: 5, background: c.color }} />
                  </div>
                  <div style={{ width: 34, flex: '0 0 auto', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.62 0.015 265)' }}>{c.n}</div>
                </div>
              ))}
          </div>
        </Panel>

        <Panel>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>Tendencia por estación</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {ESTACIONES.map(e => (
                <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 500, color: 'oklch(0.64 0.015 265)' }}>
                  <div style={{ width: 11, height: 11, borderRadius: 4, background: COLORS[e] }} />{e}
                </div>
              ))}
              <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.48 0.015 265)' }}>
                {periodo === 'mes' ? 'por día' : 'cada 30 min'}
              </div>
            </div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: 10, paddingTop: 14 }}>
            <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: 3, borderBottom: '1px solid oklch(1 0 0 / 0.10)' }}>
                {tendencia.length === 0
                  ? <div style={{ color: gris, fontSize: 13, margin: 'auto' }}>Sin datos</div>
                  : tendencia.map((col, i) => (
                    <div key={i} style={{ flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 1, borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                      {col.segs.map((s, j) => (
                        <div key={j} style={{ height: s.alto, background: s.color }} />
                      ))}
                    </div>
                  ))}
              </div>
              <div style={{ height: 20, flex: '0 0 auto', display: 'flex', gap: 3, paddingTop: 5 }}>
                {tendencia.map((col, i) => (
                  <div key={i} style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', textAlign: 'center', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: col.fg }}>{col.hora}</div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>Vías críticas</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>% sobre tránsitos propios</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 10 }}>
            {vias.length === 0
              ? <div style={{ color: gris, fontSize: 13, textAlign: 'center' }}>Sin datos</div>
              : vias.map(v => (
                <div key={v.rank} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 18, flex: '0 0 auto', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.44 0.015 265)' }}>{v.rank}</div>
                  <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                        <span style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v.via}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.01em', color: v.color }}>{v.est}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.50 0.015 265)' }}>{v.ratio}</span>
                        <span style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: v.pctFg }}>{v.pct}</span>
                      </div>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: 'oklch(1 0 0 / 0.06)', overflow: 'hidden' }}>
                      <div style={{ width: v.ancho, height: '100%', borderRadius: 999, background: v.color }} />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Panel>
      </div>

      {/* ── Fila flex:1: panel conmutable · tasa de error por hora ── */}
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 14 }}>

        <Panel>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 13 }}>
              <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>{panel.titulo}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>{panel.sub}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: 'oklch(0.24 0.018 262 / 0.70)' }}>
                {(['mantenimiento', 'detalle'] as const).map(p => (
                  <div key={p} onClick={() => setPanelInferior(p)} style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    color: panelInferior === p ? 'oklch(0.95 0.01 265)' : 'oklch(0.60 0.015 265)',
                    background: panelInferior === p ? 'oklch(0.34 0.045 210 / 0.75)' : 'transparent',
                    boxShadow: panelInferior === p ? 'inset 0 0 0 1px oklch(0.70 0.09 200 / 0.35)' : 'none',
                  }}>{p === 'mantenimiento' ? 'Prioridad' : 'Detalle'}</div>
                ))}
              </div>
              <div style={{ padding: '6px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'oklch(0.80 0.08 200)', background: 'oklch(0.35 0.05 210 / 0.45)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)' }}>
                Exportar PDF
              </div>
            </div>
          </div>

          <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: panel.cols, gap: 12, padding: '12px 0 8px', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.50 0.015 265)', borderBottom: '1px solid oklch(1 0 0 / 0.07)' }}>
            {panel.encabezados.map(h => (
              <div key={h} style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>{h}</div>
            ))}
          </div>

          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
            {panel.filas.length === 0
              ? <div style={{ color: gris, fontSize: 13, textAlign: 'center' }}>Sin datos</div>
              : panel.filas.map((f, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: panel.cols, gap: 12, alignItems: 'center', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                  {f.map((c, j) => (
                    <div key={j} style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: c.peso, color: c.fg ?? 'oklch(0.88 0.008 265)' }}>{c.txt}</div>
                  ))}
                </div>
              ))}
          </div>
        </Panel>

        <Panel>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>Tasa de error por hora</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>últimos 7 días</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: 10, paddingTop: 12 }}>
            <div style={{ width: 26, flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 60, margin: '-8px 0', fontSize: 13, fontWeight: 500, lineHeight: '16px', fontVariantNumeric: 'tabular-nums', color: 'oklch(0.48 0.015 265)' }}>
              {[1, 0.75, 0.5, 0.25, 0].map(f => (
                <span key={f}>{((horas.maxLabel ?? 0) * f).toFixed(1)}%</span>
              ))}
            </div>
            <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: 3, borderBottom: '1px solid oklch(1 0 0 / 0.10)' }}>
                {horas.barras.length === 0
                  ? <div style={{ color: gris, fontSize: 13, margin: 'auto' }}>Sin datos</div>
                  : horas.barras.map((h, i) => (
                    <div key={i} style={{ flex: '1 1 0', minWidth: 0, height: h.alto, borderRadius: '4px 4px 0 0', background: h.color }} />
                  ))}
              </div>
              <div style={{ height: 18, flex: '0 0 auto', display: 'flex', gap: 3, paddingTop: 4 }}>
                {horas.barras.map((h, i) => (
                  <div key={i} style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', textAlign: 'center', fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: h.fg }}>{h.txt}</div>
                ))}
              </div>
              {horas.nota && (
                <div style={{ height: 34, flex: '0 0 auto', marginTop: 8, display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px', borderRadius: 11, fontSize: 14, fontWeight: 500, color: 'oklch(0.80 0.06 200)', background: 'oklch(0.32 0.04 210 / 0.45)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.06)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.72 0.17 25)' }} />{horas.nota}
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </ScaledStage>
  )
}
