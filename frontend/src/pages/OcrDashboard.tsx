import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'
import type { OcrResumen, OcrAnalisis, OcrDetalle, OcrItem, OcrVia } from '../api/client'

const PERIODOS = ['1h', '4h', '12h', '24h', 'ayer', 'mes'] as const
const ESTACIONES = ['', 'FORTALEZA', 'HUARMEY', '402', 'VIRU', 'SANTA']
const TIPOS_ERROR = ['', 'NO DETECTADA', 'SUSTITUCIÓN', 'CARÁCTER EXTRA', 'CARÁCTER PERDIDO']

function colorTasa(pct: number) {
  if (pct >= 95) return '#3fb978'
  if (pct >= 85) return '#e0991f'
  return '#ef4b54'
}
function colorError(tipo: string) {
  if (tipo === 'NO DETECTADA')    return '#ef4b54'
  if (tipo === 'SUSTITUCIÓN')     return '#e0991f'
  if (tipo === 'CARÁCTER EXTRA')  return '#a78bfa'
  if (tipo === 'CARÁCTER PERDIDO') return '#60a5fa'
  return '#6b7a8c'
}

const ESTACION_COLOR: Record<string, string> = {
  FORTALEZA: '#72BF44', HUARMEY: '#F99B1C',
  '402': '#4A9EE0', VIRU: '#E060A0', SANTA: '#9B6BE0',
}

function RankingVias({ vias }: { vias: OcrVia[] }) {
  if (!vias.length) return null
  const maxErr = Math.max(...vias.map(v => v.noReconocidas + v.confusiones), 1)
  const mitad = Math.ceil(vias.length / 2)
  const cols = [vias.slice(0, mitad), vias.slice(mitad)]

  return (
    <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(239,75,84,.18)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '11px 18px', borderBottom: '1px solid rgba(239,75,84,.1)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#c05050', fontWeight: 700 }}>
          RANKING VÍAS · ERRORES OCR
        </span>
        <div style={{ display: 'flex', gap: 16, fontFamily: 'monospace', fontSize: 10, color: '#3a4a50', marginLeft: 'auto' }}>
          <span><span style={{ color: '#ef4b54' }}>■</span> No reconocida</span>
          <span><span style={{ color: '#e0991f' }}>■</span> Confusión</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ borderRight: ci === 0 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
            {col.map((v, i) => {
              const rank       = ci * mitad + i + 1
              const errores    = v.noReconocidas + v.confusiones
              // tasa real: % de transacciones con error (0–100)
              const tasaError  = v.total > 0 ? errores / v.total * 100 : 0
              const tasaNoRec  = v.total > 0 ? v.noReconocidas / v.total * 100 : 0
              const tasaConf   = v.total > 0 ? v.confusiones   / v.total * 100 : 0
              const eColor     = ESTACION_COLOR[v.estacion] ?? '#a09890'
              const errColor   = tasaError >= 30 ? '#ef4b54' : tasaError >= 15 ? '#e0991f' : '#facc15'
              return (
                <div key={i} style={{ padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: rank <= 3 ? '#ef4b54' : '#3a4a50', width: 20, textAlign: 'right', fontWeight: 700 }}>#{rank}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#ccd0d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.via}</span>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'baseline' }}>
                          <span style={{ fontSize: 10, color: eColor, fontWeight: 600 }}>{v.estacion}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: errColor, fontWeight: 700 }}>{tasaError.toFixed(1)}% err</span>
                        </div>
                      </div>

                      {/* Barra de tasa real — cada segmento = % del total de tránsitos */}
                      <div style={{ position: 'relative', height: 7, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                        {/* segmento no detectadas */}
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${tasaNoRec}%`, background: '#ef4b54', opacity: .8, borderRadius: '4px 0 0 4px' }} />
                        {/* segmento confusiones (comienza donde termina el anterior) */}
                        <div style={{ position: 'absolute', left: `${tasaNoRec}%`, top: 0, height: '100%', width: `${tasaConf}%`, background: '#e0991f', opacity: .8 }} />
                      </div>

                      <div style={{ display: 'flex', gap: 10, fontFamily: 'monospace', fontSize: 10 }}>
                        <span style={{ color: '#ef4b54' }}>{tasaNoRec.toFixed(1)}% no det.</span>
                        <span style={{ color: '#e0991f' }}>{tasaConf.toFixed(1)}% conf.</span>
                        <span style={{ marginLeft: 'auto', color: '#3a4a50' }}>{v.total.toLocaleString()} tráns.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Resalta caracteres distintos entre dos placas
function PlacaDiff({ cajero, ocr }: { cajero: string; ocr: string }) {
  if (!ocr) return <span style={{ color: '#ef4b54', fontFamily: 'monospace', fontSize: 14 }}>—</span>
  const maxLen = Math.max(cajero.length, ocr.length)
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 14, letterSpacing: '.06em' }}>
      {Array.from({ length: maxLen }, (_, i) => {
        const c = cajero[i] ?? ''
        const o = ocr[i]    ?? ''
        const diff = c !== o
        return (
          <span key={i} style={{ background: diff ? 'rgba(239,75,84,.25)' : 'transparent', color: diff ? '#ff9ba0' : '#e6edf3', borderRadius: 3, padding: diff ? '0 2px' : 0 }}>
            {o || '·'}
          </span>
        )
      })}
    </span>
  )
}

export function OcrDashboard() {
  const [periodo,   setPeriodo]   = useState('24h')
  const [resumen,   setResumen]   = useState<OcrResumen | null>(null)
  const [analisis,  setAnalisis]  = useState<OcrAnalisis | null>(null)
  const [detalle,   setDetalle]   = useState<OcrDetalle | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [tab,       setTab]       = useState<'confusion' | 'detalle'>('confusion')

  // Filtros detalle
  const [estacion,  setEstacion]  = useState('')
  const [placa,     setPlaca]     = useState('')
  const [tipoError, setTipoError] = useState('')
  const [pagina,    setPagina]    = useState(1)

  // Resumen: se recarga con cada cambio de período (rápido)
  const loadResumen = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setResumen(await api.ocrResumen(periodo))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }, [periodo])

  // Análisis: ventanas fijas en SQL (30d/7d), independiente del período — carga una vez
  useEffect(() => {
    api.ocrAnalisis().then(setAnalisis).catch(() => {})
  }, [])

  const loadDetalle = useCallback(async () => {
    const d = await api.ocrDetalle({ periodo, estacion: estacion||undefined, placa: placa||undefined, tipoError: tipoError||undefined, pagina, porPagina: 50 })
    setDetalle(d)
  }, [periodo, estacion, placa, tipoError, pagina])

  useEffect(() => { loadResumen() }, [loadResumen])
  useEffect(() => { if (tab === 'detalle') loadDetalle() }, [tab, loadDetalle])

  return (
    <div className="p-7 space-y-6" style={{ background: '#06090e', minHeight: 'calc(100vh - 60px)' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3' }}>OCR · Efectividad de Lectura de Placas</h1>
          <p style={{ fontSize: 12, color: '#5f7186', marginTop: 4, fontFamily: 'monospace' }}>
            Comparación placa cajero vs. placa detectada por cámara · últimos 30 días para análisis de caracteres
          </p>
        </div>
        <div className="flex gap-2">
          {PERIODOS.map(p => (
            <button key={p} onClick={() => { setPeriodo(p); setPagina(1) }}
              style={{ padding: '6px 14px', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', borderColor: periodo === p ? '#2dd4a7' : 'rgba(255,255,255,.1)', background: periodo === p ? 'rgba(45,212,167,.12)' : 'transparent', color: periodo === p ? '#2dd4a7' : '#6b7a8c' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#5f7186' }}>Cargando datos OCR…</div>
      ) : error ? (
        <div style={{ background: 'rgba(239,75,84,.08)', border: '1px solid rgba(239,75,84,.3)', borderRadius: 12, padding: '24px 28px' }}>
          <div style={{ color: '#ff9ba0', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Error al cargar datos OCR</div>
          <pre style={{ fontFamily: 'monospace', fontSize: 12, color: '#ef4b54', whiteSpace: 'pre-wrap', margin: 0 }}>{error}</pre>
          <button onClick={loadResumen} style={{ marginTop: 16, padding: '8px 20px', background: 'rgba(239,75,84,.15)', border: '1px solid rgba(239,75,84,.4)', borderRadius: 8, color: '#ff9ba0', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}>
            Reintentar
          </button>
        </div>
      ) : resumen && (
        <>
          {/* ── KPIs ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {[
              { label: 'TOTAL CON PLACA',  val: resumen.totalConPlaca.toLocaleString(), color: '#e6edf3', border: 'rgba(255,255,255,.1)' },
              { label: 'ACIERTOS',         val: resumen.aciertos.toLocaleString(),       color: '#3fb978', border: 'rgba(63,185,120,.3)' },
              { label: 'NO DETECTADAS',    val: resumen.sinDetectar.toLocaleString(),    color: '#ef4b54', border: 'rgba(239,75,84,.3)' },
              { label: 'ERRORES OCR',      val: resumen.errores.toLocaleString(),        color: '#e0991f', border: 'rgba(224,153,31,.3)' },
              { label: 'EFECTIVIDAD',      val: `${resumen.tasaEfectividad}%`,           color: colorTasa(resumen.tasaEfectividad), border: `rgba(${resumen.tasaEfectividad >= 95 ? '63,185,120' : resumen.tasaEfectividad >= 85 ? '224,153,31' : '239,75,84'},.35)` },
            ].map(({ label, val, color, border }) => (
              <div key={label} style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: `1px solid ${border}`, borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '.14em', color: '#5f7186', marginTop: 6 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* ── Ranking vías ── */}
          <RankingVias vias={resumen.porVia} />

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,.07)', paddingBottom: 0 }}>
            {([['confusion', 'Análisis de Caracteres'], ['detalle', 'Detalle de Registros']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '8px 20px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', borderBottom: `2px solid ${tab === t ? '#2dd4a7' : 'transparent'}`, color: tab === t ? '#2dd4a7' : '#5f7186', marginBottom: -1 }}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'confusion' && analisis && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>

              {/* ── Columna izq: confusión + pares ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Matriz de confusión de caracteres */}
                <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(224,153,31,.2)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(224,153,31,.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#b07a20', fontWeight: 700 }}>
                      CONFUSIÓN DE CARACTERES · SUSTITUCIONES · ÚLTIMOS 30 DÍAS
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#3a4a30' }}>solo misma longitud</span>
                  </div>

                  {analisis.topConfusiones.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#3fb978', fontFamily: 'monospace', fontSize: 13 }}>
                      ✓ Sin sustituciones de caracteres en el período
                    </div>
                  ) : (
                    <div style={{ overflowY: 'auto', maxHeight: 360 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                            {['Pos.', 'Cajero escribió', 'OCR leyó', 'Veces', 'Visualización'].map(h => (
                              <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontFamily: 'monospace', fontSize: 10, letterSpacing: '.1em', color: '#5f7186', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.05)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {analisis.topConfusiones.map((c, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,153,31,.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <td style={{ padding: '9px 16px', fontFamily: 'monospace', color: '#5f7186' }}>{c.posicion}</td>
                              <td style={{ padding: '9px 16px' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#3fb978', background: 'rgba(63,185,120,.1)', padding: '2px 10px', borderRadius: 6 }}>{c.esperado}</span>
                              </td>
                              <td style={{ padding: '9px 16px' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#ef4b54', background: 'rgba(239,75,84,.1)', padding: '2px 10px', borderRadius: 6 }}>{c.ocrLeyo}</span>
                              </td>
                              <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#e0991f' }}>{c.casos}</td>
                              <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontSize: 12, color: '#9aa7b6' }}>
                                <span style={{ color: '#3fb978' }}>{c.esperado}</span>
                                <span style={{ color: '#5f7186', margin: '0 8px' }}>→</span>
                                <span style={{ color: '#ef4b54' }}>{c.ocrLeyo}</span>
                                <span style={{ color: '#3a4a50', marginLeft: 8, fontSize: 10 }}>en pos.{c.posicion}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Top pares (placa cajero → placa OCR) */}
                <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#5a8a7a', fontWeight: 700 }}>
                      TOP PARES MÁS FRECUENTES · ERRORES OCR
                    </span>
                  </div>
                  <div style={{ overflowY: 'auto', maxHeight: 260 }}>
                    {analisis.topPares.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.2)', width: 20 }}>{i + 1}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#e6edf3', letterSpacing: '.06em', minWidth: 80 }}>{p.placaCajero}</span>
                        <span style={{ color: '#3a4a50', fontSize: 12 }}>→</span>
                        <PlacaDiff cajero={p.placaCajero} ocr={p.placaOcr} />
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: colorError(p.tipoError), fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>
                          {p.tipoError}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#e0991f', width: 36, textAlign: 'right' }}>{p.casos}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Columna der: por estación + por hora + tipos de error ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Por estación */}
                <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#5a8a7a', fontWeight: 700 }}>EFECTIVIDAD POR ESTACIÓN</span>
                  </div>
                  <div style={{ padding: '8px 0' }}>
                    {resumen.porEstacion.map(e => (
                      <div key={e.estacion} style={{ padding: '10px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, color: '#ccd0d8', fontWeight: 600 }}>{e.estacion}</span>
                          <div style={{ display: 'flex', gap: 12, fontFamily: 'monospace', fontSize: 11 }}>
                            <span style={{ color: '#ef4b54' }}>✗ {e.sinDetectar + e.errores}</span>
                            <span style={{ color: colorTasa(e.efectividad), fontWeight: 700 }}>{e.efectividad}%</span>
                          </div>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${e.efectividad}%`, background: colorTasa(e.efectividad), borderRadius: 3, transition: 'width .4s' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 3, fontFamily: 'monospace', fontSize: 10, color: '#3a4a50' }}>
                          <span>{e.total.toLocaleString()} tránsitos</span>
                          <span>·</span>
                          <span style={{ color: '#3fb978' }}>{e.aciertos.toLocaleString()} OK</span>
                          <span>·</span>
                          <span style={{ color: '#ef4b54' }}>{e.sinDetectar} no detectadas</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tipos de error */}
                <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#5a8a7a', fontWeight: 700 }}>CLASIFICACIÓN DE ERRORES</span>
                  </div>
                  <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {resumen.porTipoError.map(t => {
                      const pct = resumen.totalConPlaca > 0 ? (t.total / resumen.totalConPlaca * 100).toFixed(1) : '0'
                      return (
                        <div key={t.tipoError}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: colorError(t.tipoError), fontWeight: 600 }}>{t.tipoError}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#9aa7b6' }}>{t.total.toLocaleString()} · <span style={{ color: colorError(t.tipoError) }}>{pct}%</span></span>
                          </div>
                          <div style={{ height: 5, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: colorError(t.tipoError), borderRadius: 3, opacity: .7 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Efectividad por hora (últimos 7 días) */}
                <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#5a8a7a', fontWeight: 700 }}>EFECTIVIDAD POR HORA · 7 DÍAS</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#2a4040' }}>posibles caídas de iluminación</span>
                  </div>
                  <div style={{ padding: '12px 18px' }}>
                    <HoraChart data={analisis.porHora} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'detalle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Filtros */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 18px', background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12 }}>
                <select value={estacion} onChange={e => { setEstacion(e.target.value); setPagina(1) }}
                  style={{ padding: '6px 12px', background: '#0a1520', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#9aa7b6', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer' }}>
                  {ESTACIONES.map(e => <option key={e} value={e}>{e || 'Todas las estaciones'}</option>)}
                </select>
                <select value={tipoError} onChange={e => { setTipoError(e.target.value); setPagina(1) }}
                  style={{ padding: '6px 12px', background: '#0a1520', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#9aa7b6', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer' }}>
                  {TIPOS_ERROR.map(t => <option key={t} value={t}>{t || 'Todos los tipos'}</option>)}
                </select>
                <input placeholder="Buscar placa…" value={placa} onChange={e => { setPlaca(e.target.value.toUpperCase()); setPagina(1) }}
                  style={{ padding: '6px 12px', background: '#0a1520', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#e6edf3', fontFamily: 'monospace', fontSize: 12, width: 160 }} />
                <button onClick={loadDetalle}
                  style={{ padding: '6px 18px', background: 'rgba(45,212,167,.12)', border: '1px solid rgba(45,212,167,.3)', borderRadius: 8, color: '#2dd4a7', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Buscar
                </button>
                {detalle && <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 12, color: '#5f7186', alignSelf: 'center' }}>{detalle.total.toLocaleString()} registros</span>}
              </div>

              {/* Tabla */}
              {detalle && (
                <div style={{ background: 'linear-gradient(180deg,#0c141d,#080e15)', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                        {['Fecha', 'Estación', 'Vía', 'Ticket', 'Placa Cajero', 'Placa OCR', 'Diferencia', 'Tipo Error'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: 'monospace', fontSize: 10, letterSpacing: '.1em', color: '#5f7186', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.06)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.items.map((item: OcrItem, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: '#5f7186', whiteSpace: 'nowrap' }}>{item.fecha}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: '#9aa7b6' }}>{item.estacion}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: '#5f7186' }}>{item.via}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 11, color: '#5f7186' }}>{item.ticket}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 14, color: '#3fb978', letterSpacing: '.06em' }}>{item.placaCajero}</td>
                          <td style={{ padding: '9px 14px' }}><PlacaDiff cajero={item.placaCajero} ocr={item.placaOcr} /></td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: '#9aa7b6' }}>
                            {item.placaOcr ? (
                              Array.from(item.placaCajero).filter((c, i) => c !== (item.placaOcr[i] ?? '')).length > 0
                                ? <span style={{ color: '#ef4b54' }}>{Array.from(item.placaCajero).filter((c, i) => c !== (item.placaOcr[i] ?? '')).length} char(s)</span>
                                : <span style={{ color: '#ef4b54' }}>±{Math.abs(item.placaCajero.length - item.placaOcr.length)} largo</span>
                            ) : <span style={{ color: '#ef4b54' }}>no detectada</span>}
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: colorError(item.tipoError), background: `${colorError(item.tipoError)}18`, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                              {item.tipoError}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Paginación */}
                  {detalle.total > 50 && (
                    <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderTop: '1px solid rgba(255,255,255,.05)' }}>
                      {Array.from({ length: Math.min(Math.ceil(detalle.total / 50), 10) }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPagina(p)}
                          style={{ width: 32, height: 32, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', border: '1px solid', borderColor: pagina === p ? '#2dd4a7' : 'rgba(255,255,255,.1)', background: pagina === p ? 'rgba(45,212,167,.12)' : 'transparent', color: pagina === p ? '#2dd4a7' : '#6b7a8c' }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Gráfico de barras efectividad por hora
function HoraChart({ data }: { data: { hora: number; total: number; efectividad: number }[] }) {
  if (!data.length) return <div style={{ color: '#5f7186', fontSize: 12, textAlign: 'center' }}>Sin datos</div>
  const allHours = Array.from({ length: 24 }, (_, h) => {
    const d = data.find(x => x.hora === h)
    return { hora: h, efectividad: d?.efectividad ?? null, total: d?.total ?? 0 }
  })
  const barW = 100 / 24
  return (
    <div style={{ position: 'relative', height: 80 }}>
      <svg viewBox="0 0 240 60" style={{ display: 'block', width: '100%', height: 80 }}>
        {allHours.map((h, i) => {
          if (h.efectividad == null || h.total === 0) return null
          const barH = (h.efectividad / 100) * 48
          const col = colorTasa(h.efectividad)
          return (
            <g key={i}>
              <rect x={i * 10 + 0.5} y={48 - barH} width={9} height={barH} rx="1.5"
                fill={col} opacity="0.7" />
              {h.efectividad < 90 && (
                <text x={i * 10 + 5} y={56} textAnchor="middle" fill={col} fontSize="5" fontFamily="monospace">{h.hora}</text>
              )}
            </g>
          )
        })}
        {/* 95% line */}
        <line x1="0" y1={48 * 0.05} x2="240" y2={48 * 0.05} stroke="#3fb978" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 10, color: '#3a4a50', marginTop: 2 }}>
        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  )
}
