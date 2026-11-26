import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/24/outline'
import { MonitorTopbar } from '../components/MonitorTopbar'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from 'recharts'

// Vista web del reporte diario Sigma (versión clara). Mismo DTO que el correo: /api/reporte-diario.
// null = "sin dato" (nunca se muestra 0 ni se inventa un valor).

interface Punto { fecha: string; valor: number | null }
interface Tend { puntos: Punto[]; promedio: number | null }
interface Reporte {
  desde: string; hasta: string; generadoEn: string
  lecturaRapida: string[]
  indicadores: {
    discrepancia: { pct: number | null; transitos: number | null; deltaPt: number | null }
    ocr: { pct: number | null; deltaPt: number | null }
    equipos: { enLinea: number | null; total: number | null; sinRespuesta: number | null; deltaSinRespuesta: number | null }
    incidentes: { total: number; activos: number; mttrMin: number | null; deltaTotal: number | null }
    disponibilidad: { pct: number | null; deltaPt: number | null }
  }
  tendenciaDiscrepancia: Tend; tendenciaOcr: Tend
  sinResolver: { tipo: string; nombre: string; plaza: string; via: string | null; minutosSinServicio: number | null; sinDato: boolean; nota: string | null }[]
  disponibilidadPlazas: { plaza: string; pct: number | null; esMenor: boolean }[]
  eventos: { eventoComun: boolean; plaza: string; inicio: string; fin: string; duracionPorConfirmar: boolean; causa: string | null; equipos: { nombre: string; via: string | null; inicio: string; tipo: string }[] }[]
  viasCriticas: { via: string; plaza: string; pct: number; deltaPt: number | null; transitos: number; tendencia7d: Punto[] }[]
  ocr: {
    categorias: { nombre: string; pct: number | null }[]
    porPlaza: { plaza: string; pct: number | null; deltaPt: number | null }[]
    placasFrecuentes: { placa: string; via: string; plaza: string; veces: number; motivo: string | null }[]
  }
  latencia: { sitio: string; ms: number | null; superaUmbral: boolean; esActual: boolean }[]
  umbralLatenciaMs: number
}

const C = { ink: '#14211E', muted: '#5E6E69', border: '#D5E6DF', ok: '#0F7A4A', warn: '#B26A00', bad: '#C62828', marca: '#0F6F5A' }
const mono: CSSProperties = { fontFamily: "'JetBrains Mono', Consolas, monospace" }
const card: CSSProperties = { background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }

const fmt = (v: number | null | undefined, d = 2) => (v == null ? 'sin dato' : v.toFixed(d))
const dur = (min: number | null) => min == null ? 'sin dato' : min < 60 ? `${min} min` : min < 2880 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} d ${Math.floor(min % 1440 / 60)} h`
const hora = (s: string) => new Date(s).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
const fechaHora = (s: string) => new Date(s).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

function Delta({ v, unidad = ' pt', sufijo = '', subeEsMalo }: { v: number | null; unidad?: string; sufijo?: string; subeEsMalo: boolean }) {
  if (v == null) return <span style={{ color: '#8A9A95' }}>sin dato{sufijo}</span>
  if (Math.abs(v) < 0.005) return <span style={{ color: C.muted }}>= 0.0{unidad}{sufijo}</span>
  const sube = v > 0
  return <span style={{ color: sube === subeEsMalo ? C.warn : C.ok, fontWeight: 700 }}>{sube ? <ArrowUpIcon className="w-3 h-3 inline-block align-[-1px]" strokeWidth={3} /> : <ArrowDownIcon className="w-3 h-3 inline-block align-[-1px]" strokeWidth={3} />} {Math.abs(v).toFixed(1)}{unidad}{sufijo}</span>
}

function Barra({ pct, color, pista, alto = 6 }: { pct: number | null; color: string; pista: string; alto?: number }) {
  return (
    <div style={{ background: pista, borderRadius: alto, height: alto, overflow: 'hidden' }}>
      {pct != null && <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, height: '100%' }} />}
    </div>
  )
}

function Kpi({ bg, borde, label, labelColor, barra, pista, grande, unidad, sub, delta, pct }: {
  bg: string; borde: string; label: string; labelColor: string; barra: string; pista: string
  grande: string; unidad?: string; sub: string; delta: ReactNode; pct: number | null
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${borde}`, borderRadius: 14, padding: 14 }}>
      <div style={{ ...mono, fontSize: 9.5, letterSpacing: '0.12em', color: labelColor, height: 28 }}>● {label}</div>
      <div style={{ fontSize: grande === 'sin dato' ? 22 : 38, fontWeight: 300, lineHeight: 1.1, color: grande === 'sin dato' ? '#8A9A95' : C.ink }}>
        {grande}<span style={{ fontSize: 16, color: C.muted }}>{unidad}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>{sub}</div>
      <div style={{ fontSize: 11.5, margin: '4px 0 8px' }}>{delta}</div>
      <Barra pct={pct} color={barra} pista={pista} />
    </div>
  )
}

function Trend({ titulo, t, color, fill }: { titulo: string; t: Tend; color: string; fill: string }) {
  const hay = t.puntos.some(p => p.valor != null)
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 17, fontWeight: 600 }}>{titulo}</b>
        <span style={{ ...mono, fontSize: 11, color: C.muted }}>{t.promedio == null ? 'sin promedio' : `prom. ${t.promedio.toFixed(1)}%`}</span>
      </div>
      {hay ? (
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={t.puntos} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
            <YAxis hide domain={['auto', 'auto']} />
            {t.promedio != null && <ReferenceLine y={t.promedio} stroke="#96A09E" strokeDasharray="4 3" />}
            <Area type="monotone" dataKey="valor" stroke={color} strokeWidth={2.2} fill={fill} connectNulls={false} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <div style={{ ...mono, fontSize: 12, color: '#8A9A95', textAlign: 'center', padding: '44px 0' }}>sin dato</div>}
    </div>
  )
}


// Mini línea de 7 días (84×28). Los null cortan el trazo; no se interpolan.
function sparkPath(vals: (number | null)[]): string {
  const n = vals.filter((x): x is number => x != null)
  if (n.length === 0) return ''
  const min = Math.min(...n), rango = Math.max(0.01, Math.max(...n) - min)
  let d = '', corte = true
  vals.forEach((x, i) => {
    if (x == null) { corte = true; return }
    d += `${corte ? 'M' : 'L'}${(i / 6 * 80 + 2).toFixed(1)},${(26 - (x - min) / rango * 22).toFixed(1)} `
    corte = false
  })
  return d
}

const Etiqueta = ({ children }: { children: ReactNode }) =>
  <div style={{ ...mono, fontSize: 10.5, letterSpacing: '0.16em', color: C.muted, textTransform: 'uppercase', marginBottom: 12 }}>{children}</div>

export function ReporteDiario() {
  const [r, setR] = useState<Reporte | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/reporte-diario', { credentials: 'include' })
      .then(async res => { if (res.status === 401) { window.location.href = '/login'; return }
        if (!res.ok) throw new Error(await res.text()); setR(await res.json()) })
      .catch(e => setErr(String(e.message ?? e)))
  }, [])

  const shell = (c: ReactNode) => (
    <div className="page-bg" style={{ minHeight: '100vh' }}>
      <MonitorTopbar activo="Reportes" />
      <div style={{ background: '#E7F4EF', minHeight: '100vh', padding: '24px 8px', fontFamily: "Inter, 'Segoe UI', sans-serif", color: C.ink }}>
        <div style={{ width: 900, maxWidth: '100%', margin: '0 auto' }}>{c}</div>
      </div>
    </div>)

  if (err) return shell(<div style={card}>No se pudo cargar el reporte: {err}</div>)
  if (!r) return shell(<div style={card}>Generando reporte…</div>)

  const i = r.indicadores
  const maxVia = Math.max(...r.viasCriticas.map(v => v.pct), 1)
  const colCat = ['#14935B', '#E04B55', '#F0A140', '#8A9A95']
  const topeLat = Math.max(r.umbralLatenciaMs * 2, Math.max(0, ...r.latencia.map(l => l.ms ?? 0)) * 1.1)

  return shell(<>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 18px' }}>
      <div>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.32em', color: C.marca }}>SIGMA</span>
        <span style={{ ...mono, marginLeft: 18, padding: '5px 12px', border: '1px solid #BFE0D6', background: '#DDF0EA', borderRadius: 999, fontSize: 11, letterSpacing: '0.12em', color: C.marca }}>REPORTE DIARIO</span>
      </div>
      <div style={{ ...mono, fontSize: 11.5, color: C.muted, textAlign: 'right', lineHeight: 1.6 }}>
        {new Date(r.desde).toLocaleString('es-PE', { hour12: false })} → {new Date(r.hasta).toLocaleString('es-PE', { hour12: false })}<br />últimas 24 horas
      </div>
    </div>

    <div style={{ ...card, borderLeft: '4px solid #F0A140', fontSize: 14.5, lineHeight: 1.55 }}><b>Lectura rápida.</b> {r.lecturaRapida.join(' ')}</div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, margin: '14px 0' }}>
      <Kpi bg="#FDF1DD" borde="#F3DAAA" labelColor="#9A5B0B" barra="#F0A140" pista="#F4E2C4" label="DISCREPANCIA 24 H"
        grande={fmt(i.discrepancia.pct)} unidad="%" sub={i.discrepancia.transitos != null ? `${i.discrepancia.transitos.toLocaleString('en-US')} tránsitos` : 'sin dato de tránsitos'}
        delta={<Delta v={i.discrepancia.deltaPt} sufijo=" vs ayer" subeEsMalo />} pct={i.discrepancia.pct == null ? null : i.discrepancia.pct / 15 * 100} />
      <Kpi bg="#F1ECFA" borde="#DACEF1" labelColor="#6B46A8" barra="#8B5CC9" pista="#E1D7F2" label="ACIERTO OCR"
        grande={fmt(i.ocr.pct, 1)} unidad="%" sub="placas reconocidas" delta={<Delta v={i.ocr.deltaPt} sufijo=" vs ayer" subeEsMalo={false} />} pct={i.ocr.pct} />
      <Kpi bg="#E5F5EA" borde="#BDE2C9" labelColor="#0F7A4A" barra="#14935B" pista="#C9E6D4" label="EQUIPOS EN LÍNEA"
        grande={i.equipos.enLinea?.toString() ?? 'sin dato'} unidad={i.equipos.total != null ? ` de ${i.equipos.total}` : ''}
        sub={i.equipos.sinRespuesta == null ? 'sin dato' : i.equipos.sinRespuesta === 0 ? 'todos responden' : `${i.equipos.sinRespuesta} sin respuesta`}
        delta={i.equipos.deltaSinRespuesta == null ? <span style={{ color: '#8A9A95' }}>sin dato vs ayer</span>
          : <span style={{ color: i.equipos.deltaSinRespuesta > 0 ? C.bad : i.equipos.deltaSinRespuesta < 0 ? C.ok : C.muted, fontWeight: 700 }}>
              {i.equipos.deltaSinRespuesta > 0 ? <ArrowUpIcon className="w-3 h-3 inline-block align-[-1px]" strokeWidth={3} /> : i.equipos.deltaSinRespuesta < 0 ? <ArrowDownIcon className="w-3 h-3 inline-block align-[-1px]" strokeWidth={3} /> : '='} {Math.abs(i.equipos.deltaSinRespuesta)} sin respuesta vs ayer</span>}
        pct={i.equipos.enLinea != null && i.equipos.total ? i.equipos.enLinea * 100 / i.equipos.total : null} />
      <Kpi bg="#FCE8E8" borde="#F2C6C6" labelColor="#B3262F" barra="#E04B55" pista="#F2CFCF" label="INCIDENTES 7 D"
        grande={String(i.incidentes.total)} sub={`${i.incidentes.activos} ${i.incidentes.activos === 1 ? 'activo' : 'activos'} · MTTR ${i.incidentes.mttrMin == null ? 'sin dato' : `${i.incidentes.mttrMin.toFixed(0)} min`}`}
        delta={i.incidentes.deltaTotal == null ? <span style={{ color: '#8A9A95' }}>sin dato vs 7 d previos</span>
          : <span style={{ color: i.incidentes.deltaTotal > 0 ? C.bad : i.incidentes.deltaTotal < 0 ? C.ok : C.muted, fontWeight: 700 }}>
              {i.incidentes.deltaTotal > 0 ? <ArrowUpIcon className="w-3 h-3 inline-block align-[-1px]" strokeWidth={3} /> : i.incidentes.deltaTotal < 0 ? <ArrowDownIcon className="w-3 h-3 inline-block align-[-1px]" strokeWidth={3} /> : '='} {Math.abs(i.incidentes.deltaTotal)} vs 7 d previos</span>}
        pct={i.incidentes.mttrMin == null ? null : i.incidentes.mttrMin / 240 * 100} />
      <Kpi bg="#E2F3F8" borde="#BCE0EC" labelColor="#0E7490" barra="#1596B8" pista="#C5E4EE" label="DISPONIBILIDAD 30 D"
        grande={fmt(i.disponibilidad.pct)} unidad="%" sub={i.disponibilidad.pct == null ? 'sin dato' : `${(100 - i.disponibilidad.pct).toFixed(2)} pp sin conexión`}
        delta={<Delta v={i.disponibilidad.deltaPt} sufijo=" vs ayer" subeEsMalo={false} />} pct={i.disponibilidad.pct} />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
      <Trend titulo="Discrepancia · 30 días" t={r.tendenciaDiscrepancia} color="#B8650A" fill="#FDEBD0" />
      <Trend titulo="Acierto OCR · 30 días" t={r.tendenciaOcr} color="#0F8A56" fill="#E3F3E9" />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '55fr 45fr', gap: 14, marginBottom: 14 }}>
      <div style={card}>
        <Etiqueta>Equipos y servicios sin resolver</Etiqueta>
        {r.sinResolver.length === 0 ? <div style={{ color: C.ok, fontWeight: 600 }}>● Todo en línea — nada pendiente</div> :
          r.sinResolver.slice(0, 8).map((p, k) => (
            <div key={k} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: k ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ color: p.sinDato ? '#9AA5A2' : '#D64550' }}>●</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{p.nombre}</div>
                <div style={{ fontSize: 12.5, color: C.muted }}>{[p.plaza, p.via && `vía ${p.via}`, p.sinDato ? 'sin dato de monitoreo' : (p.nota ?? 'sin respuesta')].filter(Boolean).join(' · ')}</div>
              </div>
              {p.sinDato ? <span style={{ fontSize: 13, color: '#8A9A95' }}>sin dato</span>
                : <div style={{ textAlign: 'right' }}><div style={{ fontSize: 21, fontWeight: 600, color: C.bad }}>{dur(p.minutosSinServicio)}</div><div style={{ fontSize: 11.5, color: C.muted }}>sin servicio</div></div>}
            </div>))}
      </div>
      <div style={card}>
        <Etiqueta>Disponibilidad 30 d · por plaza</Etiqueta>
        {r.disponibilidadPlazas.length === 0 ? <span style={{ color: '#8A9A95' }}>sin dato</span> : <>
          <div style={{ display: 'flex', gap: 6 }}>
            {r.disponibilidadPlazas.map(p => (
              <div key={p.plaza} style={{ flex: 1, textAlign: 'center', padding: '10px 2px', borderRadius: 10, border: `1.5px solid ${p.esMenor ? '#F0A140' : C.border}`, background: p.esMenor ? '#FDF1DD' : '#fff' }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{fmt(p.pct)}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{p.plaza}</div>
              </div>))}
          </div>
          {r.disponibilidadPlazas.find(p => p.esMenor) && <div style={{ fontSize: 13, color: C.muted, marginTop: 14 }}>{r.disponibilidadPlazas.find(p => p.esMenor)!.plaza} es la plaza con menor disponibilidad del mes.</div>}
        </>}
      </div>
    </div>

    <div style={{ ...card, marginBottom: 14 }}>
      <Etiqueta>Incidentes de las últimas 24 h</Etiqueta>
      {r.eventos.length === 0 ? <div style={{ color: C.ok, fontWeight: 600 }}>● Sin incidentes en las últimas 24 h</div> :
        r.eventos.slice(0, 12).map((e, k) => (
          <div key={k} style={{ marginBottom: 8 }}>
            {e.eventoComun && <div style={{ background: '#FCE8E8', border: '1px solid #F2C6C6', borderRadius: 10, padding: '14px 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Evento común · {e.plaza} · {hora(e.inicio)}{e.fin !== e.inicio ? ` a ${hora(e.fin)}` : ''}</div>
              <div style={{ fontSize: 13.5, color: '#4A3A3A', marginTop: 4 }}>{e.equipos.length} equipos reportaron a la vez. {e.causa}.{e.duracionPorConfirmar ? ' Duración por confirmar.' : ''}</div>
            </div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {e.equipos.map((q, j) => (
                <div key={j} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between' }}>
                  <div><div style={{ fontSize: 14, fontWeight: 600 }}>{q.nombre}</div><div style={{ fontSize: 12, color: C.muted }}>{e.plaza}{q.via ? ` · vía ${q.via}` : ''} · {q.tipo}</div></div>
                  <span style={{ ...mono, fontSize: 11.5, color: C.muted }}>{fechaHora(q.inicio)}</span>
                </div>))}
            </div>
          </div>))}
    </div>

    <div style={{ ...card, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <b style={{ fontSize: 17, fontWeight: 600 }}>Vías más críticas</b><span style={{ ...mono, fontSize: 11, color: C.muted }}>cambio vs ayer · tendencia 7 días</span>
      </div>
      {r.viasCriticas.length === 0 ? <span style={{ color: '#8A9A95' }}>sin dato</span> : r.viasCriticas.map((v, k) => {
        const path = sparkPath(v.tendencia7d.map(p => p.valor))
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '24px 150px 1fr 72px 96px 90px', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted, fontWeight: 600 }}>{k + 1}</span>
            <span><b>{v.via}</b> <span style={{ color: C.muted }}>· {v.plaza}</span></span>
            <Barra pct={v.pct / maxVia * 100} color={v.pct >= 15 ? '#E04B55' : '#F0A140'} pista="#F8ECD8" alto={8} />
            <b style={{ textAlign: 'right', color: C.warn }}>{v.pct.toFixed(2)}%</b>
            <span style={{ textAlign: 'right', fontSize: 13 }}><Delta v={v.deltaPt} subeEsMalo /></span>
            <svg width="84" height="28" style={{ justifySelf: 'end' }}><path d={path} fill="none" stroke={(v.deltaPt ?? 0) > 0.005 ? '#C26A12' : (v.deltaPt ?? 0) < -0.005 ? '#0F8A56' : '#6E8A83'} strokeWidth="1.8" /></svg>
          </div>)
      })}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '42fr 58fr', gap: 14, marginBottom: 14 }}>
      <div style={card}>
        <b style={{ fontSize: 17, fontWeight: 600, display: 'block', marginBottom: 12 }}>Lectura de placas · OCR</b>
        {r.ocr.categorias.every(c => c.pct == null) ? <span style={{ color: '#8A9A95' }}>sin dato</span> : <>
          <div style={{ display: 'flex', height: 10, marginBottom: 12 }}>
            {r.ocr.categorias.map((c, k) => c.pct ? <div key={k} style={{ width: `${c.pct}%`, background: colCat[k] }} /> : null)}
          </div>
          {r.ocr.categorias.map((c, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: k ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ width: 10, height: 10, background: colCat[k] }} /><span style={{ flex: 1, fontSize: 14 }}>{c.nombre}</span><b>{c.pct == null ? 'sin dato' : `${c.pct.toFixed(1)}%`}</b>
            </div>))}
        </>}
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><b style={{ fontSize: 17, fontWeight: 600 }}>Acierto OCR por plaza</b><span style={{ ...mono, fontSize: 11, color: C.muted }}>vs ayer</span></div>
        {r.ocr.porPlaza.length === 0 ? <span style={{ color: '#8A9A95' }}>sin dato</span> : r.ocr.porPlaza.map(p => (
          <div key={p.plaza} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 52px 96px', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <b>{p.plaza}</b>
            <Barra pct={p.pct} color={p.pct == null ? '#C9D6D2' : p.pct >= 80 ? '#14935B' : p.pct >= 70 ? '#F0A140' : '#E04B55'} pista="#E9EFED" alto={8} />
            <b style={{ textAlign: 'right' }}>{p.pct == null ? 'sin dato' : `${Math.round(p.pct)}%`}</b>
            <span style={{ textAlign: 'right', fontSize: 13 }}><Delta v={p.deltaPt} subeEsMalo={false} /></span>
          </div>))}
        <div style={{ ...mono, fontSize: 10.5, letterSpacing: '0.14em', color: C.muted, margin: '16px 0 8px' }}>PLACAS NO RECONOCIDAS FRECUENTES</div>
        {r.ocr.placasFrecuentes.length === 0 ? <span style={{ fontSize: 13, color: '#8A9A95' }}>Sin placas repetidas en el período.</span> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {r.ocr.placasFrecuentes.map(p => (
              <div key={p.placa} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: '#EAF2EF', textAlign: 'center', padding: '16px 4px', ...mono, fontSize: 15, fontWeight: 700 }}>{p.placa}<div style={{ fontSize: 10.5, fontWeight: 400, color: C.muted }}>× {p.veces} veces</div></div>
                <div style={{ padding: '9px 10px' }}><div style={{ fontSize: 13, fontWeight: 700 }}>{p.via} · {p.plaza}</div><div style={{ fontSize: 12, color: C.muted }}>{p.motivo ?? 'motivo no disponible'}</div></div>
              </div>))}
          </div>}
      </div>
    </div>

    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><b style={{ fontSize: 17, fontWeight: 600 }}>Latencia por sitio</b><span style={{ ...mono, fontSize: 11, color: C.muted }}>umbral {r.umbralLatenciaMs} ms</span></div>
      {r.latencia.length === 0 ? <span style={{ color: '#8A9A95' }}>sin dato</span> : r.latencia.map(l => (
        <div key={l.sitio} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px', alignItems: 'center', gap: 14, padding: '8px 0' }}>
          <b style={{ color: l.ms == null ? '#8A9A95' : l.superaUmbral ? C.bad : C.ok }}>{l.sitio}</b>
          <div style={{ position: 'relative', height: 8, background: '#ECF0EF', borderRadius: 8 }}>
            {l.ms != null && <div style={{ width: `${Math.min(100, l.ms / topeLat * 100)}%`, height: '100%', background: l.superaUmbral ? '#E04B55' : '#14935B', borderRadius: 8 }} />}
            <div style={{ position: 'absolute', left: `${r.umbralLatenciaMs / topeLat * 100}%`, top: -3, bottom: -3, width: 2, background: C.muted }} />
          </div>
          <b style={{ textAlign: 'right', color: l.ms == null ? '#8A9A95' : C.ink }}>{l.ms == null ? 'sin dato' : `${l.ms} ms`}{l.esActual && <div style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>actual</div>}</b>
        </div>))}
    </div>

    <div style={{ ...mono, fontSize: 10.5, color: C.muted, padding: '14px 4px' }}>
      Generado {new Date(r.generadoEn).toLocaleString('es-PE', { hour12: false })} · ventana 08:00 → 08:00 (America/Lima). “sin dato” = la fuente no tiene información; no equivale a 0.
    </div>
  </>)
}
