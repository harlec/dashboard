import { useEffect, useMemo, useState } from 'react'
import { api, type ReporteTipo, type ReporteEstimado } from '../api/client'
import { ScaledStage } from '../components/ScaledStage'
import { WallTopbar } from '../components/WallTopbar'
import { Panel } from '../components/Panel'

// Fuente de verdad visual: design_handoff_monitoreo_funcional/pantallas/Reportes v2.dc.html

const TIPOS: { tipo: ReporteTipo; nombre: string; desc: string }[] = [
  { tipo: 'incidentes', nombre: 'Incidentes', desc: 'Cada caída de equipo con inicio, fin, duración y causa. Para auditoría y reclamos.' },
  { tipo: 'sla', nombre: 'Reporte SLA', desc: 'Uptime por equipo contra la meta de 99.5%, con tiempo caído y motivo principal.' },
  { tipo: 'discrepancias', nombre: 'Discrepancias DAC', desc: 'Tabulado del cobrador contra la clasificación automática, transacción por transacción.' },
  { tipo: 'ocr', nombre: 'OCR de placas', desc: 'Placa del cajero contra placa de cámara, con el tipo de error y el carácter confundido.' },
]
const PRESETS = ['Hoy', 'Últimos 7 días', 'Últimos 30 días', 'Personalizado'] as const
const ESTS = ['FORTALEZA', 'HUARMEY', '402', 'VIRU', 'SANTA']
const PERIODOS_CORTOS = [
  { key: '1h', label: 'Última hora' }, { key: '4h', label: '4 h' }, { key: '12h', label: '12 h' },
  { key: '24h', label: '24 h' }, { key: 'ayer', label: 'Ayer' }, { key: 'mes', label: 'Mes' },
] as const

function fechaHace(dias: number) { const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10) }
function hastaEfectiva(hasta: string) {
  const hastaDate = new Date(hasta + 'T00:00:00')
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return hastaDate >= hoy ? new Date().toISOString() : `${hasta}T23:59:59`
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

interface Reciente { id: string; tipo: ReporteTipo; formato: 'csv' | 'pdf'; periodo: string; filtros: string; filas: number; url: string; fecha: string }
const RECIENTES_KEY = 'pulsovial_reportes_recientes'
function loadRecientes(): Reciente[] { try { return JSON.parse(localStorage.getItem(RECIENTES_KEY) ?? '[]') } catch { return [] } }
function saveReciente(r: Reciente) {
  const treintaDias = Date.now() - 30 * 86_400_000
  const next = [r, ...loadRecientes().filter(x => new Date(x.fecha).getTime() >= treintaDias)].slice(0, 15)
  localStorage.setItem(RECIENTES_KEY, JSON.stringify(next))
  return next
}

export function Reportes() {
  const [tipo, setTipo] = useState<ReporteTipo>('incidentes')
  const [preset, setPreset] = useState<typeof PRESETS[number]>('Últimos 30 días')
  const [desde, setDesde] = useState(() => fechaHace(30))
  const [hasta, setHasta] = useState(() => fechaHace(0))
  const [periodoCorto, setPeriodoCorto] = useState<typeof PERIODOS_CORTOS[number]['key']>('24h')
  const [estsMarcadas, setEstsMarcadas] = useState<Set<string>>(new Set())
  const [soloActivos, setSoloActivos] = useState(false)
  const [excluirMtto, setExcluirMtto] = useState(true)
  const [soloPrepago, setSoloPrepago] = useState(false)

  const [estimado, setEstimado] = useState<ReporteEstimado | null>(null)
  const [descargando, setDescargando] = useState(false)
  const [recientes, setRecientes] = useState<Reciente[]>(() => loadRecientes())

  const usaFechas = tipo === 'incidentes' || tipo === 'sla'
  const seleccion = TIPOS.find(t => t.tipo === tipo)!

  useEffect(() => {
    if (preset === 'Hoy') { setDesde(fechaHace(0)); setHasta(fechaHace(0)) }
    else if (preset === 'Últimos 7 días') { setDesde(fechaHace(7)); setHasta(fechaHace(0)) }
    else if (preset === 'Últimos 30 días') { setDesde(fechaHace(30)); setHasta(fechaHace(0)) }
  }, [preset])

  const estacionUnica = estsMarcadas.size === 1 ? [...estsMarcadas][0] : undefined

  const filtros = () => ({
    tipo,
    desde: usaFechas ? new Date(desde + 'T00:00:00').toISOString() : undefined,
    hasta: usaFechas ? hastaEfectiva(hasta) : undefined,
    periodo: usaFechas ? undefined : periodoCorto,
    estacion: (tipo === 'incidentes' || tipo === 'discrepancias' || tipo === 'ocr') ? estacionUnica : undefined,
    estacionId: undefined as number | undefined,
    soloActivos: tipo === 'incidentes' ? soloActivos : undefined,
    soloPrepago: tipo === 'ocr' ? soloPrepago : undefined,
  })

  useEffect(() => {
    api.reportesEstimar(filtros()).then(setEstimado).catch(() => setEstimado(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, desde, hasta, periodoCorto, estsMarcadas, soloActivos, soloPrepago])

  const opciones = useMemo(() => {
    if (tipo === 'incidentes') return [{ txt: 'Solo incidentes activos', on: soloActivos, toggle: () => setSoloActivos(v => !v) }]
    if (tipo === 'sla') return [{ txt: 'Excluir mantenimiento programado', on: excluirMtto, toggle: () => setExcluirMtto(v => !v) }]
    if (tipo === 'ocr') return [{ txt: 'Solo tránsitos prepago', on: soloPrepago, toggle: () => setSoloPrepago(v => !v) }]
    return [{ txt: 'Sin opciones adicionales para este informe', on: false, toggle: () => {} }]
  }, [tipo, soloActivos, excluirMtto, soloPrepago])

  const construirUrl = (formato: 'csv' | 'pdf') => {
    const f = filtros()
    const params = new URLSearchParams()
    if (f.desde) params.set('desde', f.desde)
    if (f.hasta) params.set('hasta', f.hasta)
    if (f.periodo) params.set('periodo', f.periodo)
    if (f.estacion) params.set('estacion', f.estacion)
    if (f.soloActivos) params.set('soloAbiertos', 'true')
    if (f.soloPrepago) params.set('soloPrepago', 'true')
    if (tipo === 'sla' && !excluirMtto) params.set('incluirMantenimiento', 'true')
    const base: Record<ReporteTipo, string> = { incidentes: '/api/incidentes', sla: '/api/reporte/sla', discrepancias: '/api/discrepancias', ocr: '/api/ocr' }
    return `${base[tipo]}/${formato}?${params}`
  }

  const descargar = (formato: 'csv' | 'pdf') => {
    setDescargando(true)
    const url = construirUrl(formato)
    window.open(url, '_blank')
    const periodoTxt = usaFechas ? `${desde} – ${hasta}` : PERIODOS_CORTOS.find(p => p.key === periodoCorto)?.label ?? periodoCorto
    const filtrosTxt = estsMarcadas.size === 0 ? 'Todas' : [...estsMarcadas].join(' · ')
    setRecientes(saveReciente({
      id: `${Date.now()}`, tipo, formato, periodo: periodoTxt, filtros: filtrosTxt,
      filas: estimado?.filas ?? 0, url, fecha: new Date().toISOString(),
    }))
    setTimeout(() => setDescargando(false), 800)
  }

  const pdfDisponible = estimado?.pdfDisponible ?? (tipo === 'incidentes' || tipo === 'sla')

  return (
    <ScaledStage>
      <WallTopbar activo="Reportes" />

      <div style={{ height: 40, flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em' }}>Reportes</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.56 0.015 265)' }}>arma el informe, revisa qué va a salir y descárgalo en CSV o PDF</div>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: '0.92fr 1.15fr 1fr', gap: 13 }}>

        {/* ── Paso 1 ── */}
        <Panel style={{ padding: '16px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>1 · Qué reporte</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>un informe por vez</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: 12 }}>
            {TIPOS.map(t => {
              const on = t.tipo === tipo
              return (
                <div key={t.tipo} onClick={() => setTipo(t.tipo)} style={{
                  boxSizing: 'border-box', padding: '15px 18px', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer',
                  background: on ? 'oklch(0.32 0.045 210 / 0.70)' : 'oklch(0.26 0.02 262 / 0.50)',
                  boxShadow: on ? 'inset 0 0 0 1px oklch(0.72 0.10 200 / 0.45)' : 'inset 0 0 0 1px oklch(1 0 0 / 0.05)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: on ? 'oklch(0.95 0.01 265)' : 'oklch(0.80 0.012 265)' }}>{t.nombre}</div>
                    <div style={{ width: 19, height: 19, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'oklch(0.18 0.04 200)', background: on ? 'oklch(0.82 0.11 200)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1px oklch(0.40 0.015 265)' }}>{on ? '✓' : ''}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.45, color: 'oklch(0.64 0.015 265)' }}>{t.desc}</div>
                </div>
              )
            })}
          </div>
        </Panel>

        {/* ── Paso 2 ── */}
        <Panel style={{ padding: '16px 22px' }}>
          <div style={{ fontSize: 19, fontWeight: 600 }}>2 · Qué período y filtros</div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 14 }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'oklch(0.52 0.015 265)' }}>Período</div>
              {usaFechas ? (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PRESETS.map(p => (
                      <div key={p} onClick={() => setPreset(p)} style={{
                        padding: '8px 14px', borderRadius: 11, fontSize: 15, fontWeight: preset === p ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
                        color: preset === p ? 'oklch(0.18 0.04 200)' : 'oklch(0.68 0.015 265)',
                        background: preset === p ? 'linear-gradient(180deg, oklch(0.84 0.11 200), oklch(0.74 0.11 200))' : 'oklch(0.28 0.02 262 / 0.75)',
                        boxShadow: preset === p ? 'none' : 'inset 0 0 0 1px oklch(1 0 0 / 0.06)',
                      }}>{p}</div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', borderRadius: 12, fontSize: 16, fontWeight: 500, background: 'oklch(0.28 0.02 262 / 0.80)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.52 0.015 265)' }}>Desde</span>
                      <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPreset('Personalizado') }} style={{ background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 15 }} />
                    </label>
                    <label style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', borderRadius: 12, fontSize: 16, fontWeight: 500, background: 'oklch(0.28 0.02 262 / 0.80)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.52 0.015 265)' }}>Hasta</span>
                      <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPreset('Personalizado') }} style={{ background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 15 }} />
                    </label>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PERIODOS_CORTOS.map(p => (
                    <div key={p.key} onClick={() => setPeriodoCorto(p.key)} style={{
                      padding: '8px 14px', borderRadius: 11, fontSize: 15, fontWeight: periodoCorto === p.key ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
                      color: periodoCorto === p.key ? 'oklch(0.18 0.04 200)' : 'oklch(0.68 0.015 265)',
                      background: periodoCorto === p.key ? 'linear-gradient(180deg, oklch(0.84 0.11 200), oklch(0.74 0.11 200))' : 'oklch(0.28 0.02 262 / 0.75)',
                      boxShadow: periodoCorto === p.key ? 'none' : 'inset 0 0 0 1px oklch(1 0 0 / 0.06)',
                    }}>{p.label}</div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'oklch(0.52 0.015 265)' }}>Estaciones</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <div onClick={() => setEstsMarcadas(new Set())} style={{
                  padding: '8px 14px', borderRadius: 11, fontSize: 15, fontWeight: estsMarcadas.size === 0 ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
                  color: estsMarcadas.size === 0 ? 'oklch(0.18 0.04 200)' : 'oklch(0.68 0.015 265)',
                  background: estsMarcadas.size === 0 ? 'linear-gradient(180deg, oklch(0.84 0.11 200), oklch(0.74 0.11 200))' : 'oklch(0.28 0.02 262 / 0.75)',
                  boxShadow: estsMarcadas.size === 0 ? 'none' : 'inset 0 0 0 1px oklch(1 0 0 / 0.06)',
                }}>Todas</div>
                {ESTS.map(e => {
                  const on = estsMarcadas.has(e)
                  return (
                    <div key={e} onClick={() => setEstsMarcadas(s => { const n = new Set(s); n.has(e) ? n.delete(e) : n.add(e); return n })} style={{
                      padding: '8px 14px', borderRadius: 11, fontSize: 15, fontWeight: on ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
                      color: on ? 'oklch(0.18 0.04 200)' : 'oklch(0.68 0.015 265)',
                      background: on ? 'linear-gradient(180deg, oklch(0.84 0.11 200), oklch(0.74 0.11 200))' : 'oklch(0.28 0.02 262 / 0.75)',
                      boxShadow: on ? 'none' : 'inset 0 0 0 1px oklch(1 0 0 / 0.06)',
                    }}>{e}</div>
                  )
                })}
              </div>
              {estsMarcadas.size > 1 && (
                <div style={{ fontSize: 12.5, color: 'oklch(0.62 0.02 62)' }}>Con varias marcadas, la descarga trae todas (el filtro por una sola estación se aplica cuando hay exactamente una marcada).</div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'oklch(0.52 0.015 265)' }}>Opciones de {seleccion.nombre}</div>
              {opciones.map(o => (
                <div key={o.txt} onClick={o.toggle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 15px', borderRadius: 12, cursor: 'pointer', background: 'oklch(0.26 0.02 262 / 0.55)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.05)' }}>
                  <div style={{ width: 34, height: 19, flex: '0 0 auto', borderRadius: 999, display: 'flex', alignItems: 'center', padding: 2, justifyContent: o.on ? 'flex-end' : 'flex-start', background: o.on ? 'oklch(0.74 0.11 200)' : 'oklch(0.34 0.015 265)' }}>
                    <div style={{ width: 15, height: 15, borderRadius: '50%', background: o.on ? 'oklch(0.20 0.04 200)' : 'oklch(0.62 0.015 265)' }} />
                  </div>
                  <div style={{ minWidth: 0, fontSize: 15, fontWeight: 500, color: o.on ? 'oklch(0.94 0.01 265)' : 'oklch(0.70 0.015 265)' }}>{o.txt}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* ── Paso 3 ── */}
        <div style={{ minWidth: 0, boxSizing: 'border-box', borderRadius: 22, padding: '16px 22px', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg, oklch(0.26 0.035 210 / 0.75) 0%, oklch(0.19 0.018 262 / 0.92) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.08), 0 14px 40px oklch(0 0 0 / 0.32)' }}>
          <div style={{ fontSize: 19, fontWeight: 600 }}>3 · Qué vas a descargar</div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Filas', val: (estimado?.filas ?? 0).toLocaleString('es-PE') },
                { label: 'Columnas', val: String(estimado?.columnas ?? 0) },
                { label: 'Tamaño aprox.', val: estimado ? fmtBytes(estimado.bytesAprox) : '—' },
              ].map(k => (
                <div key={k.label} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, padding: '13px 16px', borderRadius: 14, background: 'oklch(0.24 0.02 262 / 0.70)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.06)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'oklch(0.56 0.02 265)' }}>{k.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', color: 'oklch(0.94 0.01 265)' }}>{k.val}</div>
                </div>
              ))}
            </div>

            <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'oklch(0.56 0.02 265)' }}>Columnas incluidas</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(estimado?.columnasNombres ?? []).map(c => (
                  <div key={c} style={{ padding: '7px 13px', borderRadius: 10, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: 'oklch(0.84 0.012 265)', background: 'oklch(0.30 0.025 250 / 0.60)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.06)' }}>{c}</div>
                ))}
              </div>
            </div>

            {estimado?.aviso && (
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderRadius: 12, fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: 'oklch(0.82 0.06 200)', background: 'oklch(0.30 0.04 210 / 0.45)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.06)' }}>{estimado.aviso}</div>
            )}

            <div style={{ flex: '0 0 auto', display: 'flex', gap: 10 }}>
              <div onClick={() => descargar('csv')} style={{ flex: '1 1 0', padding: '13px 18px', borderRadius: 13, textAlign: 'center', fontSize: 16, fontWeight: 600, cursor: descargando ? 'default' : 'pointer', opacity: descargando ? 0.6 : 1, color: 'oklch(0.18 0.04 165)', background: 'linear-gradient(180deg, oklch(0.84 0.13 165), oklch(0.74 0.13 163))' }}>Descargar CSV</div>
              {pdfDisponible && (
                <div onClick={() => descargar('pdf')} style={{ flex: '1 1 0', padding: '13px 18px', borderRadius: 13, textAlign: 'center', fontSize: 16, fontWeight: 600, cursor: descargando ? 'default' : 'pointer', opacity: descargando ? 0.6 : 1, color: 'oklch(0.90 0.10 22)', background: 'oklch(0.38 0.10 22 / 0.40)', boxShadow: 'inset 0 0 0 1px oklch(0.65 0.13 22 / 0.32)' }}>Descargar PDF</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Descargas recientes ────────────────────────────── */}
      <Panel style={{ height: 262, flex: '0 0 auto', padding: '15px 24px' }}>
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 13 }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Descargas recientes</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>se conservan 30 días en este navegador · vuelven a generarse con los mismos filtros</div>
          </div>
        </div>
        <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1.4fr 1fr 0.8fr 0.8fr 1fr 130px', gap: 12, padding: '11px 0 8px', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.50 0.015 265)', borderBottom: '1px solid oklch(1 0 0 / 0.07)' }}>
          <div>Reporte</div><div>Período</div><div>Filtros</div><div>Formato</div><div>Filas</div><div>Generado</div><div />
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
          {recientes.length === 0
            ? <div style={{ color: 'oklch(0.62 0.015 265)', fontSize: 14, textAlign: 'center' }}>Sin descargas todavía</div>
            : recientes.map(r => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.4fr 1fr 0.8fr 0.8fr 1fr 130px', gap: 12, alignItems: 'center', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{TIPOS.find(t => t.tipo === r.tipo)?.nombre}</div>
                <div style={{ color: 'oklch(0.62 0.015 265)' }}>{r.periodo}</div>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'oklch(0.62 0.015 265)' }}>{r.filtros}</div>
                <div><span style={{
                  padding: '3px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  color: r.formato === 'csv' ? 'oklch(0.88 0.11 160)' : 'oklch(0.86 0.11 22)',
                  background: r.formato === 'csv' ? 'oklch(0.40 0.09 165 / 0.32)' : 'oklch(0.42 0.11 22 / 0.30)',
                }}>{r.formato.toUpperCase()}</span></div>
                <div style={{ color: 'oklch(0.80 0.012 265)' }}>{r.filas.toLocaleString('es-PE')}</div>
                <div style={{ color: 'oklch(0.58 0.015 265)' }}>{new Date(r.fecha).toLocaleString('es-PE', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                <div onClick={() => window.open(r.url, '_blank')} style={{ padding: '7px 14px', borderRadius: 10, textAlign: 'center', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'oklch(0.84 0.08 200)', background: 'oklch(0.30 0.04 210 / 0.50)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.06)' }}>Descargar</div>
              </div>
            ))}
        </div>
      </Panel>
    </ScaledStage>
  )
}
