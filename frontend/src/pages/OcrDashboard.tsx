import { useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react'
import { api } from '../api/client'
import type { OcrResumen, OcrAnalisis, OcrDetalle, OcrItem, OcrVia, OcrTendencias, OcrCelda, OcrHeatmapRow, OcrViaEvolucion, OcrMejorViaPeriodo, OcrTodaVia } from '../api/client'
import { ScaledStage } from '../components/ScaledStage'
import { WallTopbar } from '../components/WallTopbar'

const PERIODOS = ['1h', '4h', '12h', '24h', 'ayer', 'mes'] as const
const ESTACIONES = ['', 'FORTALEZA', 'HUARMEY', '402', 'VIRU', 'SANTA']
const TIPOS_ERROR = ['', 'NO DETECTADA', 'SUSTITUCIÓN', 'CARÁCTER EXTRA', 'CARÁCTER PERDIDO']

function colorTasa(pct: number) {
  if (pct >= 95) return 'light-dark(#3fb978, oklch(0.564 0.159 156))'
  if (pct >= 85) return 'light-dark(#e0991f, oklch(0.546 0.163 74))'
  return 'light-dark(#ef4b54, oklch(0.595 0.170 22))'
}
function colorError(tipo: string) {
  if (tipo === 'NO DETECTADA')    return 'light-dark(#ef4b54, oklch(0.595 0.170 22))'
  if (tipo === 'SUSTITUCIÓN')     return 'light-dark(#e0991f, oklch(0.546 0.163 74))'
  if (tipo === 'CARÁCTER EXTRA')  return 'light-dark(#a78bfa, oklch(0.560 0.170 294))'
  if (tipo === 'CARÁCTER PERDIDO') return '#60a5fa'
  return 'var(--tx-muted)'
}

// ── Colores heatmap ───────────────────────────────────────────
function heatBg(tasa: number | null): string {
  if (tasa === null) return 'rgb(var(--ov) / .02)'
  if (tasa === 0)    return 'rgba(63,185,120,.18)'
  if (tasa < 10)     return 'rgba(63,185,120,.55)'
  if (tasa < 20)     return 'rgba(224,153,31,.6)'
  if (tasa < 35)     return 'rgba(239,75,84,.55)'
  return 'rgba(239,75,84,.88)'
}
function heatFg(tasa: number | null): string {
  if (tasa === null) return '#1e2530'
  if (tasa < 10) return '#2a5a3a'
  if (tasa < 20) return '#5a3a10'
  return '#6a1a1a'
}

// ── Heatmap vía × hora ────────────────────────────────────────
function HeatmapPanel({ rows }: { rows: OcrHeatmapRow[] }) {
  const HORAS = Array.from({ length: 24 }, (_, i) => i)
  if (!rows.length) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 12 }}>
      Sin datos suficientes para el heatmap
    </div>
  )
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--app-font)' }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 10px 4px 0', textAlign: 'left', color: 'var(--tx-muted)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 110 }}>Vía</th>
            <th style={{ padding: '4px 4px', color: 'var(--tx-muted)', fontWeight: 400, fontSize: 10, whiteSpace: 'nowrap', minWidth: 48 }}>% err</th>
            {HORAS.map(h => (
              <th key={h} style={{ padding: '2px 1px', color: 'var(--tx-dim)', fontWeight: 400, fontSize: 9, textAlign: 'center', width: 26 }}>
                {h % 3 === 0 ? `${String(h).padStart(2,'0')}h` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const horaMap = new Map(row.horas.map(h => [h.hora, h]))
            return (
              <tr key={ri}>
                <td style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}>
                  <span style={{ color: ESTACION_COLOR[row.estacion] ?? 'var(--tx-muted)', fontSize: 9, marginRight: 4 }}>●</span>
                  <span style={{ color: 'var(--tx-2)' }}>{row.via}</span>
                </td>
                <td style={{ padding: '2px 4px', textAlign: 'right', color: row.tasaVia >= 30 ? 'light-dark(#ef4b54, oklch(0.595 0.170 22))' : row.tasaVia >= 15 ? 'light-dark(#e0991f, oklch(0.546 0.163 74))' : 'light-dark(#3fb978, oklch(0.564 0.159 156))', fontWeight: 700 }}>
                  {Number(row.tasaVia).toFixed(1)}%
                </td>
                {HORAS.map(h => {
                  const c = horaMap.get(h) ?? null
                  const tasa = c ? Number(c.tasaError) : null
                  return (
                    <td key={h} title={c ? `${String(h).padStart(2,'0')}h — ${tasa?.toFixed(1)}% error (${c.total} tráns.)` : `${String(h).padStart(2,'0')}h — sin datos`}
                      style={{ padding: '1px', cursor: 'default' }}>
                      <div style={{ width: 24, height: 18, borderRadius: 3, background: heatBg(tasa), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {tasa !== null && tasa >= 20 && (
                          <span style={{ fontSize: 7, color: heatFg(tasa), fontWeight: 700 }}>{tasa.toFixed(0)}</span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Perfil horario mejores vías ───────────────────────────────
const LINEA_COLORS = ['light-dark(#3fb978, oklch(0.564 0.159 156))', 'light-dark(#00BBE7, oklch(0.546 0.150 223))', 'light-dark(#FFDD00, oklch(0.456 0.170 98))', 'light-dark(#2dd4a7, oklch(0.522 0.161 169))', '#F99B1C', 'light-dark(#a78bfa, oklch(0.560 0.170 294))', '#60a5fa', '#e879f9']

function PerfilHorarioChart({ vias }: { vias: OcrTendencias['mejoresVias'] }) {
  if (!vias.length) return null
  const W = 420, H = 130, pL = 28, pR = 8, pT = 8, pB = 22
  const cW = W - pL - pR, cH = H - pT - pB
  const allTasas = vias.flatMap(v => v.porHora.map(h => h.tasaError))
  const maxT = Math.max(...allTasas, 15)
  const xOf = (h: number) => pL + (h / 23) * cW
  const yOf = (t: number) => pT + cH - Math.min(t / maxT, 1) * cH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {/* Grid horizontales */}
      {[0, maxT * 0.5, maxT].map((t, i) => (
        <g key={i}>
          <line x1={pL} y1={yOf(t)} x2={W - pR} y2={yOf(t)} stroke="rgb(var(--ov) / .05)" strokeWidth=".5" />
          <text x={pL - 3} y={yOf(t) + 3} textAnchor="end" fill="var(--tx-dim)" fontSize="7" fontFamily="var(--app-font)">{t.toFixed(0)}%</text>
        </g>
      ))}
      {/* Líneas por vía */}
      {vias.map((v, i) => {
        const pts = v.porHora.map((h: OcrCelda) => `${xOf(h.hora).toFixed(1)},${yOf(Number(h.tasaError)).toFixed(1)}`).join(' ')
        return pts ? (
          <polyline key={i} points={pts} fill="none"
            stroke={LINEA_COLORS[i]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
        ) : null
      })}
      {/* Eje X */}
      {[0, 6, 12, 18, 23].map(h => (
        <text key={h} x={xOf(h)} y={H - 5} textAnchor="middle" fill="var(--tx-dim)" fontSize="8" fontFamily="var(--app-font)">{String(h).padStart(2,'0')}h</text>
      ))}
    </svg>
  )
}

// ── Tendencia diaria 30d ──────────────────────────────────────
function TendenciaDiariaChart({ datos }: { datos: OcrTendencias['tendenciaDiaria'] }) {
  if (!datos.length) return null
  const W = 420, H = 130, pL = 28, pR = 8, pT = 8, pB = 22
  const cW = W - pL - pR, cH = H - pT - pB
  const maxT = Math.max(...datos.map(d => Math.max(Number(d.tasaRed), Number(d.tasaMejores))), 10)
  const n = datos.length
  const xOf = (i: number) => pL + (i / Math.max(n - 1, 1)) * cW
  const yOf = (t: number) => pT + cH - Math.min(Number(t) / maxT, 1) * cH

  const ptsRed = datos.map((d, i) => `${xOf(i).toFixed(1)},${yOf(Number(d.tasaRed)).toFixed(1)}`).join(' ')
  const ptsMej = datos.filter(d => Number(d.tasaMejores) > 0)
    .map((d, _, arr) => {
      const i = datos.indexOf(d)
      return `${xOf(i).toFixed(1)},${yOf(Number(d.tasaMejores)).toFixed(1)}`
    }).join(' ')

  // Área bajo la línea roja
  const areaRed = `${pL},${yOf(0)} ${ptsRed} ${xOf(n-1)},${yOf(0)}`

  // Labels X: mostrar cada 7 días aproximadamente
  const step = Math.max(1, Math.floor(n / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {/* Grid */}
      {[0, maxT * 0.5, maxT].map((t, i) => (
        <g key={i}>
          <line x1={pL} y1={yOf(t)} x2={W - pR} y2={yOf(t)} stroke="rgb(var(--ov) / .05)" strokeWidth=".5" />
          <text x={pL - 3} y={yOf(t) + 3} textAnchor="end" fill="var(--tx-dim)" fontSize="7" fontFamily="var(--app-font)">{t.toFixed(0)}%</text>
        </g>
      ))}
      {/* Área red semitransparente */}
      <polygon points={areaRed} fill="rgba(239,75,84,.07)" />
      {/* Línea red (todos) */}
      <polyline points={ptsRed} fill="none" stroke="light-dark(#ef4b54, oklch(0.595 0.170 22))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
      {/* Línea mejores vías */}
      {ptsMej && <polyline points={ptsMej} fill="none" stroke="light-dark(#3fb978, oklch(0.564 0.159 156))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />}
      {/* Eje X (fechas) */}
      {datos.map((d, i) => i % step === 0 ? (
        <text key={i} x={xOf(i)} y={H - 5} textAnchor="middle" fill="var(--tx-dim)" fontSize="7" fontFamily="var(--app-font)">
          {d.fecha.slice(5)}
        </text>
      ) : null)}
    </svg>
  )
}

// ── Evolución diaria de una vía específica ─────────────────────
function EvolucionDiariaChart({ datos }: { datos: OcrViaEvolucion['diaria'] }) {
  if (!datos.length) return null
  const W = 640, H = 160, pL = 32, pR = 8, pT = 8, pB = 24
  const cW = W - pL - pR, cH = H - pT - pB
  const maxT = Math.max(...datos.map(d => Number(d.tasaError)), 10)
  const n = datos.length
  const xOf = (i: number) => pL + (i / Math.max(n - 1, 1)) * cW
  const yOf = (t: number) => pT + cH - Math.min(Number(t) / maxT, 1) * cH
  const ptsOf = (key: 'tasaError' | 'tasaNoDetectada' | 'tasaReconocidaError') =>
    datos.map((d, i) => `${xOf(i).toFixed(1)},${yOf(Number(d[key])).toFixed(1)}`).join(' ')
  const ptsTotal = ptsOf('tasaError')
  const ptsNoDet = ptsOf('tasaNoDetectada')
  const ptsErrRec = ptsOf('tasaReconocidaError')
  const area = `${pL},${yOf(0)} ${ptsTotal} ${xOf(n - 1)},${yOf(0)}`
  const step = Math.max(1, Math.floor(n / 8))

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        {[0, maxT * 0.5, maxT].map((t, i) => (
          <g key={i}>
            <line x1={pL} y1={yOf(t)} x2={W - pR} y2={yOf(t)} stroke="rgb(var(--ov) / .05)" strokeWidth=".5" />
            <text x={pL - 4} y={yOf(t) + 3} textAnchor="end" fill="var(--tx-dim)" fontSize="8" fontFamily="var(--app-font)">{t.toFixed(0)}%</text>
          </g>
        ))}
        <polygon points={area} fill="rgba(239,75,84,.08)" />
        <polyline points={ptsTotal}  fill="none" stroke="light-dark(#ef4b54, oklch(0.595 0.170 22))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={ptsNoDet}  fill="none" stroke="light-dark(#e0991f, oklch(0.546 0.163 74))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
        <polyline points={ptsErrRec} fill="none" stroke="light-dark(#a78bfa, oklch(0.560 0.170 294))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
        {datos.map((d, i) => i % step === 0 ? (
          <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fill="var(--tx-dim)" fontSize="8" fontFamily="var(--app-font)">{d.fecha.length > 10 ? d.fecha.slice(11, 16) : d.fecha.slice(5)}</text>
        ) : null)}
        {n <= 48 && datos.map((d, i) => (
          <circle key={`p${i}`} cx={xOf(i)} cy={yOf(Number(d.tasaError))} r={2.4} fill="light-dark(#ef4b54, oklch(0.595 0.170 22))">
            <title>{`${d.fecha} · ${d.total.toLocaleString()} tránsitos · ${Number(d.tasaError).toFixed(1)}% error (${Number(d.tasaNoDetectada).toFixed(1)}% no detectada, ${Number(d.tasaReconocidaError).toFixed(1)}% con error)`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, padding: '0 4px 4px', fontFamily: 'var(--app-font)', fontSize: 10 }}>
        <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: 'light-dark(#ef4b54, oklch(0.595 0.170 22))', display: 'inline-block' }} /> Error total
        </span>
        <span style={{ color: 'light-dark(#e0991f, oklch(0.546 0.163 74))', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: 'light-dark(#e0991f, oklch(0.546 0.163 74))', display: 'inline-block' }} /> No detectada
        </span>
        <span style={{ color: 'light-dark(#a78bfa, oklch(0.560 0.170 294))', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: 'light-dark(#a78bfa, oklch(0.560 0.170 294))', display: 'inline-block' }} /> Reconocida con error
        </span>
      </div>
    </>
  )
}

function EvolucionHoraChart({ datos }: { datos: OcrViaEvolucion['porHora'] }) {
  if (!datos.length) return <div style={{ color: 'var(--tx-muted)', fontSize: 12, textAlign: 'center' }}>Sin datos suficientes</div>
  const byHora = new Map(datos.map(d => [d.hora, d]))
  const horas = Array.from({ length: 24 }, (_, h) => byHora.get(h) ?? null)
  return (
    <div style={{ position: 'relative', height: 90 }}>
      <svg viewBox="0 0 240 70" style={{ display: 'block', width: '100%', height: 90 }}>
        {horas.map((d, i) => {
          if (!d) return null
          const barH = Math.min(Number(d.tasaError) / 50, 1) * 56
          const col = Number(d.tasaError) >= 30 ? 'light-dark(#ef4b54, oklch(0.595 0.170 22))' : Number(d.tasaError) >= 15 ? 'light-dark(#e0991f, oklch(0.546 0.163 74))' : 'light-dark(#3fb978, oklch(0.564 0.159 156))'
          return (
            <g key={i}>
              <rect x={i * 10 + 0.5} y={56 - barH} width={9} height={barH} rx="1.5" fill={col} opacity="0.75" />
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-muted)', marginTop: 2 }}>
        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  )
}

// Colores corporativos ALEATICA — mismos tonos que el muro NOC. Antes VIRU/SANTA
// tenían rosado/morado que no son parte de la paleta de marca.
const ESTACION_COLOR: Record<string, string> = {
  FORTALEZA: '#72BF44', HUARMEY: '#F99B1C',
  '402': 'light-dark(#00BBE7, oklch(0.546 0.150 223))', VIRU: 'light-dark(#FFDD00, oklch(0.456 0.170 98))', SANTA: 'light-dark(#D3DF4E, oklch(0.473 0.170 114))',
}

function RankingVias({ vias }: { vias: OcrVia[] }) {
  if (!vias.length) return null
  const maxErr = Math.max(...vias.map(v => v.noReconocidas + v.confusiones), 1)
  const mitad = Math.ceil(vias.length / 2)
  const cols = [vias.slice(0, mitad), vias.slice(mitad)]

  return (
    <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(239,75,84,.18)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '11px 18px', borderBottom: '1px solid rgba(239,75,84,.1)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: '#e88888', fontWeight: 700 }}>
          RANKING VÍAS · ERRORES OCR
        </span>
        <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-muted)' }}>
          ordenado por score de Wilson (confianza de tasa de error alta) — no por tasa cruda
        </span>
        <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-muted)', marginLeft: 'auto' }}>
          <span><span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))' }}>■</span> No reconocida</span>
          <span><span style={{ color: 'light-dark(#e0991f, oklch(0.546 0.163 74))' }}>■</span> Confusión</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ borderRight: ci === 0 ? '1px solid rgb(var(--ov) / .04)' : 'none' }}>
            {col.map((v, i) => {
              const rank       = ci * mitad + i + 1
              const errores    = v.noReconocidas + v.confusiones
              // tasa real: % de transacciones con error (0–100)
              const tasaError  = v.total > 0 ? errores / v.total * 100 : 0
              const tasaNoRec  = v.total > 0 ? v.noReconocidas / v.total * 100 : 0
              const tasaConf   = v.total > 0 ? v.confusiones   / v.total * 100 : 0
              const eColor     = ESTACION_COLOR[v.estacion] ?? 'var(--tx-muted)'
              // Umbrales de vía (sistema-visual.md): >=30 rojo intenso, >=20 rojo, >=12 ámbar, resto verde
              const errColor   = tasaError >= 30 ? '#c0392b' : tasaError >= 20 ? 'light-dark(#ef4b54, oklch(0.595 0.170 22))' : tasaError >= 12 ? 'light-dark(#e0991f, oklch(0.546 0.163 74))' : 'light-dark(#3fb978, oklch(0.564 0.159 156))'
              return (
                <div key={i} style={{ padding: '9px 16px', borderBottom: '1px solid rgb(var(--ov) / .04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, color: rank <= 3 ? 'light-dark(#ef4b54, oklch(0.595 0.170 22))' : 'var(--tx-muted)', width: 20, textAlign: 'right', fontWeight: 700 }}>#{rank}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.via}</span>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'baseline' }}>
                          <span style={{ fontSize: 10, color: eColor, fontWeight: 600 }}>{v.estacion}</span>
                          <span style={{ fontFamily: 'var(--app-font)', fontSize: 12, color: errColor, fontWeight: 700 }}>{tasaError.toFixed(1)}% err</span>
                        </div>
                      </div>

                      {/* Barra de tasa real — cada segmento = % del total de tránsitos */}
                      <div style={{ position: 'relative', height: 7, background: 'rgb(var(--ov) / .05)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                        {/* segmento no detectadas */}
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${tasaNoRec}%`, background: 'light-dark(#ef4b54, oklch(0.595 0.170 22))', opacity: .8, borderRadius: '4px 0 0 4px' }} />
                        {/* segmento confusiones (comienza donde termina el anterior) */}
                        <div style={{ position: 'absolute', left: `${tasaNoRec}%`, top: 0, height: '100%', width: `${tasaConf}%`, background: 'light-dark(#e0991f, oklch(0.546 0.163 74))', opacity: .8 }} />
                      </div>

                      <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--app-font)', fontSize: 10 }}>
                        <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))' }}>{tasaNoRec.toFixed(1)}% no det.</span>
                        <span style={{ color: 'light-dark(#e0991f, oklch(0.546 0.163 74))' }}>{tasaConf.toFixed(1)}% conf.</span>
                        <span style={{ color: 'var(--tx-muted)' }}>{v.total.toLocaleString()} tráns.</span>
                        <span style={{ marginLeft: 'auto', color: 'light-dark(#ff9ba0, oklch(0.514 0.132 17))', fontWeight: 700 }}>{Number(v.score).toFixed(1)} pts</span>
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

// Mejores vías de referencia — ranking por score de Wilson (precisión ajustada
// por volumen), no por tasa de error cruda. Respeta el período elegido arriba
// (a diferencia del panel de la pestaña Tendencias, que usa siempre 30 días).
function MejoresViasPanel({ vias }: { vias: OcrMejorViaPeriodo[] }) {
  if (!vias.length) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 13 }}>
      Sin vías con al menos 5 tránsitos en este período
    </div>
  )
  return (
    <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(63,185,120,.2)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '11px 18px', borderBottom: '1px solid rgba(63,185,120,.1)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: '#7fbf98', fontWeight: 700 }}>
          MEJORES VÍAS · REFERENCIA CONFIABLE
        </span>
        <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-dim)', marginLeft: 'auto' }}>
          score de Wilson (precisión × volumen) — una vía con pocos tránsitos no le gana a una con miles y pocas discrepancias · mín. 5 tránsitos en el período
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {vias.map((v, i) => (
          <div key={i} style={{ padding: '9px 16px', borderBottom: '1px solid rgb(var(--ov) / .04)', borderRight: '1px solid rgb(var(--ov) / .04)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, color: 'light-dark(#3fb978, oklch(0.564 0.159 156))', width: 20, textAlign: 'right', fontWeight: 700 }}>#{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.via}</span>
                <span style={{ fontSize: 10, color: ESTACION_COLOR[v.estacion] ?? 'var(--tx-muted)', fontWeight: 600, flexShrink: 0 }}>{v.estacion}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-muted)', marginTop: 4 }}>
                <span>{v.total.toLocaleString()} tráns.</span>
                <span style={{ color: 'light-dark(#3fb978, oklch(0.564 0.159 156))' }}>{Number(v.tasaError).toFixed(1)}% err</span>
                <span style={{ marginLeft: 'auto', color: 'light-dark(#2dd4a7, oklch(0.522 0.161 169))', fontWeight: 700 }}>{Number(v.score).toFixed(1)} pts</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Todas las vías del período en una sola tabla, con el score de Wilson (95 %). Se puede ordenar de
// mejor a peor (acierto mínimo seguro) o de peor a mejor (error mínimo seguro), y filtrar por estación.
// Las vías con pocos tránsitos se muestran, pero marcadas: su intervalo es ancho y el score queda bajo.
const POCOS_DATOS = 30
function TodasViasPanel({ vias, periodo, soloPrepago }: { vias: OcrTodaVia[]; periodo: string; soloPrepago: boolean }) {
  const [orden, setOrden] = useState<'mejor' | 'peor'>('mejor')
  const [estacion, setEstacion] = useState('')

  const filas = useMemo(() => {
    const base = estacion ? vias.filter(v => v.estacion === estacion) : vias
    return [...base].sort((a, b) => orden === 'mejor'
      ? b.scoreAcierto - a.scoreAcierto || b.total - a.total
      : b.scoreError - a.scoreError || b.total - a.total)
  }, [vias, orden, estacion])

  const chip = (activo: boolean): CSSProperties => ({
    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: activo ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
    color: activo ? '#e7ecf2' : 'var(--tx-muted)', background: activo ? 'rgba(80,140,200,.22)' : 'transparent',
    boxShadow: activo ? 'inset 0 0 0 1px rgba(110,170,230,.4)' : 'inset 0 0 0 1px rgb(var(--ov) / .08)',
  })
  // Descarga lo que se ve: mismo período, orden y estación (la descarga la arma el backend)
  const exportar = (formato: 'csv' | 'xlsx' | 'pdf') => {
    const q = new URLSearchParams({ formato, periodo, soloPrepago: String(soloPrepago), orden })
    if (estacion) q.set('estacion', estacion)
    window.open(`/api/ocr/todas-vias/exportar?${q}`, '_blank')
  }
  const th: CSSProperties = { padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--app-font)', fontSize: 10, letterSpacing: '.1em', color: 'var(--tx-muted)', fontWeight: 700, position: 'sticky', top: 0, background: '#0a121a', whiteSpace: 'nowrap' }
  const td: CSSProperties = { padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--tx-2)', whiteSpace: 'nowrap' }

  if (!vias.length) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 13 }}>Sin tránsitos con placa de referencia en este período</div>
  )

  return (
    <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(110,170,230,.2)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '11px 18px', borderBottom: '1px solid rgba(110,170,230,.12)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: '#8fb4dc', fontWeight: 700 }}>
          TODAS LAS VÍAS · {filas.length} {filas.length === 1 ? 'VÍA' : 'VÍAS'}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <div onClick={() => setOrden('mejor')} style={chip(orden === 'mejor')}>Mejor → peor</div>
          <div onClick={() => setOrden('peor')} style={chip(orden === 'peor')}>Peor → mejor</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ESTACIONES.map(e => (
            <div key={e || 'todas'} onClick={() => setEstacion(e)} style={chip(estacion === e)}>{e || 'Todas las estaciones'}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, letterSpacing: '.1em', color: 'var(--tx-muted)', fontWeight: 700 }}>EXPORTAR</span>
          {([['csv', 'CSV'], ['xlsx', 'Excel'], ['pdf', 'PDF']] as const).map(([f, label]) => (
            <div key={f} onClick={() => exportar(f)} title={`Descargar ${label} con el período, orden y estación actuales`}
              style={{ ...chip(false), color: 'light-dark(#8fd6a8, oklch(0.501 0.106 155))', boxShadow: 'inset 0 0 0 1px rgba(63,185,120,.4)' }}>⬇ {label}</div>
          ))}
        </div>
        <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: '#6b8196', marginLeft: 'auto', maxWidth: 560, textAlign: 'right' }}>
          Score de Wilson (95 %): lo que se puede afirmar con ese volumen. «Mejor» ordena por acierto mínimo seguro; «Peor», por error mínimo seguro.
          Con pocos tránsitos el score queda bajo aunque la tasa cruda sea perfecta.
        </span>
      </div>
      <div style={{ maxHeight: 640, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 44 }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>VÍA</th>
              <th style={{ ...th, textAlign: 'left' }}>ESTACIÓN</th>
              <th style={th}>TRÁNSITOS</th>
              <th style={th}>ACIERTOS</th>
              <th style={th}>NO LEGIBLES</th>
              <th style={th}>CONFUSIONES</th>
              <th style={{ ...th, minWidth: 190 }}>ACIERTO</th>
              <th style={{ ...th, color: orden === 'mejor' ? 'light-dark(#8fd6a8, oklch(0.501 0.106 155))' : 'var(--tx-muted)' }} title="Límite inferior de Wilson (95 %) de la tasa de acierto">ACIERTO MÍN. SEGURO</th>
              <th style={{ ...th, color: orden === 'peor' ? 'light-dark(#f0a0a0, oklch(0.519 0.105 19))' : 'var(--tx-muted)' }} title="Límite inferior de Wilson (95 %) de la tasa de error">ERROR MÍN. SEGURO</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((v, i) => {
              const poco = v.total < POCOS_DATOS
              const color = colorTasa(v.efectividad)
              return (
                <tr key={`${v.estacion}-${v.via}`} style={{ borderTop: '1px solid rgb(var(--ov) / .04)', opacity: poco ? 0.6 : 1 }}>
                  <td style={{ ...td, color: 'var(--tx-muted)', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                    {v.via}
                    {poco && <span title={`Menos de ${POCOS_DATOS} tránsitos: poca evidencia`} style={{ marginLeft: 8, fontSize: 10, color: '#c9a24a', fontWeight: 600 }}>pocos datos</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'left', color: ESTACION_COLOR[v.estacion] ?? 'var(--tx-muted)', fontWeight: 600, fontSize: 12 }}>{v.estacion}</td>
                  <td style={td}>{v.total.toLocaleString()}</td>
                  <td style={td}>{v.aciertos.toLocaleString()}</td>
                  <td style={{ ...td, color: v.noReconocidas > 0 ? 'light-dark(#ef4b54, oklch(0.595 0.170 22))' : '#5f7184' }}>{v.noReconocidas.toLocaleString()}</td>
                  <td style={{ ...td, color: v.confusiones > 0 ? 'light-dark(#e0991f, oklch(0.546 0.163 74))' : '#5f7184' }}>{v.confusiones.toLocaleString()}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ width: 90, height: 8, borderRadius: 4, background: 'rgb(var(--ov) / .07)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, v.efectividad))}%`, height: '100%', background: color }} />
                      </div>
                      <span style={{ width: 50, color, fontWeight: 700 }}>{v.efectividad.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ ...td, color: 'light-dark(#8fd6a8, oklch(0.501 0.106 155))', fontWeight: orden === 'mejor' ? 700 : 500 }}>{v.scoreAcierto.toFixed(1)}%</td>
                  <td style={{ ...td, color: 'light-dark(#f0a0a0, oklch(0.519 0.105 19))', fontWeight: orden === 'peor' ? 700 : 500 }}>{v.scoreError.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Resalta caracteres distintos entre dos placas — monoespaciada: la comparación
// carácter a carácter es el propósito de esta tabla (sistema-visual.md)
function PlacaDiff({ cajero, ocr }: { cajero: string; ocr: string }) {
  if (!ocr) return <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))', fontFamily: 'var(--app-font-mono)', fontSize: 14 }}>—</span>
  const maxLen = Math.max(cajero.length, ocr.length)
  return (
    <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: 14, letterSpacing: '.06em' }}>
      {Array.from({ length: maxLen }, (_, i) => {
        const c = cajero[i] ?? ''
        const o = ocr[i]    ?? ''
        const diff = c !== o
        return (
          <span key={i} style={{ background: diff ? 'rgba(239,75,84,.25)' : 'transparent', color: diff ? 'light-dark(#ff9ba0, oklch(0.514 0.132 17))' : 'var(--tx)', borderRadius: 3, padding: diff ? '0 2px' : 0 }}>
            {o || '·'}
          </span>
        )
      })}
    </span>
  )
}

export function OcrDashboard() {
  const [periodo,    setPeriodo]    = useState('24h')
  const [resumen,    setResumen]    = useState<OcrResumen | null>(null)
  const [analisis,   setAnalisis]   = useState<OcrAnalisis | null>(null)
  const [tendencias, setTendencias] = useState<OcrTendencias | null>(null)
  const [loadingT,   setLoadingT]   = useState(false)
  const [detalle,    setDetalle]    = useState<OcrDetalle | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [tab,        setTab]        = useState<'ranking' | 'mejores' | 'todas' | 'confusion' | 'tendencias' | 'porvia' | 'detalle'>('ranking')
  const [soloPrepago, setSoloPrepago] = useState(false)
  const [mejoresVias,    setMejoresVias]    = useState<OcrMejorViaPeriodo[] | null>(null)
  const [loadingMejores, setLoadingMejores] = useState(false)
  const [todasVias,     setTodasVias]     = useState<OcrTodaVia[] | null>(null)
  const [loadingTodas,  setLoadingTodas]  = useState(false)

  // Evolución por vía
  const [viaEstacion,  setViaEstacion]  = useState('')
  const [viaSeleccion, setViaSeleccion] = useState('')
  const [viaDias,      setViaDias]      = useState(60)
  const [viaEvolucion, setViaEvolucion] = useState<OcrViaEvolucion | null>(null)
  const [loadingVia,   setLoadingVia]   = useState(false)

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
      setResumen(await api.ocrResumen(periodo, soloPrepago))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }, [periodo, soloPrepago])

  // Análisis y tendencias: ventanas fijas (30d/7d), independientes del período — se recargan si cambia soloPrepago
  useEffect(() => {
    setAnalisis(null)
    api.ocrAnalisis(soloPrepago).then(setAnalisis).catch(() => {})
  }, [soloPrepago])

  const loadTendencias = useCallback(async () => {
    if (tendencias) return  // ya cargadas
    setLoadingT(true)
    try { setTendencias(await api.ocrTendencias(soloPrepago)) }
    catch { /* mostrar vacío */ }
    finally { setLoadingT(false) }
  }, [tendencias, soloPrepago])

  useEffect(() => { setTendencias(null) }, [soloPrepago])

  const loadDetalle = useCallback(async () => {
    const d = await api.ocrDetalle({ periodo, estacion: estacion||undefined, placa: placa||undefined, tipoError: tipoError||undefined, pagina, porPagina: 50, soloPrepago })
    setDetalle(d)
  }, [periodo, estacion, placa, tipoError, pagina, soloPrepago])

  // Mejores vías: respeta el período elegido arriba (a diferencia de tendencias, que es fijo a 30d)
  const loadMejoresVias = useCallback(async () => {
    setLoadingMejores(true)
    try { setMejoresVias(await api.ocrMejoresVias(periodo, soloPrepago)) }
    catch { setMejoresVias([]) }
    finally { setLoadingMejores(false) }
  }, [periodo, soloPrepago])

  useEffect(() => { loadResumen() }, [loadResumen])
  // Todas las vías: respeta el período y el filtro de prepago elegidos arriba
  const loadTodasVias = useCallback(async () => {
    setLoadingTodas(true)
    try { setTodasVias(await api.ocrTodasVias(periodo, soloPrepago)) }
    catch { setTodasVias([]) }
    finally { setLoadingTodas(false) }
  }, [periodo, soloPrepago])

  useEffect(() => { if (tab === 'detalle') loadDetalle() }, [tab, loadDetalle])
  useEffect(() => { if (tab === 'porvia') loadTendencias() }, [tab, loadTendencias])
  useEffect(() => { if (tab === 'mejores') loadMejoresVias() }, [tab, loadMejoresVias])
  useEffect(() => { if (tab === 'todas') loadTodasVias() }, [tab, loadTodasVias])

  // Lista de vías disponibles (con datos) por estación, sacada del heatmap ya cargado
  const viasPorEstacion = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const row of tendencias?.heatmap ?? []) {
      if (!map.has(row.estacion)) map.set(row.estacion, [])
      map.get(row.estacion)!.push(row.via)
    }
    for (const vias of map.values()) vias.sort()
    return map
  }, [tendencias])
  const estacionesConDatos = useMemo(() => Array.from(viasPorEstacion.keys()).sort(), [viasPorEstacion])

  // Preseleccionar la primera estación/vía apenas haya datos
  useEffect(() => {
    if (!viaEstacion && estacionesConDatos.length > 0) {
      const e = estacionesConDatos[0]
      setViaEstacion(e)
      setViaSeleccion(viasPorEstacion.get(e)?.[0] ?? '')
    }
  }, [estacionesConDatos, viasPorEstacion, viaEstacion])

  const loadViaEvolucion = useCallback(async () => {
    if (!viaEstacion || !viaSeleccion) return
    setLoadingVia(true)
    // viaDias = 1 significa "últimas 24 horas" (serie por hora); el resto son días
    try { setViaEvolucion(await api.ocrViaEvolucion({ estacion: viaEstacion, via: viaSeleccion, dias: viaDias === 1 ? 30 : viaDias, horas: viaDias === 1 ? 24 : 0, soloPrepago })) }
    catch { setViaEvolucion(null) }
    finally { setLoadingVia(false) }
  }, [viaEstacion, viaSeleccion, viaDias, soloPrepago])

  useEffect(() => { if (tab === 'porvia') loadViaEvolucion() }, [tab, loadViaEvolucion])

  const PERIODO_LABEL: Record<string, string> = { '1h': '1 h', '4h': '4 h', '12h': '12 h', '24h': '24 h', ayer: 'Ayer', mes: 'Mes' }

  return (
    <ScaledStage>
      <WallTopbar activo="OCR Placas" />

      {/* ── Título ─────────────────────────────────────────── */}
      <div style={{ height: 40, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em' }}>OCR · Lectura de placas</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--tx-dim)' }}>placa del cajero vs. placa de cámara · 30 días para análisis de caracteres</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div onClick={() => { setSoloPrepago(v => !v); setPagina(1) }} style={{
            padding: '8px 15px', borderRadius: 11, fontSize: 15, fontWeight: soloPrepago ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
            color: soloPrepago ? 'light-dark(oklch(0.20 0.05 62), oklch(0.966 0.035 62))' : 'var(--tx-muted)',
            background: soloPrepago ? 'linear-gradient(180deg, light-dark(oklch(0.84 0.13 68), oklch(0.488 0.143 68)), light-dark(oklch(0.76 0.13 62), oklch(0.532 0.143 62)))' : 'transparent',
          }}>Solo prepago</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 4, borderRadius: 13, background: 'rgb(var(--s1) / 0.80)', boxShadow: 'inset 0 0 0 1px rgb(var(--ov) / 0.05)' }}>
            {PERIODOS.map(p => (
              <div key={p} onClick={() => { setPeriodo(p); setPagina(1) }} style={{
                padding: '7px 15px', borderRadius: 10, fontSize: 15, fontWeight: periodo === p ? 600 : 500, cursor: 'pointer',
                color: periodo === p ? 'light-dark(oklch(0.22 0.04 62), oklch(0.959 0.028 62))' : 'var(--tx-muted)',
                background: periodo === p ? 'linear-gradient(180deg, light-dark(oklch(0.84 0.13 68), oklch(0.488 0.143 68)), light-dark(oklch(0.76 0.13 62), oklch(0.532 0.143 62)))' : 'transparent',
              }}>{PERIODO_LABEL[p] ?? p}</div>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--tx-muted)' }}>Cargando datos OCR…</div>
      ) : error ? (
        <div style={{ background: 'light-dark(oklch(0.45 0.13 22 / 0.10), oklch(0.702 0.143 22 / 0.1))', border: '1px solid light-dark(oklch(0.55 0.15 22 / 0.35), oklch(0.647 0.165 22 / 0.35))', borderRadius: 16, padding: '24px 28px' }}>
          <div style={{ color: 'light-dark(oklch(0.80 0.14 22), oklch(0.510 0.154 22))', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Error al cargar datos OCR</div>
          <pre style={{ fontFamily: 'var(--app-font)', fontSize: 13, color: 'light-dark(oklch(0.72 0.16 22), oklch(0.554 0.170 22))', whiteSpace: 'pre-wrap', margin: 0 }}>{error}</pre>
          <button onClick={loadResumen} style={{ marginTop: 16, padding: '8px 20px', background: 'light-dark(oklch(0.45 0.13 22 / 0.18), oklch(0.702 0.143 22 / 0.18))', border: '1px solid light-dark(oklch(0.55 0.15 22 / 0.40), oklch(0.647 0.165 22 / 0.4))', borderRadius: 11, color: 'light-dark(oklch(0.80 0.14 22), oklch(0.510 0.154 22))', cursor: 'pointer', fontFamily: 'var(--app-font)', fontSize: 14 }}>
            Reintentar
          </button>
        </div>
      ) : resumen && (
        <>
          {/* ── KPI ────────────────────────────────────────── */}
          <div style={{ height: 100, flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 13 }}>
            {[
              { label: 'Total con placa', val: resumen.totalConPlaca.toLocaleString('es-PE'), fg: 'var(--tx)', etFg: 'light-dark(oklch(0.62 0.02 265), oklch(0.530 0.020 265))', bg: 'linear-gradient(160deg, rgb(var(--s2) / 0.60) 0%, rgb(var(--s1) / 0.55) 100%)' },
              { label: 'Aciertos', val: resumen.aciertos.toLocaleString('es-PE'), fg: 'light-dark(oklch(0.86 0.14 160), oklch(0.477 0.154 160))', etFg: 'light-dark(oklch(0.76 0.10 160), oklch(0.532 0.110 160))', bg: 'linear-gradient(160deg, light-dark(oklch(0.36 0.10 160 / 0.45), oklch(0.909 0.070 160 / 0.45)) 0%, rgb(var(--s1) / 0.55) 100%)' },
              { label: 'No detectadas', val: resumen.sinDetectar.toLocaleString('es-PE'), fg: 'light-dark(oklch(0.84 0.14 22), oklch(0.488 0.154 22))', etFg: 'light-dark(oklch(0.80 0.10 22), oklch(0.510 0.110 22))', bg: 'linear-gradient(160deg, light-dark(oklch(0.36 0.10 20 / 0.55), oklch(0.909 0.070 20 / 0.55)) 0%, rgb(var(--s1) / 0.55) 100%)' },
              { label: 'Errores OCR', val: resumen.errores.toLocaleString('es-PE'), fg: 'light-dark(oklch(0.90 0.11 62), oklch(0.455 0.121 62))', etFg: 'light-dark(oklch(0.84 0.09 62), oklch(0.488 0.099 62))', bg: 'linear-gradient(160deg, light-dark(oklch(0.38 0.09 62 / 0.50), oklch(0.901 0.063 62 / 0.5)) 0%, rgb(var(--s1) / 0.55) 100%)' },
              { label: 'Efectividad', val: `${resumen.tasaEfectividad}%`, fg: resumen.tasaEfectividad >= 95 ? 'light-dark(oklch(0.86 0.14 160), oklch(0.477 0.154 160))' : resumen.tasaEfectividad >= 85 ? 'light-dark(oklch(0.90 0.11 62), oklch(0.455 0.121 62))' : 'light-dark(oklch(0.84 0.14 22), oklch(0.488 0.154 22))', etFg: 'light-dark(oklch(0.76 0.06 200), oklch(0.532 0.066 200))', bg: 'linear-gradient(160deg, light-dark(oklch(0.30 0.045 200 / 0.55), oklch(0.930 0.032 200 / 0.55)) 0%, rgb(var(--s1) / 0.55) 100%)' },
            ].map(k => (
              <div key={k.label} style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: k.bg, boxShadow: 'inset 0 1px 0 rgb(var(--ov) / 0.09), 0 12px 34px rgb(var(--shadow) / 0.30)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: k.etFg }}>{k.label}</div>
                <div style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: k.fg }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* ── Tabs — ranking es la primera pestaña, no un bloque fijo ── */}
          <div style={{ height: 38, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {([
              ['ranking',    'Ranking de Vías'],
              ['mejores',    'Mejores Vías'],
              ['todas',      'Todas las Vías'],
              ['confusion',  'Análisis de Caracteres'],
              ['tendencias', 'Tendencias 30d'],
              ['porvia',     'Evolución por Vía'],
              ['detalle',    'Detalle de Registros'],
            ] as const).map(([t, label]) => (
              <div key={t} onClick={() => { setTab(t); if (t === 'tendencias') loadTendencias() }} style={{
                padding: '9px 18px', borderRadius: 12, fontSize: 16, fontWeight: tab === t ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
                color: tab === t ? 'var(--tx)' : 'var(--tx-muted)',
                background: tab === t ? 'light-dark(oklch(0.32 0.04 210 / 0.70), oklch(0.923 0.028 210 / 0.7))' : 'transparent',
                boxShadow: tab === t ? 'inset 0 0 0 1px light-dark(oklch(0.70 0.09 200 / 0.32), oklch(0.565 0.099 200 / 0.32))' : 'none',
              }}>{label}</div>
            ))}
          </div>

          {tab === 'ranking' && (
            <RankingVias vias={resumen.porVia} />
          )}

          {tab === 'mejores' && (
            loadingMejores ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 13 }}>Calculando mejores vías…</div>
            ) : (
              <MejoresViasPanel vias={mejoresVias ?? []} />
            )
          )}

          {tab === 'todas' && (
            loadingTodas ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 13 }}>Calculando todas las vías…</div>
            ) : (
              <TodasViasPanel vias={todasVias ?? []} periodo={periodo} soloPrepago={soloPrepago} />
            )
          )}

          {tab === 'confusion' && analisis && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>

              {/* ── Columna izq: confusión + pares ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Matriz de confusión de caracteres */}
                <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(224,153,31,.2)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(224,153,31,.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: '#e0aa4e', fontWeight: 700 }}>
                      CONFUSIÓN DE CARACTERES · SUSTITUCIONES · ÚLTIMOS 30 DÍAS
                    </span>
                    <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: '#7d8f68' }}>solo misma longitud</span>
                  </div>

                  {analisis.topConfusiones.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'light-dark(#3fb978, oklch(0.564 0.159 156))', fontFamily: 'var(--app-font)', fontSize: 13 }}>
                      ✓ Sin sustituciones de caracteres en el período
                    </div>
                  ) : (
                    <div style={{ overflowY: 'auto', maxHeight: 360 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'rgb(var(--ov) / .03)' }}>
                            {['Pos.', 'Cajero escribió', 'OCR leyó', 'Veces', 'Visualización'].map(h => (
                              <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontFamily: 'var(--app-font)', fontSize: 10, letterSpacing: '.1em', color: 'var(--tx-muted)', fontWeight: 600, borderBottom: '1px solid rgb(var(--ov) / .05)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {analisis.topConfusiones.map((c, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgb(var(--ov) / .04)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,153,31,.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <td style={{ padding: '9px 16px', fontFamily: 'var(--app-font)', color: 'var(--tx-muted)' }}>{c.posicion}</td>
                              <td style={{ padding: '9px 16px' }}>
                                <span style={{ fontFamily: 'var(--app-font)', fontSize: 18, fontWeight: 700, color: 'light-dark(#3fb978, oklch(0.564 0.159 156))', background: 'rgba(63,185,120,.1)', padding: '2px 10px', borderRadius: 6 }}>{c.esperado}</span>
                              </td>
                              <td style={{ padding: '9px 16px' }}>
                                <span style={{ fontFamily: 'var(--app-font)', fontSize: 18, fontWeight: 700, color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))', background: 'rgba(239,75,84,.1)', padding: '2px 10px', borderRadius: 6 }}>{c.ocrLeyo}</span>
                              </td>
                              <td style={{ padding: '9px 16px', fontFamily: 'var(--app-font)', fontWeight: 700, color: 'light-dark(#e0991f, oklch(0.546 0.163 74))' }}>{c.casos}</td>
                              <td style={{ padding: '9px 16px', fontFamily: 'var(--app-font)', fontSize: 12, color: 'var(--tx-muted)' }}>
                                <span style={{ color: 'light-dark(#3fb978, oklch(0.564 0.159 156))' }}>{c.esperado}</span>
                                <span style={{ color: 'var(--tx-muted)', margin: '0 8px' }}>→</span>
                                <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))' }}>{c.ocrLeyo}</span>
                                <span style={{ color: 'var(--tx-muted)', marginLeft: 8, fontSize: 10 }}>en pos.{c.posicion}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Top pares (placa cajero → placa OCR) */}
                <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)' }}>
                    <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: 'light-dark(#8fc4b3, oklch(0.522 0.067 173))', fontWeight: 700 }}>
                      TOP PARES MÁS FRECUENTES · ERRORES OCR
                    </span>
                  </div>
                  <div style={{ overflowY: 'auto', maxHeight: 260 }}>
                    {analisis.topPares.map((p, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid rgb(var(--ov) / .04)' }}>
                        <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, color: 'rgb(var(--ov) / .2)', width: 20 }}>{i + 1}</span>
                        <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: 14, color: 'var(--tx)', letterSpacing: '.06em', minWidth: 80 }}>{p.placaCajero}</span>
                        <span style={{ color: 'var(--tx-muted)', fontSize: 12 }}>→</span>
                        <PlacaDiff cajero={p.placaCajero} ocr={p.placaOcr} />
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: colorError(p.tipoError), fontFamily: 'var(--app-font)', fontWeight: 600, flexShrink: 0 }}>
                          {p.tipoError}
                        </span>
                        <span style={{ fontFamily: 'var(--app-font)', fontSize: 13, fontWeight: 700, color: 'light-dark(#e0991f, oklch(0.546 0.163 74))', width: 36, textAlign: 'right' }}>{p.casos}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Columna der: por estación + por hora + tipos de error ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Por estación */}
                <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)' }}>
                    <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: 'light-dark(#8fc4b3, oklch(0.522 0.067 173))', fontWeight: 700 }}>EFECTIVIDAD POR ESTACIÓN</span>
                  </div>
                  <div style={{ padding: '8px 0' }}>
                    {resumen.porEstacion.map(e => (
                      <div key={e.estacion} style={{ padding: '10px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, color: 'var(--tx-2)', fontWeight: 600 }}>{e.estacion}</span>
                          <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--app-font)', fontSize: 11 }}>
                            <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))' }}>✗ {e.sinDetectar + e.errores}</span>
                            <span style={{ color: colorTasa(e.efectividad), fontWeight: 700 }}>{e.efectividad}%</span>
                          </div>
                        </div>
                        <div style={{ height: 6, background: 'rgb(var(--ov) / .05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${e.efectividad}%`, background: colorTasa(e.efectividad), borderRadius: 3, transition: 'width .4s' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 3, fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-muted)' }}>
                          <span>{e.total.toLocaleString()} tránsitos</span>
                          <span>·</span>
                          <span style={{ color: 'light-dark(#3fb978, oklch(0.564 0.159 156))' }}>{e.aciertos.toLocaleString()} OK</span>
                          <span>·</span>
                          <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))' }}>{e.sinDetectar} no detectadas</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tipos de error */}
                <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)' }}>
                    <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: 'light-dark(#8fc4b3, oklch(0.522 0.067 173))', fontWeight: 700 }}>CLASIFICACIÓN DE ERRORES</span>
                  </div>
                  <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {resumen.porTipoError.map(t => {
                      const pct = resumen.totalConPlaca > 0 ? (t.total / resumen.totalConPlaca * 100).toFixed(1) : '0'
                      return (
                        <div key={t.tipoError}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: colorError(t.tipoError), fontWeight: 600 }}>{t.tipoError}</span>
                            <span style={{ fontFamily: 'var(--app-font)', fontSize: 12, color: 'var(--tx-muted)' }}>{t.total.toLocaleString()} · <span style={{ color: colorError(t.tipoError) }}>{pct}%</span></span>
                          </div>
                          <div style={{ height: 5, background: 'rgb(var(--ov) / .05)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: colorError(t.tipoError), borderRadius: 3, opacity: .7 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Efectividad por hora (últimos 7 días) */}
                <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: 'light-dark(#8fc4b3, oklch(0.522 0.067 173))', fontWeight: 700 }}>EFECTIVIDAD POR HORA · 7 DÍAS</span>
                    <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-dim)' }}>posibles caídas de iluminación</span>
                  </div>
                  <div style={{ padding: '12px 18px' }}>
                    <HoraChart data={analisis.porHora} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'tendencias' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {loadingT ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 13 }}>
                  Calculando tendencias de 30 días…
                </div>
              ) : !tendencias ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 12 }}>Sin datos</div>
              ) : (
                <>
                  {/* ── Heatmap vía × hora ── */}
                  <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.08)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: 'light-dark(#8fc4b3, oklch(0.522 0.067 173))', fontWeight: 700 }}>
                        HEATMAP ERROR OCR · VÍA × HORA DEL DÍA · ÚLTIMOS 30 DÍAS
                      </span>
                      <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-dim)' }}>peor a mejor de arriba a abajo · hover para detalle</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--app-font)', fontSize: 10 }}>
                        {[['<10%','rgba(63,185,120,.55)'],['10-20%','rgba(224,153,31,.6)'],['20-35%','rgba(239,75,84,.55)'],['>35%','rgba(239,75,84,.88)']].map(([l,c]) => (
                          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--tx-muted)' }}>
                            <span style={{ width: 14, height: 10, borderRadius: 2, background: c as string, display: 'inline-block' }} />{l}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: '12px 18px' }}>
                      <HeatmapPanel rows={tendencias.heatmap} />
                    </div>
                  </div>

                  {/* ── Perfil horario mejores vías + Tendencia diaria ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                    {/* Perfil horario de las mejores vías */}
                    <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(63,185,120,.15)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(63,185,120,.08)' }}>
                        <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: '#7fbf98', fontWeight: 700 }}>
                          MEJORES VÍAS · REFERENCIA POR SCORE DE CONFIANZA
                        </span>
                        <div style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-dim)', marginTop: 3 }}>
                          score de Wilson (precisión ajustada por volumen) — una vía con pocos tránsitos y 0 errores no le gana a una con miles de tránsitos y pocas discrepancias · mín. 20 tránsitos
                        </div>
                      </div>
                      <div style={{ padding: '12px 18px 8px' }}>
                        <PerfilHorarioChart vias={tendencias.mejoresVias} />
                      </div>
                      {/* Leyenda */}
                      <div style={{ padding: '0 18px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {tendencias.mejoresVias.map((v, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-muted)', width: 14 }}>#{i + 1}</span>
                            <div style={{ width: 16, height: 2.5, background: LINEA_COLORS[i % LINEA_COLORS.length], borderRadius: 2, flexShrink: 0 }} />
                            <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, color: 'var(--tx-2)' }}>{v.via}</span>
                            <span style={{ fontSize: 10, color: ESTACION_COLOR[v.estacion] ?? 'var(--tx-muted)', marginLeft: 2 }}>{v.estacion}</span>
                            <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-muted)', marginLeft: 'auto' }}>{v.total.toLocaleString()} tráns.</span>
                            <span style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'light-dark(#3fb978, oklch(0.564 0.159 156))' }}>{Number(v.tasaVia).toFixed(1)}% err</span>
                            <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, fontWeight: 700, color: 'light-dark(#2dd4a7, oklch(0.522 0.161 169))', width: 46, textAlign: 'right' }}>{Number(v.score).toFixed(1)} pts</span>
                          </div>
                        ))}
                      </div>
                      {tendencias.mejoresVias.length === 0 && (
                        <div style={{ padding: '12px 18px', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 12 }}>
                          Insuficientes vías con ≥20 tránsitos en 30d
                        </div>
                      )}
                    </div>

                    {/* Tendencia diaria 30d */}
                    <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(239,75,84,.12)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(239,75,84,.08)' }}>
                        <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: 'light-dark(#c07777, oklch(0.594 0.101 20))', fontWeight: 700 }}>
                          TENDENCIA DIARIA · % ERROR RED VS REFERENCIA
                        </span>
                        <div style={{ fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-dim)', marginTop: 3 }}>
                          ¿el sistema mejora o empeora? · caídas bruscas = incidente
                        </div>
                      </div>
                      <div style={{ padding: '12px 18px 8px' }}>
                        <TendenciaDiariaChart datos={tendencias.tendenciaDiaria} />
                      </div>
                      <div style={{ padding: '0 18px 14px', display: 'flex', gap: 18 }}>
                        <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 20, height: 2, background: 'light-dark(#ef4b54, oklch(0.595 0.170 22))', borderRadius: 2 }} /> Red completa
                        </span>
                        <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, color: 'light-dark(#3fb978, oklch(0.564 0.159 156))', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 20, height: 2, background: 'light-dark(#3fb978, oklch(0.564 0.159 156))', borderRadius: 2 }} /> Mejores vías
                        </span>
                        {tendencias.tendenciaDiaria.length > 1 && (() => {
                          const first = Number(tendencias.tendenciaDiaria[0].tasaRed)
                          const last  = Number(tendencias.tendenciaDiaria[tendencias.tendenciaDiaria.length - 1].tasaRed)
                          const delta = last - first
                          return (
                            <span style={{ marginLeft: 'auto', fontFamily: 'var(--app-font)', fontSize: 11,
                              color: delta > 2 ? 'light-dark(#ef4b54, oklch(0.595 0.170 22))' : delta < -2 ? 'light-dark(#3fb978, oklch(0.564 0.159 156))' : 'var(--tx-muted)' }}>
                              {delta > 0 ? '▲' : delta < 0 ? '▼' : '→'} {Math.abs(delta).toFixed(1)}% vs hace 30d
                            </span>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'porvia' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Selector */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '14px 18px', background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12 }}>
                <select value={viaEstacion} onChange={e => { const es = e.target.value; setViaEstacion(es); setViaSeleccion(viasPorEstacion.get(es)?.[0] ?? '') }}
                  style={{ padding: '6px 12px', background: 'var(--panel-b)', border: '1px solid rgb(var(--ov) / .1)', borderRadius: 8, color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 12, cursor: 'pointer' }}>
                  {estacionesConDatos.length === 0 && <option value="">Sin datos</option>}
                  {estacionesConDatos.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <select value={viaSeleccion} onChange={e => setViaSeleccion(e.target.value)}
                  style={{ padding: '6px 12px', background: 'var(--panel-b)', border: '1px solid rgb(var(--ov) / .1)', borderRadius: 8, color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 12, cursor: 'pointer' }}>
                  {(viasPorEstacion.get(viaEstacion) ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                  {([[1, '24 h'], [7, 'Semana'], [30, '30 días'], [60, '60 días'], [90, '90 días']] as const).map(([d, etiqueta]) => (
                    <button key={d} onClick={() => setViaDias(d)}
                      style={{ padding: '6px 14px', borderRadius: 8, fontFamily: 'var(--app-font)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', borderColor: viaDias === d ? 'light-dark(#2dd4a7, oklch(0.522 0.161 169))' : 'rgb(var(--ov) / .1)', background: viaDias === d ? 'rgba(45,212,167,.12)' : 'transparent', color: viaDias === d ? 'light-dark(#2dd4a7, oklch(0.522 0.161 169))' : 'var(--tx-muted)' }}>
                      {etiqueta}
                    </button>
                  ))}
                </div>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-dim)' }}>solo vías con ≥50 tránsitos en 30d aparecen en la lista</span>
              </div>

              {loadingT || loadingVia ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 13 }}>Cargando…</div>
              ) : !viaEvolucion || viaEvolucion.diaria.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 12 }}>
                  Sin datos suficientes para esta vía en el período
                </div>
              ) : (
                <>
                  <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(239,75,84,.12)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(239,75,84,.08)' }}>
                      <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: 'light-dark(#c07777, oklch(0.594 0.101 20))', fontWeight: 700 }}>
                        {viaEvolucion.estacion} · {viaEvolucion.via} — {(viaEvolucion.horas ?? 0) > 0
                          ? `% ERROR POR HORA · ÚLTIMAS ${viaEvolucion.horas} H`
                          : viaEvolucion.dias === 7 ? '% ERROR POR DÍA · ÚLTIMA SEMANA' : `% ERROR POR DÍA · ÚLTIMOS ${viaEvolucion.dias}D`}
                      </span>
                    </div>
                    <div style={{ padding: '12px 18px 8px' }}>
                      <EvolucionDiariaChart datos={viaEvolucion.diaria} />
                    </div>
                  </div>

                  {(viaEvolucion.horas ?? 0) === 0 && (
                  <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(45,212,167,.1)' }}>
                      <span style={{ fontFamily: 'var(--app-font)', fontSize: 11, letterSpacing: '.14em', color: 'light-dark(#8fc4b3, oklch(0.522 0.067 173))', fontWeight: 700 }}>
                        PERFIL HORARIO · MISMA VÍA · {viaEvolucion.dias === 7 ? 'ÚLTIMA SEMANA' : `${viaEvolucion.dias}D`}
                      </span>
                    </div>
                    <div style={{ padding: '12px 18px' }}>
                      <EvolucionHoraChart datos={viaEvolucion.porHora} />
                    </div>
                  </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'detalle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Filtros */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 18px', background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12 }}>
                <select value={estacion} onChange={e => { setEstacion(e.target.value); setPagina(1) }}
                  style={{ padding: '6px 12px', background: 'var(--panel-b)', border: '1px solid rgb(var(--ov) / .1)', borderRadius: 8, color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 12, cursor: 'pointer' }}>
                  {ESTACIONES.map(e => <option key={e} value={e}>{e || 'Todas las estaciones'}</option>)}
                </select>
                <select value={tipoError} onChange={e => { setTipoError(e.target.value); setPagina(1) }}
                  style={{ padding: '6px 12px', background: 'var(--panel-b)', border: '1px solid rgb(var(--ov) / .1)', borderRadius: 8, color: 'var(--tx-muted)', fontFamily: 'var(--app-font)', fontSize: 12, cursor: 'pointer' }}>
                  {TIPOS_ERROR.map(t => <option key={t} value={t}>{t || 'Todos los tipos'}</option>)}
                </select>
                <input placeholder="Buscar placa…" value={placa} onChange={e => { setPlaca(e.target.value.toUpperCase()); setPagina(1) }}
                  style={{ padding: '6px 12px', background: 'var(--panel-b)', border: '1px solid rgb(var(--ov) / .1)', borderRadius: 8, color: 'var(--tx)', fontFamily: 'var(--app-font)', fontSize: 12, width: 160 }} />
                <button onClick={loadDetalle}
                  style={{ padding: '6px 18px', background: 'rgba(45,212,167,.12)', border: '1px solid rgba(45,212,167,.3)', borderRadius: 8, color: 'light-dark(#2dd4a7, oklch(0.522 0.161 169))', fontFamily: 'var(--app-font)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Buscar
                </button>
                {detalle && <span style={{ marginLeft: 'auto', fontFamily: 'var(--app-font)', fontSize: 12, color: 'var(--tx-muted)', alignSelf: 'center' }}>{detalle.total.toLocaleString()} registros</span>}
              </div>

              {/* Tabla */}
              {detalle && (
                <div style={{ background: 'linear-gradient(180deg,var(--panel-a),var(--panel-b))', border: '1px solid rgba(45,212,167,.12)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgb(var(--ov) / .03)' }}>
                        {['Fecha', 'Estación', 'Vía', 'Ticket', 'Placa Cajero', 'Placa OCR', 'Diferencia', 'Tipo Error'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: 'var(--app-font)', fontSize: 10, letterSpacing: '.1em', color: 'var(--tx-muted)', fontWeight: 600, borderBottom: '1px solid rgb(var(--ov) / .06)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.items.map((item: OcrItem, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgb(var(--ov) / .04)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgb(var(--ov) / .02)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '9px 14px', fontFamily: 'var(--app-font)', fontSize: 12, color: 'var(--tx-muted)', whiteSpace: 'nowrap' }}>{item.fecha}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--tx-muted)' }}>{item.estacion}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--tx-muted)' }}>{item.via}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'var(--app-font)', fontSize: 11, color: 'var(--tx-muted)' }}>{item.ticket}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'var(--app-font-mono)', fontSize: 14, color: 'light-dark(#3fb978, oklch(0.564 0.159 156))', letterSpacing: '.06em' }}>{item.placaCajero}</td>
                          <td style={{ padding: '9px 14px' }}><PlacaDiff cajero={item.placaCajero} ocr={item.placaOcr} /></td>
                          <td style={{ padding: '9px 14px', fontFamily: 'var(--app-font)', fontSize: 12, color: 'var(--tx-muted)' }}>
                            {item.placaOcr ? (
                              Array.from(item.placaCajero).filter((c, i) => c !== (item.placaOcr[i] ?? '')).length > 0
                                ? <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))' }}>{Array.from(item.placaCajero).filter((c, i) => c !== (item.placaOcr[i] ?? '')).length} char(s)</span>
                                : <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))' }}>±{Math.abs(item.placaCajero.length - item.placaOcr.length)} largo</span>
                            ) : <span style={{ color: 'light-dark(#ef4b54, oklch(0.595 0.170 22))' }}>no detectada</span>}
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ fontSize: 11, fontFamily: 'var(--app-font)', fontWeight: 600, color: colorError(item.tipoError), background: `${colorError(item.tipoError)}18`, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                              {item.tipoError}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Paginación */}
                  {detalle.total > 50 && (
                    <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderTop: '1px solid rgb(var(--ov) / .05)' }}>
                      {Array.from({ length: Math.min(Math.ceil(detalle.total / 50), 10) }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPagina(p)}
                          style={{ width: 32, height: 32, borderRadius: 6, fontFamily: 'var(--app-font)', fontSize: 12, cursor: 'pointer', border: '1px solid', borderColor: pagina === p ? 'light-dark(#2dd4a7, oklch(0.522 0.161 169))' : 'rgb(var(--ov) / .1)', background: pagina === p ? 'rgba(45,212,167,.12)' : 'transparent', color: pagina === p ? 'light-dark(#2dd4a7, oklch(0.522 0.161 169))' : 'var(--tx-muted)' }}>
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
    </ScaledStage>
  )
}

// Gráfico de barras efectividad por hora
function HoraChart({ data }: { data: { hora: number; total: number; efectividad: number }[] }) {
  if (!data.length) return <div style={{ color: 'var(--tx-muted)', fontSize: 12, textAlign: 'center' }}>Sin datos</div>
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
                <text x={i * 10 + 5} y={56} textAnchor="middle" fill={col} fontSize="5" fontFamily="var(--app-font)">{h.hora}</text>
              )}
            </g>
          )
        })}
        {/* 95% line */}
        <line x1="0" y1={48 * 0.05} x2="240" y2={48 * 0.05} stroke="light-dark(#3fb978, oklch(0.564 0.159 156))" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--app-font)', fontSize: 10, color: 'var(--tx-muted)', marginTop: 2 }}>
        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  )
}
