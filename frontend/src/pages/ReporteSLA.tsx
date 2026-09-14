import { useEffect, useMemo, useState } from 'react'
import { api, type SlaEquipo, type SlaEstacion, type MotivoDowntime } from '../api/client'
import { ESTACION_COLOR } from '../lib/theme'
import { ScaledStage } from '../components/ScaledStage'
import { WallTopbar } from '../components/WallTopbar'
import { Panel } from '../components/Panel'

// Fuente de verdad visual: design_handoff_monitoreo_funcional/pantallas/Reporte SLA v2.dc.html

const COLORS = ESTACION_COLOR
const META = 99.5
const gris = 'oklch(0.62 0.015 265)'

function barraPct(p: number) { return Math.max(0, Math.min(100, (p - 90) / 10 * 100)) }
function fgPct(p: number) { return p >= META ? 'oklch(0.86 0.11 160)' : p >= 97 ? 'oklch(0.88 0.12 62)' : 'oklch(0.84 0.14 22)' }
function barraColor(p: number) {
  return p >= META
    ? 'linear-gradient(90deg, oklch(0.60 0.12 165), oklch(0.78 0.13 160))'
    : p >= 97
      ? 'linear-gradient(90deg, oklch(0.68 0.12 70), oklch(0.82 0.13 62))'
      : 'linear-gradient(90deg, oklch(0.56 0.15 20), oklch(0.72 0.16 22))'
}
function dur(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`
}
function fechaHace(dias: number) {
  const d = new Date(); d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}
function hastaEfectiva(hasta: string) {
  const hastaDate = new Date(hasta + 'T00:00:00')
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return hastaDate >= hoy ? new Date().toISOString() : `${hasta}T23:59:59`
}

const ORDENES = ['Peores primero', 'Por peaje', 'Por tipo'] as const
type Orden = typeof ORDENES[number]

export function ReporteSLA() {
  const [desde, setDesde] = useState(() => fechaHace(30))
  const [hasta, setHasta] = useState(() => fechaHace(0))
  const [estacionId, setEstacionId] = useState<number | ''>('')
  const [orden, setOrden] = useState<Orden>('Peores primero')

  const [rows,        setRows]        = useState<SlaEquipo[]>([])
  const [porEstacion, setPorEstacion] = useState<SlaEstacion[]>([])
  const [motivos,     setMotivos]     = useState<MotivoDowntime[]>([])

  const load = () => {
    const params = { desde, hasta: hastaEfectiva(hasta), estacionId: estacionId || undefined }
    api.sla(params).then(setRows).catch(() => {})
    api.slaPorEstacion(params).then(setPorEstacion).catch(() => {})
    api.slaMotivos(params).then(setMotivos).catch(() => {})
  }
  useEffect(load, []) // eslint-disable-line
  useEffect(load, [estacionId]) // eslint-disable-line

  const estaciones = useMemo(() => porEstacion.map(e => ({
    nombre: e.estacion, color: COLORS[e.estacion] ?? gris,
    pct: `${e.uptimePct.toFixed(2)}%`, pctFg: fgPct(e.uptimePct),
    barra: `${barraPct(e.uptimePct)}%`, barraColor: barraColor(e.uptimePct),
    nota: `${e.total} equipos · ${e.uptimePct >= META ? 'cumple' : `${(META - e.uptimePct).toFixed(2)} pp bajo meta`}`,
  })), [porEstacion])

  const global = useMemo(() => {
    const totalMin = rows.reduce((s, r) => s + r.totalMin, 0)
    const downMin  = rows.reduce((s, r) => s + r.downMin, 0)
    const pct = totalMin > 0 ? 100 - downMin / totalMin * 100 : 100
    return {
      pct: `${pct.toFixed(2)}%`,
      brecha: `meta ${META}% · faltan ${Math.max(0, META - pct).toFixed(2)} pp · ${rows.length} equipos`,
      barra: `${barraPct(pct)}%`,
    }
  }, [rows])

  const incumplen = useMemo(() => {
    const bajo = rows.filter(r => r.uptimePct < META).sort((a, b) => a.uptimePct - b.uptimePct).slice(0, 6)
    const peor = 100 - (bajo[0]?.uptimePct ?? 100)
    return bajo.map(r => ({
      equipo: r.nombre, est: r.estacion, color: COLORS[r.estacion] ?? gris,
      pct: `${r.uptimePct.toFixed(1)}%`, caido: dur(r.downMin),
      ancho: `${peor > 0 ? Math.round((100 - r.uptimePct) / peor * 100) : 100}%`,
    }))
  }, [rows])
  const incumpleNota = `${rows.filter(r => r.uptimePct < META).length} de ${rows.length} bajo ${META}%`

  const tipos = useMemo(() => {
    const map = new Map<string, { totalMin: number; downMin: number; n: number }>()
    for (const r of rows) {
      const e = map.get(r.tipoNombre) ?? { totalMin: 0, downMin: 0, n: 0 }
      e.totalMin += r.totalMin; e.downMin += r.downMin; e.n++
      map.set(r.tipoNombre, e)
    }
    return Array.from(map, ([nombre, e]) => {
      const pct = e.totalMin > 0 ? 100 - e.downMin / e.totalMin * 100 : 100
      return { nombre, n: `${e.n} equipos`, pct: `${pct.toFixed(1)}%`, fg: fgPct(pct), ancho: `${barraPct(pct)}%`, barra: barraColor(pct), _pct: pct }
    }).sort((a, b) => a._pct - b._pct)
  }, [rows])

  const motivosVista = useMemo(() => {
    const max = motivos[0]?.minutos ?? 1
    return motivos.slice(0, 4).map(m => ({
      nombre: m.causa, horas: dur(m.minutos),
      fg: m === motivos[0] ? 'oklch(0.86 0.13 22)' : 'oklch(0.70 0.015 265)',
      barra: m === motivos[0]
        ? 'linear-gradient(90deg, oklch(0.56 0.15 20), oklch(0.72 0.16 22))'
        : 'linear-gradient(90deg, oklch(0.42 0.015 265), oklch(0.56 0.015 265))',
      share: `${m.pct}%`, ancho: `${Math.round(m.minutos / max * 100)}%`,
    }))
  }, [motivos])
  const motivoNota = `${dur(motivos.reduce((s, m) => s + m.minutos, 0))} acumuladas`
  const motivoInsight = motivos[0]
    ? `El ${motivos[0].pct}% del tiempo caído registrado es "${motivos[0].causa}". El uptime de arriba ya excluye mantenimiento/reinicio forzado por defecto — el toggle de la página lo vuelve a sumar si necesitas esa cifra.`
    : 'Sin caídas registradas en el período.'

  const filas = useMemo(() => {
    const cmp: Record<Orden, (a: SlaEquipo, b: SlaEquipo) => number> = {
      'Peores primero': (a, b) => a.uptimePct - b.uptimePct,
      'Por peaje': (a, b) => a.estacion.localeCompare(b.estacion) || a.uptimePct - b.uptimePct,
      'Por tipo': (a, b) => a.tipoNombre.localeCompare(b.tipoNombre) || a.uptimePct - b.uptimePct,
    }
    return [...rows].sort(cmp[orden]).slice(0, 9).map(r => ({
      est: r.estacion, estFg: COLORS[r.estacion] ?? gris, equipo: r.nombre, tipo: r.tipoNombre, via: r.via,
      pct: `${r.uptimePct.toFixed(2)}%`, pctFg: fgPct(r.uptimePct), ancho: `${barraPct(r.uptimePct)}%`, barra: barraColor(r.uptimePct),
      caido: dur(r.downMin), caidoFg: r.uptimePct >= META ? gris : 'oklch(0.84 0.13 22)',
      eventos: r.eventos, motivo: r.motivos ?? '—',
    }))
  }, [rows, orden])

  const csvUrl = `/api/reporte/sla/csv?${new URLSearchParams({ desde, hasta: hastaEfectiva(hasta), ...(estacionId ? { estacionId: String(estacionId) } : {}) })}`

  return (
    <ScaledStage>
      <WallTopbar activo="Reporte SLA" />

      {/* ── Título ─────────────────────────────────────────── */}
      <div style={{ height: 40, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em' }}>Reporte SLA</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.56 0.015 265)' }}>
            disponibilidad por equipo · {new Date(desde).toLocaleDateString('es-PE')} – {new Date(hasta).toLocaleDateString('es-PE')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 15px', borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: 'pointer', color: 'oklch(0.82 0.012 265)', background: 'oklch(0.28 0.02 262 / 0.80)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.54 0.015 265)' }}>Desde</span>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 15 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 15px', borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: 'pointer', color: 'oklch(0.82 0.012 265)', background: 'oklch(0.28 0.02 262 / 0.80)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.54 0.015 265)' }}>Hasta</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 15 }} />
          </label>
          <select value={estacionId} onChange={e => setEstacionId(e.target.value ? Number(e.target.value) : '')} style={{ padding: '9px 15px', borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: 'pointer', color: 'oklch(0.82 0.012 265)', background: 'oklch(0.28 0.02 262 / 0.80)', border: 'none', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)' }}>
            <option value="">Todos los peajes</option>
            {porEstacion.map(e => <option key={e.estacionId} value={e.estacionId}>{e.estacion}</option>)}
          </select>
          <div onClick={load} style={{ padding: '8px 18px', borderRadius: 11, fontSize: 15, fontWeight: 600, cursor: 'pointer', color: 'oklch(0.18 0.04 200)', background: 'linear-gradient(180deg, oklch(0.84 0.11 200), oklch(0.74 0.11 200))' }}>Consultar</div>
        </div>
      </div>

      {/* ── KPI ────────────────────────────────────────────── */}
      <div style={{ height: 106, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1.45fr repeat(5, 1fr)', gap: 13 }}>
        <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.38 0.09 62 / 0.50) 0%, oklch(0.22 0.03 265 / 0.55) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.84 0.09 62)' }}>Uptime global</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.90 0.11 62)' }}>{global.pct}</div>
            <div style={{ fontSize: 17, fontWeight: 400, color: 'oklch(0.68 0.05 62)' }}>{global.brecha}</div>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'oklch(1 0 0 / 0.08)', overflow: 'hidden' }}>
            <div style={{ width: global.barra, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, oklch(0.74 0.13 85), oklch(0.84 0.13 62))' }} />
          </div>
        </div>

        {estaciones.map(e => (
          <div key={e.nombre} style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / 0.92) 0%, oklch(0.185 0.016 262 / 0.92) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.02em', color: e.color }}>{e.nombre}</div>
            <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: e.pctFg }}>{e.pct}</div>
            <div style={{ height: 5, borderRadius: 999, background: 'oklch(1 0 0 / 0.07)', overflow: 'hidden' }}>
              <div style={{ width: e.barra, height: '100%', borderRadius: 999, background: e.barraColor }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.54 0.015 265)' }}>{e.nota}</div>
          </div>
        ))}
      </div>

      {/* ── Fila 236 ── */}
      <div style={{ height: 236, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1.25fr 1fr 1.15fr', gap: 13 }}>

        <Panel style={{ padding: '15px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Equipos fuera de SLA</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>{incumpleNota}</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 6 }}>
            {incumplen.length === 0
              ? <div style={{ color: gris, fontSize: 14, textAlign: 'center' }}>Todos dentro de SLA</div>
              : incumplen.map(i => (
                <div key={i.equipo} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 132, flex: '0 0 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 600 }}>{i.equipo}</div>
                  <div style={{ width: 78, flex: '0 0 auto', fontSize: 13, fontWeight: 600, color: i.color }}>{i.est}</div>
                  <div style={{ flex: '1 1 auto', minWidth: 0, height: 9, borderRadius: 999, background: 'oklch(1 0 0 / 0.06)', overflow: 'hidden' }}>
                    <div style={{ width: i.ancho, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, oklch(0.56 0.15 20), oklch(0.72 0.16 22))' }} />
                  </div>
                  <div style={{ width: 66, flex: '0 0 auto', textAlign: 'right', fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.58 0.015 265)' }}>{i.caido}</div>
                  <div style={{ width: 62, flex: '0 0 auto', textAlign: 'right', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.84 0.13 22)' }}>{i.pct}</div>
                </div>
              ))}
          </div>
        </Panel>

        <Panel style={{ padding: '15px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Por tipo de equipo</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>uptime medio</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 6 }}>
            {tipos.map(t => (
              <div key={t.nombre} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.84 0.01 265)' }}>{t.nombre}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'oklch(0.50 0.015 265)' }}>{t.n}</span>
                    <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: t.fg }}>{t.pct}</span>
                  </div>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'oklch(1 0 0 / 0.06)', overflow: 'hidden' }}>
                  <div style={{ width: t.ancho, height: '100%', borderRadius: 999, background: t.barra }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel style={{ padding: '15px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>A qué se fue el tiempo caído</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>{motivoNota}</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 6 }}>
            {motivosVista.map(m => (
              <div key={m.nombre} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 500, color: m.fg }} title={m.nombre}>{m.nombre}</span>
                  <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'oklch(0.50 0.015 265)' }}>{m.share}</span>
                    <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: m.fg }}>{m.horas}</span>
                  </div>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'oklch(1 0 0 / 0.06)', overflow: 'hidden' }}>
                  <div style={{ width: m.ancho, height: '100%', borderRadius: 999, background: m.barra }} />
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 11, fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: 'oklch(0.80 0.06 200)', background: 'oklch(0.32 0.04 210 / 0.45)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.06)' }}>{motivoInsight}</div>
          </div>
        </Panel>
      </div>

      {/* ── Detalle por equipo ─────────────────────────────── */}
      <Panel style={{ flex: '1 1 auto', minHeight: 0, padding: '15px 24px' }}>
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 13 }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Detalle por equipo</div>
            <div style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.52 0.015 265)' }}>{rows.length} equipos · {orden.toLowerCase()}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {ORDENES.map(o => (
              <div key={o} onClick={() => setOrden(o)} style={{
                padding: '7px 15px', borderRadius: 11, fontSize: 15, fontWeight: orden === o ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
                color: orden === o ? 'oklch(0.95 0.01 265)' : 'oklch(0.62 0.015 265)',
                background: orden === o ? 'oklch(0.32 0.04 210 / 0.70)' : 'transparent',
                boxShadow: orden === o ? 'inset 0 0 0 1px oklch(0.70 0.09 200 / 0.32)' : 'none',
              }}>{o}</div>
            ))}
            <a href={csvUrl} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', borderRadius: 11, fontSize: 15, fontWeight: 600, cursor: 'pointer', color: 'oklch(0.90 0.10 160)', background: 'oklch(0.38 0.08 165 / 0.40)', boxShadow: 'inset 0 0 0 1px oklch(0.65 0.10 165 / 0.30)' }}>Descargar CSV</a>
          </div>
        </div>

        <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: '0.85fr 1.15fr 1fr 60px 1.35fr 80px 88px 1.6fr', gap: 12, padding: '11px 0 8px', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.50 0.015 265)', borderBottom: '1px solid oklch(1 0 0 / 0.07)' }}>
          <div>Peaje</div><div>Equipo</div><div>Tipo</div><div>Vía</div><div>Uptime</div><div>Caído</div><div>Eventos</div><div>Motivo principal</div>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
          {filas.length === 0
            ? <div style={{ color: gris, fontSize: 14, textAlign: 'center' }}>Sin datos</div>
            : filas.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr 1fr 60px 1.35fr 80px 88px 1.6fr', gap: 12, alignItems: 'center', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontWeight: 600, color: f.estFg }}>{f.est}</div>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{f.equipo}</div>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'oklch(0.64 0.015 265)' }}>{f.tipo}</div>
                <div style={{ color: 'oklch(0.70 0.015 265)' }}>{f.via}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: '1 1 auto', minWidth: 0, height: 7, borderRadius: 999, background: 'oklch(1 0 0 / 0.06)', overflow: 'hidden' }}>
                    <div style={{ width: f.ancho, height: '100%', borderRadius: 999, background: f.barra }} />
                  </div>
                  <span style={{ flex: '0 0 auto', width: 62, textAlign: 'right', fontWeight: 600, color: f.pctFg }}>{f.pct}</span>
                </div>
                <div style={{ textAlign: 'right', fontWeight: 500, color: f.caidoFg }}>{f.caido}</div>
                <div style={{ textAlign: 'right', color: 'oklch(0.60 0.015 265)' }}>{f.eventos}</div>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, color: 'oklch(0.58 0.015 265)' }} title={f.motivo}>{f.motivo}</div>
              </div>
            ))}
        </div>
      </Panel>
    </ScaledStage>
  )
}
