import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { api, type DiscrepanciasResumen, type DiscrepanciasDetalle, type ViaConteo, type DiscrepanciasAnalisis, type ViaAnalisis } from '../api/client'

// ── Períodos ──────────────────────────────────────────────────
const PERIODOS = [
  { key: '1h',   label: 'Última hora' },
  { key: '4h',   label: 'Últimas 4h'  },
  { key: '12h',  label: 'Últimas 12h' },
  { key: '24h',  label: 'Últimas 24h' },
  { key: 'ayer', label: 'Ayer'         },
  { key: 'mes',  label: 'Mes actual'   },
] as const
type Periodo = typeof PERIODOS[number]['key']

// ── Constantes ────────────────────────────────────────────────
const ESTACIONES = ['FORTALEZA', 'HUARMEY', '402', 'VIRU', 'SANTA'] as const
const COLORS: Record<string, string> = {
  FORTALEZA: '#72BF44', HUARMEY: '#F99B1C',
  '402': '#4A9EE0', VIRU: '#E060A0', SANTA: '#9B6BE0',
}
const RANK_COLORS = ['#F04545', '#F99B1C', '#FACC15', '#4A9EE0', '#a09890']

function abbrev(cat: string): string {
  if (!cat) return '?'
  if (/liviano/i.test(cat)) return 'Liviano'
  const m = cat.match(/0*(\d+)\s*[Ee]je/)
  if (m) return `P${parseInt(m[1])}`
  return cat.slice(0, 7)
}

function efectColor(pct: number) {
  if (pct >= 95) return '#72BF44'
  if (pct >= 90) return '#F99B1C'
  return '#F04545'
}

// ── Gauge de efectividad (SVG) ────────────────────────────────
function EfectGauge({ pct }: { pct: number }) {
  const r = 38, cx = 52, cy = 48
  const circ = Math.PI * r          // semicírculo
  const arc  = Math.max(0, Math.min(1, pct / 100)) * circ
  const color = efectColor(pct)

  return (
    <svg width="104" height="62" viewBox="0 0 104 62">
      {/* track */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#252220" strokeWidth="12" strokeLinecap="round" />
      {/* arc */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${arc} ${circ}`} />
      <text x={cx} y={cy - 2} textAnchor="middle" fill={color}
        fontSize="17" fontWeight="800" fontFamily="Segoe UI,sans-serif">
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="#7a7470"
        fontSize="9" fontFamily="Segoe UI,sans-serif">EFECTIVIDAD</text>
    </svg>
  )
}

// ── Tooltips ──────────────────────────────────────────────────
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

// ── Top vías ──────────────────────────────────────────────────
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
          {vias.map((v, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="text-[0.78rem] font-extrabold w-4 text-right flex-shrink-0"
                style={{ color: RANK_COLORS[i] }}>#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[0.8rem] text-[#eae7e4] font-semibold truncate">{v.via}</span>
                  <span className="text-[0.78rem] font-bold ml-2 flex-shrink-0"
                    style={{ color: RANK_COLORS[i] }}>{v.total.toLocaleString('es-PE')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.round(v.total / max * 100)}%`, background: COLORS[v.estacion] ?? RANK_COLORS[i] }} />
                  </div>
                  <span className="text-[0.7rem] text-dim flex-shrink-0"
                    style={{ color: COLORS[v.estacion] ?? '#a09890' }}>{v.estacion}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers análisis ──────────────────────────────────────────
function tasaColor(t: number): string {
  if (t > 20) return '#F04545'
  if (t > 15) return '#F99B1C'
  if (t > 10) return '#FACC15'
  return '#a09890'
}

// ── Badge estado sensor ───────────────────────────────────────
function EstadoBadge({ estado }: { estado: ViaAnalisis['estado'] }) {
  const cfg = {
    URGENTE: { bg: 'bg-danger/15',  text: 'text-danger',  dot: '#F04545' },
    ALERTA:  { bg: 'bg-warn/15',    text: 'text-warn',    dot: '#F99B1C' },
    OK:      { bg: 'bg-brand/15',   text: 'text-brand',   dot: '#72BF44' },
  }[estado]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.72rem] font-bold ${cfg.bg} ${cfg.text}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      {estado}
    </span>
  )
}

// ── Tooltip hora ──────────────────────────────────────────────
function HoraTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-[#1e1c1a] border border-border rounded-lg px-3 py-2 text-[0.8rem]">
      <div className="text-muted mb-1">{String(label).padStart(2,'0')}:00 – {String(label).padStart(2,'0')}:59</div>
      <div className="flex flex-col gap-0.5">
        <div className="text-[#eae7e4]">Transacciones: <b>{d?.transacciones?.toLocaleString('es-PE')}</b></div>
        <div className="text-warn">Discrepancias: <b>{d?.discrepancias?.toLocaleString('es-PE')}</b></div>
        <div className="text-danger font-bold">Tasa error: {d?.tasaError}%</div>
      </div>
    </div>
  )
}

// ── Panel Análisis de Sensores ────────────────────────────────
function AnalisisSensores({ analisis, loading, error }: { analisis: DiscrepanciasAnalisis | null; loading: boolean; error: string | null }) {
  if (loading) return (
    <div className="flex items-center justify-center h-40 text-muted text-sm">Calculando análisis…</div>
  )
  if (error) return (
    <div className="px-4 py-3 bg-danger/10 border border-danger/30 rounded-xl text-[0.82rem] text-danger">
      Error al cargar análisis: <b>{error}</b>
    </div>
  )
  if (!analisis) return null

  const maxTasa = analisis.porHora.length
    ? Math.max(...analisis.porHora.map(h => h.tasaError))
    : 1

  const urgentes = analisis.prioridadMantenimiento.filter(v => v.estado === 'URGENTE').length
  const alertas  = analisis.prioridadMantenimiento.filter(v => v.estado === 'ALERTA').length
  const okCount  = analisis.prioridadMantenimiento.filter(v => v.estado === 'OK').length

  function exportarPDF() {
    if (!analisis) return
    const fecha = new Date().toLocaleDateString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    const peakHora = analisis.porHora.length
      ? analisis.porHora.reduce((a, b) => a.tasaError > b.tasaError ? a : b)
      : { hora: 0, tasaError: 0 }
    const avgTasa = analisis.porHora.length
      ? (analisis.porHora.reduce((s, h) => s + h.tasaError, 0) / analisis.porHora.length).toFixed(1)
      : '0'

    const tc = (t: number) => t > 20 ? '#dc2626' : t > 15 ? '#d97706' : t > 10 ? '#854d0e' : '#374151'

    const filas = analisis.prioridadMantenimiento.map(v => {
      const estadoColor = v.estado === 'URGENTE' ? '#dc2626' : v.estado === 'ALERTA' ? '#d97706' : '#16a34a'
      const estadoBg   = v.estado === 'URGENTE' ? '#fee2e2' : v.estado === 'ALERTA' ? '#fef3c7' : '#dcfce7'
      const deltaColor = v.delta > 0 ? '#dc2626' : v.delta < 0 ? '#16a34a' : '#6b7280'
      return `
        <tr style="border-bottom:1px solid #e5e7eb;${v.estado === 'URGENTE' ? 'background:#fff5f5' : v.estado === 'ALERTA' ? 'background:#fffbeb' : ''}">
          <td style="padding:7px 10px;font-weight:600">${v.via}</td>
          <td style="padding:7px 10px;font-weight:600">${v.estacion}</td>
          <td style="padding:7px 10px;font-family:monospace;text-align:center;color:${tc(v.tasaSem1)}">${v.tasaSem1.toFixed(1)}%</td>
          <td style="padding:7px 10px;font-family:monospace;font-weight:700;text-align:center;color:${tc(v.tasaSem2)}">${v.tasaSem2.toFixed(1)}%</td>
          <td style="padding:7px 10px;font-family:monospace;font-weight:700;text-align:center;color:${deltaColor}">${v.delta > 0 ? '+' : ''}${v.delta.toFixed(1)}%</td>
          <td style="padding:7px 10px;text-align:center">${v.totalSem2.toLocaleString('es-PE')}</td>
          <td style="padding:7px 10px"><span style="background:${estadoBg};color:${estadoColor};padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${v.estado}</span></td>
        </tr>`
    }).join('')

    const horasCells = analisis.porHora.map(h => {
      const ratio = maxTasa > 0 ? h.tasaError / maxTasa : 0
      const bg    = ratio >= 0.85 ? '#fee2e2' : ratio >= 0.65 ? '#fef3c7' : '#eff6ff'
      const col   = ratio >= 0.85 ? '#dc2626' : ratio >= 0.65 ? '#d97706' : '#1d4ed8'
      return `<div style="display:inline-block;margin:3px;padding:6px 8px;background:${bg};border-radius:6px;text-align:center;min-width:46px">
        <div style="font-size:10px;color:#6b7280">${String(h.hora).padStart(2, '0')}h</div>
        <div style="font-size:13px;font-weight:700;color:${col}">${h.tasaError}%</div>
      </div>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Análisis Sensores AUNOR — ${fecha}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#fff;padding:32px}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #F99B1C;padding-bottom:16px;margin-bottom:24px}
.logo{font-size:32px;font-weight:900;color:#F99B1C;letter-spacing:-1px;line-height:1}
.logo small{display:block;font-size:10px;color:#9ca3af;letter-spacing:3px;font-weight:400;margin-top:2px}
h1{font-size:20px;font-weight:800;color:#111827}
.sub{font-size:12px;color:#6b7280;margin-top:4px}
.kpis{display:flex;gap:12px;margin-bottom:24px}
.kpi{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center}
.kpi .val{font-size:26px;font-weight:800}
.kpi .lbl{font-size:10px;color:#6b7280;margin-top:3px;text-transform:uppercase;letter-spacing:.5px}
.sec{font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #f3f4f6}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:28px}
thead tr{background:#f9fafb}
th{padding:8px 10px;text-align:left;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb}
th.c{text-align:center}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
@media print{body{padding:16px}@page{margin:1.5cm}}
</style></head><body>
<div class="header">
  <div>
    <h1>Informe de Análisis de Sensores DAC</h1>
    <div class="sub">Red de Peajes AUNOR &mdash; ${fecha}</div>
  </div>
  <div style="text-align:right">
    <div class="logo">AUNOR<small>SISTEMA DE MONITOREO</small></div>
  </div>
</div>
<div class="kpis">
  <div class="kpi"><div class="val" style="color:#dc2626">${urgentes}</div><div class="lbl">Urgentes</div></div>
  <div class="kpi"><div class="val" style="color:#d97706">${alertas}</div><div class="lbl">Alertas</div></div>
  <div class="kpi"><div class="val" style="color:#16a34a">${okCount}</div><div class="lbl">OK</div></div>
  <div class="kpi"><div class="val" style="color:#374151">${avgTasa}%</div><div class="lbl">Error promedio / hora</div></div>
  <div class="kpi"><div class="val" style="color:#1d4ed8">${String(peakHora.hora).padStart(2,'0')}:00</div><div class="lbl">Hora pico</div></div>
</div>
<div class="sec">Prioridad de Mantenimiento &mdash; comparativa últimas 2 semanas por vía</div>
<table>
  <thead><tr>
    <th>Vía</th><th>Estación</th>
    <th class="c">Sem. anterior</th><th class="c">Sem. actual</th>
    <th class="c">Δ variación</th><th class="c">Discr. 7d</th><th>Estado</th>
  </tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="sec">Tasa de Error por Hora del Día &mdash; últimos 7 días</div>
<div style="font-size:12px;color:#6b7280;margin-bottom:10px">
  Pico: <strong>${String(peakHora.hora).padStart(2,'0')}:00</strong> con <strong>${peakHora.tasaError}%</strong>
  ${peakHora.hora >= 20 || peakHora.hora <= 6 ? '&mdash; Revisar iluminación y sensores OCR nocturnos' : '&mdash; Revisar calibración por volumen de tráfico'}
</div>
<div style="margin-bottom:24px">${horasCells}</div>
<div class="footer">
  <span>Dashboard AUNOR v2 &mdash; Módulo Discrepancias DAC</span>
  <span>Generado: ${new Date().toLocaleString('es-PE')}</span>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  return (
    <div className="grid grid-cols-[1.6fr_1fr] gap-3.5">

      {/* ── Tabla prioridad mantenimiento ── */}
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[0.85rem] font-bold text-[#eae7e4]">Prioridad de mantenimiento</div>
          <span className="text-[0.72rem] text-muted">últimas 2 semanas por vía</span>
          <div className="ml-auto flex gap-2 items-center">
            {urgentes > 0 && (
              <span className="bg-danger/15 text-danger text-[0.72rem] font-bold px-2 py-0.5 rounded-full">
                {urgentes} URGENTE{urgentes > 1 ? 'S' : ''}
              </span>
            )}
            {alertas > 0 && (
              <span className="bg-warn/15 text-warn text-[0.72rem] font-bold px-2 py-0.5 rounded-full">
                {alertas} ALERTA{alertas > 1 ? 'S' : ''}
              </span>
            )}
            <button onClick={exportarPDF}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#4A9EE0]/10 hover:bg-[#4A9EE0]/20
                border border-[#4A9EE0]/30 text-[#4A9EE0] text-[0.75rem] font-semibold
                rounded-lg transition-all whitespace-nowrap">
              ⬇ Exportar PDF
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.79rem] border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Vía', 'Estación', 'Sem. anterior', 'Sem. actual', 'Δ variación', 'Discr. 7d', 'Estado'].map(h => (
                  <th key={h} className="text-left py-2 px-2 text-muted font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analisis.prioridadMantenimiento.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted">Sin datos suficientes</td></tr>
              ) : analisis.prioridadMantenimiento.map((v, i) => (
                <tr key={i} className={`border-b border-border/40 hover:bg-white/[0.02] transition-colors ${
                  v.estado === 'URGENTE' ? 'bg-danger/[0.04]' :
                  v.estado === 'ALERTA'  ? 'bg-warn/[0.03]' : ''}`}>
                  <td className="py-1.5 px-2 text-[#eae7e4] font-semibold whitespace-nowrap">{v.via}</td>
                  <td className="py-1.5 px-2">
                    <span className="font-semibold" style={{ color: COLORS[v.estacion] ?? '#a09890' }}>
                      {v.estacion}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-muted font-mono">{v.tasaSem1.toFixed(1)}%</td>
                  <td className="py-1.5 px-2 font-mono font-bold" style={{
                    color: v.tasaSem2 > 20 ? '#F04545' : v.tasaSem2 > 15 ? '#F99B1C' : '#d4cec9'
                  }}>
                    {v.tasaSem2.toFixed(1)}%
                  </td>
                  <td className="py-1.5 px-2 font-mono font-bold">
                    <span className={v.delta > 0 ? 'text-danger' : v.delta < 0 ? 'text-brand' : 'text-muted'}>
                      {v.delta > 0 ? '+' : ''}{v.delta.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-dim">{v.totalSem2.toLocaleString('es-PE')}</td>
                  <td className="py-1.5 px-2"><EstadoBadge estado={v.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tasa de error por hora ── */}
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="text-[0.85rem] font-bold text-[#eae7e4]">Tasa error por hora del día</div>
          <span className="text-[0.72rem] text-muted">últimos 7 días</span>
        </div>
        <div className="text-[0.72rem] text-muted mb-3">
          Picos nocturnos → falla OCR por iluminación · Picos diurnos → volumen o calibración
        </div>
        {analisis.porHora.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted text-sm">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analisis.porHora} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <XAxis dataKey="hora" tick={{ fill: '#a09890', fontSize: 10 }}
                tickLine={false} axisLine={false}
                tickFormatter={h => `${String(h).padStart(2,'0')}h`} />
              <YAxis tick={{ fill: '#a09890', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v}%`} domain={[0, Math.ceil(maxTasa * 1.15)]} />
              <Tooltip content={<HoraTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="tasaError" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {analisis.porHora.map((h, i) => (
                  <Cell key={i}
                    fill={h.tasaError >= maxTasa * 0.85 ? '#F04545' :
                          h.tasaError >= maxTasa * 0.65 ? '#F99B1C' : '#4A9EE0'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        {analisis.porHora.length > 0 && (() => {
          const peakHora = analisis.porHora.reduce((a, b) => a.tasaError > b.tasaError ? a : b)
          const isNocturno = peakHora.hora >= 20 || peakHora.hora <= 6
          return (
            <div className={`mt-2 px-3 py-2 rounded-lg text-[0.75rem] ${
              isNocturno ? 'bg-warn/10 text-warn' : 'bg-[#4A9EE0]/10 text-[#4A9EE0]'}`}>
              Pico máximo: <b>{String(peakHora.hora).padStart(2,'0')}:00</b> con <b>{peakHora.tasaError}%</b> de error
              {isNocturno ? ' — revisar iluminación y sensores OCR nocturnos' : ' — revisar calibración por volumen de tráfico'}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export function Discrepancias() {
  const [periodo, setPeriodo]       = useState<Periodo>('12h')
  const [resumen, setResumen]       = useState<DiscrepanciasResumen | null>(null)
  const [detalle, setDetalle]       = useState<DiscrepanciasDetalle | null>(null)
  const [detalleError, setDetalleError] = useState(false)
  const [estacion, setEstacion]     = useState('')
  const [placaInput, setPlacaInput] = useState('')
  const [placa, setPlaca]           = useState('')
  const [pagina, setPagina]         = useState(1)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [signal, setSignal]         = useState<'idle' | 'ok' | 'error'>('idle')
  const [loadingR, setLoadingR]     = useState(false)
  const [loadingD, setLoadingD]     = useState(false)
  const [analisis, setAnalisis]     = useState<DiscrepanciasAnalisis | null>(null)
  const [loadingA, setLoadingA]     = useState(false)
  const [errorA, setErrorA]         = useState<string | null>(null)
  const [showAnalisis, setShowAnalisis] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadResumen = useCallback(async () => {
    setLoadingR(true)
    try {
      setResumen(await api.discrepanciasResumen(periodo))
      setLastUpdate(new Date())
      setSignal('ok')
    } catch { setSignal('error') }
    finally { setLoadingR(false) }
  }, [periodo])

  const loadDetalle = useCallback(async () => {
    setLoadingD(true)
    setDetalleError(false)
    try {
      setDetalle(await api.discrepanciasDetalle({
        periodo,
        estacion: estacion || undefined,
        placa: placa || undefined,
        pagina, porPagina: 50,
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
      total: p.total, desde: p.desde, hasta: p.hasta,
    })).reverse(),
  [resumen?.topPares])

  const loadAnalisis = useCallback(async () => {
    setLoadingA(true)
    setErrorA(null)
    try { setAnalisis(await api.discrepanciasAnalisis()) }
    catch (e: any) { setErrorA(e?.message ?? 'Error al cargar análisis') }
    finally { setLoadingA(false) }
  }, [])

  const toggleAnalisis = () => {
    const next = !showAnalisis
    setShowAnalisis(next)
    if (next) loadAnalisis()
  }

  const totalPaginas = detalle ? Math.ceil(detalle.total / detalle.porPagina) : 1
  const ef = resumen?.efectividad ?? null

  return (
    <div className="px-5 py-4 pb-10">

      {/* ── Topbar ─────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl px-6 py-4 mb-3.5">
        {/* Fila 1: título + signal */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[1.05rem] font-extrabold text-[#eae7e4]">Discrepancias DAC</div>
            <div className="text-[0.75rem] text-muted">
              Actualizado: <b className="text-[#d4cec9]">{lastUpdate.toLocaleTimeString('es-PE')}</b>
              {' · '}refresco cada 60s
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-[0.75rem] text-white/70
            bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              signal === 'ok' ? 'bg-brand animate-ping-pulse' :
              signal === 'error' ? 'bg-danger' : 'bg-[#a09890]'}`} />
            <span>{signal === 'ok' ? 'En vivo' : signal === 'error' ? 'Sin conexión' : 'En espera'}</span>
          </div>
        </div>

        {/* Fila 2: tabs + KPIs */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Tabs de período */}
          <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5 flex-wrap">
            {PERIODOS.map(({ key, label }) => (
              <button key={key} onClick={() => { setPeriodo(key); setPagina(1) }}
                className={`px-3 py-1 rounded-md text-[0.78rem] font-semibold transition-all whitespace-nowrap ${
                  periodo === key
                    ? 'bg-warn text-[#0f0d0c]'
                    : 'text-white/50 hover:text-white/80'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Separador */}
          <div className="w-px h-10 bg-border hidden sm:block" />

          {/* Gauge efectividad */}
          <div className="flex flex-col items-center">
            {ef !== null
              ? <EfectGauge pct={ef} />
              : <div className="text-muted text-sm">—</div>
            }
          </div>

          {/* Separador */}
          <div className="w-px h-10 bg-border hidden sm:block" />

          {/* Totales */}
          <div className="flex gap-5">
            <div className="flex flex-col items-center">
              <span className="text-[1.8rem] font-extrabold text-warn leading-none">
                {resumen?.total?.toLocaleString('es-PE') ?? '—'}
              </span>
              <span className="text-[0.68rem] text-muted uppercase tracking-wide">discrepancias</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[1.8rem] font-extrabold text-[#d4cec9] leading-none">
                {resumen?.totalTransacciones?.toLocaleString('es-PE') ?? '—'}
              </span>
              <span className="text-[0.68rem] text-muted uppercase tracking-wide">transacciones</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pills por estación ─────────────────────────────── */}
      {resumen && (
        <div className="flex gap-2 mb-3.5 flex-wrap">
          {resumen.porEstacion.map(e => (
            <button key={e.estacion}
              onClick={() => { setEstacion(est => est === e.estacion ? '' : e.estacion); setPagina(1) }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[0.82rem] font-semibold
                border transition-all ${
                estacion === e.estacion
                  ? 'border-transparent text-[#0f0d0c]'
                  : 'border-border text-[#eae7e4] bg-surface hover:bg-surface-2'}`}
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

      {/* ── Gráficas ───────────────────────────────────────── */}
      <div className="grid grid-cols-[2fr_3fr_1.6fr] gap-3.5 mb-3.5">

        {/* Top confusiones */}
        <div className="bg-surface rounded-xl p-4">
          <div className="text-[0.85rem] font-bold text-[#eae7e4] mb-3">Top confusiones</div>
          {loadingR ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">Cargando…</div>
          ) : paresData.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, paresData.length * 26)}>
              <BarChart data={paresData} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fill: '#a09890', fontSize: 11 }} tickLine={false} axisLine={false} />
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

        {/* Tendencia */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[0.85rem] font-bold text-[#eae7e4]">Tendencia por estación</div>
            <div className="text-[0.72rem] text-muted">
              {periodo === '1h' ? 'cada 10 min' : periodo === '4h' ? 'cada 20 min' :
               periodo === '12h' ? 'cada 30 min' : periodo === 'mes' ? 'por día' : 'por hora'}
            </div>
          </div>
          {loadingR ? (
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
        <TopViasPanel vias={resumen?.topVias ?? []} loading={loadingR} />
      </div>

      {/* ── Análisis de sensores ───────────────────────────── */}
      <div className="mb-3.5">
        <button onClick={toggleAnalisis}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[0.82rem] font-semibold
            border transition-all ${showAnalisis
              ? 'bg-[#4A9EE0]/15 border-[#4A9EE0]/40 text-[#4A9EE0]'
              : 'bg-surface border-border text-white/60 hover:text-white hover:border-white/20'}`}>
          <span>{showAnalisis ? '▼' : '▶'}</span>
          Análisis de sensores
          {analisis && (() => {
            const urgentes = analisis.prioridadMantenimiento.filter(v => v.estado === 'URGENTE').length
            const alertas  = analisis.prioridadMantenimiento.filter(v => v.estado === 'ALERTA').length
            return urgentes + alertas > 0 ? (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[0.68rem] font-bold bg-danger/20 text-danger">
                {urgentes + alertas} vías
              </span>
            ) : null
          })()}
          <span className="text-[0.72rem] text-muted ml-1">últimas 2 semanas · 7 días</span>
        </button>
        {showAnalisis && (
          <div className="mt-3">
            <AnalisisSensores analisis={analisis} loading={loadingA} error={errorA} />
          </div>
        )}
      </div>

      {/* ── Tabla de detalle ───────────────────────────────── */}
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[0.85rem] font-bold text-[#eae7e4]">Detalle</div>
          <span className="text-[0.78rem] text-muted">
            {detalle ? `${detalle.total.toLocaleString('es-PE')} registros` : ''}
          </span>
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
                  text-white/60 hover:text-white hover:bg-surface-3">🔍</button>
              {placa && (
                <button type="button" onClick={() => { setPlacaInput(''); setPlaca(''); setPagina(1) }}
                  className="px-2 py-1.5 text-[0.78rem] text-white/40 hover:text-white/70">✕</button>
              )}
            </form>
          </div>
        </div>

        {detalleError && (
          <div className="mb-3 px-3 py-2 bg-danger/10 border border-danger/30 rounded-lg text-[0.82rem] text-danger">
            Error al cargar el detalle. Verifica la conexión con la BD consolidado.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[0.8rem] border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Fecha', 'Estación', 'VIA', 'Ticket', 'Tabulada', 'Detectada',
                  'Placa Tab.', 'Placa Det.', 'Cobrador'].map(h => (
                  <th key={h} className="text-left py-2 px-2.5 text-muted font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingD ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted">Cargando…</td></tr>
              ) : (detalle?.items ?? []).length === 0 && !detalleError ? (
                <tr><td colSpan={9} className="py-8 text-center text-muted">Sin discrepancias en el período</td></tr>
              ) : (detalle?.items ?? []).map((item, i) => {
                const placaDiff = !!item.placaTabulada && !!item.placaDetectada
                  && item.placaTabulada !== item.placaDetectada
                return (
                  <tr key={i} className="border-b border-border/40 hover:bg-white/[0.02] transition-colors">
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
                      placaDiff ? 'text-danger font-bold' : 'text-muted'}`}>
                      {item.placaDetectada || '—'}
                    </td>
                    <td className="py-1.5 px-2.5 text-dim">{item.cobrador}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

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
