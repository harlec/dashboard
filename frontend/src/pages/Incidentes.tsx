import { useEffect, useState, useCallback, useMemo } from 'react'
import { api, type IncidenteItem, type IncidenteResumen, type IncidenteTipo } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { FormModal, Field, Select, Input } from '../components/admin/FormModal'
import { TIPO_LABELS } from '../lib/incidentes'
import { ESTACION_COLOR } from '../lib/theme'
import { ScaledStage } from '../components/ScaledStage'
import { WallTopbar } from '../components/WallTopbar'
import { Panel } from '../components/Panel'

// Fuente de verdad visual: design_handoff_monitoreo_funcional/pantallas/Incidentes v2.dc.html

const RANGOS = [
  { key: 1,  label: 'Hoy' }, { key: 7,  label: '7 días' }, { key: 30, label: '30 días' },
] as const
const COLORS = ESTACION_COLOR
const gris = 'oklch(0.62 0.015 265)'

function dur(min?: number | null) {
  if (min == null) return 'activo'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
function fmt(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-PE', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtMinuto(iso: string) {
  return new Date(iso).toLocaleString('es-PE', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function Incidentes() {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'admin'
  const [dias,     setDias]     = useState<1 | 7 | 30>(7)
  const [resumen,  setResumen]  = useState<IncidenteResumen | null>(null)
  const [items,    setItems]    = useState<IncidenteItem[]>([])
  const [estacion, setEstacion] = useState('')
  const [solo,     setSolo]     = useState(false)

  const [selected,  setSelected]  = useState<Set<number>>(new Set())
  const [tagModal,  setTagModal]  = useState(false)
  const [tagTipo,   setTagTipo]   = useState<IncidenteTipo>('Mantenimiento')
  const [tagMotivo, setTagMotivo] = useState('')
  const [tagging,   setTagging]   = useState(false)

  const loadResumen = useCallback(async () => {
    try { setResumen(await api.incidentesResumen(dias)) } catch { /* mantiene último dato bueno */ }
  }, [dias])

  const loadLista = useCallback(async () => {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
    try {
      const r = await api.incidentes({ page: 1, pageSize: 8, soloAbiertos: solo || undefined, estacion: estacion || undefined, desde })
      setItems(r.items)
    } catch { /* mantiene último dato bueno */ }
  }, [dias, solo, estacion])

  useEffect(() => { loadResumen(); loadLista() }, [loadResumen, loadLista])
  useEffect(() => {
    const t = setInterval(() => { loadResumen(); loadLista() }, 30_000)
    return () => clearInterval(t)
  }, [loadResumen, loadLista])

  const guardarEtiqueta = async () => {
    setTagging(true)
    try {
      await api.etiquetarIncidentes(Array.from(selected), tagTipo, tagMotivo || undefined)
      setSelected(new Set()); setTagModal(false); setTagMotivo('')
      await loadLista()
    } catch (e) { console.error(e) }
    finally { setTagging(false) }
  }

  // ── Por estación ────────────────────────────────────────────
  const porEstacion = useMemo(() => {
    const est = resumen?.porEstacion ?? []
    const total = est.reduce((s, e) => s + e.total, 0) || 1
    const max = est[0]?.total ?? 1
    return est.map(e => ({
      nombre: e.estacion, n: e.total, color: COLORS[e.estacion] ?? gris,
      share: `${Math.round(e.total / total * 100)}%`,
      ancho: `${Math.round(e.total / max * 100)}%`,
    }))
  }, [resumen?.porEstacion])
  const estacionNota = porEstacion[0]
    ? `${porEstacion[0].nombre} concentra el ${porEstacion[0].share}`
    : ''

  // ── Tendencia diaria (log) ──────────────────────────────────
  const tendenciaData = useMemo(() => {
    const dat = resumen?.tendenciaAgrupada ?? []
    const max = Math.max(1, ...dat.map(d => d.total))
    const cap = Math.max(max, 10)
    const logPos = (v: number) => v <= 0 ? 0 : Math.min(100, Math.max(2, Math.round(Math.log10(v + 1) / Math.log10(cap + 1) * 100)))
    const tendencia = dat.map(d => ({
      dia: d.fecha, n: d.total.toLocaleString('es-PE'), alto: `${logPos(d.total)}%`,
      fg: d.total === max ? 'oklch(0.86 0.14 25)' : gris,
      color: d.total === max
        ? 'linear-gradient(180deg, oklch(0.72 0.18 25), oklch(0.56 0.16 22))'
        : d.total >= max * 0.1
          ? 'linear-gradient(180deg, oklch(0.80 0.13 62), oklch(0.66 0.12 62))'
          : 'linear-gradient(180deg, oklch(0.60 0.07 220), oklch(0.48 0.06 225))',
    }))
    const niveles = [cap, Math.round(cap / 10), Math.round(cap / 100) || (cap >= 10 ? 1 : 0), 0]
    const ejeY = [...new Set(niveles)].map(v => ({
      txt: v.toLocaleString('es-PE'),
      top: `${(100 - Math.log10(v + 1) / Math.log10(cap + 1) * 100).toFixed(2)}%`,
    }))
    return { tendencia, ejeY }
  }, [resumen?.tendenciaAgrupada])

  // ── Vías más afectadas ──────────────────────────────────────
  const topVias = useMemo(() => {
    const vias = (resumen?.topVias ?? []).slice(0, 10)
    const max = vias[0]?.total ?? 1
    return vias.map((v, i) => ({
      rank: `#${i + 1}`, via: v.via, est: v.estacion, n: v.total,
      rankFg: i < 3 ? 'oklch(0.72 0.16 22)' : 'oklch(0.44 0.015 265)',
      color: COLORS[v.estacion] ?? gris,
      ancho: `${Math.round(v.total / max * 100)}%`,
    }))
  }, [resumen?.topVias])

  // ── Por hora del día (ya excluye la ráfaga en el backend) ───
  const horas = useMemo(() => {
    const dat = resumen?.porHora ?? []
    const max = Math.max(1, ...dat.map(h => h.total))
    const totalSinRafaga = dat.reduce((s, h) => s + h.total, 0)
    return {
      horas: dat.map(h => ({
        txt: String(h.hora).padStart(2, '0'), fg: h.hora % 2 ? 'transparent' : 'oklch(0.48 0.015 265)',
        alto: `${Math.round(h.total / max * 100)}%`,
        color: h.total === max
          ? 'linear-gradient(180deg, oklch(0.72 0.18 25), oklch(0.56 0.16 22))'
          : h.total >= max * 0.55
            ? 'linear-gradient(180deg, oklch(0.80 0.13 62), oklch(0.66 0.12 62))'
            : 'linear-gradient(180deg, oklch(0.60 0.07 220), oklch(0.48 0.06 225))',
      })),
      nota: `${totalSinRafaga.toLocaleString('es-PE')} incidentes · excluye la ráfaga dominante`,
    }
  }, [resumen?.porHora])

  // ── Causas ───────────────────────────────────────────────────
  const causas = useMemo(() => {
    const dat = (resumen?.porCausa ?? []).slice(0, 4)
    const max = dat[0]?.total ?? 1
    return dat.map((c, i) => ({
      txt: c.causa, n: c.total.toLocaleString('es-PE'),
      fg: i === 0 ? 'oklch(0.86 0.13 22)' : 'oklch(0.72 0.015 265)',
      barra: i === 0
        ? 'linear-gradient(90deg, oklch(0.56 0.15 20), oklch(0.72 0.16 22))'
        : 'linear-gradient(90deg, oklch(0.50 0.02 265), oklch(0.62 0.02 265))',
      ancho: `${Math.round(c.total / max * 100)}%`,
    }))
  }, [resumen?.porCausa])

  const rafaga = resumen?.rafagaDominante
  const rafagaVista = rafaga ? {
    share: `${rafaga.pctDelPeriodo}%`,
    titulo: `Una sola caída de enlace el ${fmtMinuto(rafaga.minuto).slice(0, 5)} explica ${rafaga.total.toLocaleString('es-PE')} de ${(resumen?.total ?? 0).toLocaleString('es-PE')} incidentes`,
    detalle: `${fmtMinuto(rafaga.minuto).slice(-5)} · ${rafaga.estaciones} estaciones a la vez · tratar como un evento, no como ${rafaga.total} fallas`,
  } : { share: '—', titulo: 'Sin ráfagas en el período', detalle: 'ninguna caída simultánea en ≥3 estaciones' }

  return (
    <ScaledStage>
      <WallTopbar activo="Incidentes" />

      {/* ── Título ─────────────────────────────────────────── */}
      <div style={{ height: 40, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em' }}>Incidentes de red</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.56 0.015 265)' }}>caídas de equipo detectadas por el monitoreo · agrupadas por ráfaga</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 4, borderRadius: 13, background: 'oklch(0.24 0.018 262 / 0.80)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.05)' }}>
          {RANGOS.map(r => (
            <div key={r.key} onClick={() => setDias(r.key)} style={{
              padding: '7px 16px', borderRadius: 10, fontSize: 15, fontWeight: dias === r.key ? 600 : 500, cursor: 'pointer',
              color: dias === r.key ? 'oklch(0.22 0.04 62)' : 'oklch(0.64 0.015 265)',
              background: dias === r.key ? 'linear-gradient(180deg, oklch(0.84 0.13 68), oklch(0.76 0.13 62))' : 'transparent',
            }}>{r.label}</div>
          ))}
        </div>
      </div>

      {/* ── KPI ────────────────────────────────────────────── */}
      <div style={{ height: 98, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '0.85fr 0.85fr 0.85fr 2.2fr', gap: 13 }}>
        <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.36 0.10 20 / 0.55) 0%, oklch(0.22 0.03 265 / 0.55) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.80 0.10 22)' }}>En el período</div>
          <div style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.86 0.13 22)' }}>{(resumen?.total ?? 0).toLocaleString('es-PE')}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.62 0.035 22)' }}>equipos caídos en {RANGOS.find(r => r.key === dias)?.label.toLowerCase()}</div>
        </div>

        <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.38 0.09 62 / 0.50) 0%, oklch(0.22 0.03 265 / 0.55) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.80 0.14 62)', animation: 'breathe 1.8s ease-in-out infinite' }} />
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.84 0.09 62)' }}>Activos ahora</div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.90 0.12 62)' }}>{resumen?.activos ?? 0}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.64 0.035 62)' }}>sin cerrar en este momento</div>
        </div>

        <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.30 0.045 200 / 0.55) 0%, oklch(0.22 0.025 250 / 0.55) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.76 0.06 200)' }}>MTTR</div>
          <div style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.92 0.06 200)' }}>{resumen?.mttrMin != null ? dur(resumen.mttrMin) : '—'}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.60 0.03 200)' }}>promedio de recuperación</div>
        </div>

        <div style={{ boxSizing: 'border-box', borderRadius: 20, padding: '14px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.32 0.05 25 / 0.45) 0%, oklch(0.21 0.022 265 / 0.60) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.82 0.11 25)' }}>Ráfaga dominante</div>
            <div style={{ padding: '3px 10px', borderRadius: 999, fontSize: 13, fontWeight: 600, color: 'oklch(0.22 0.05 25)', background: 'oklch(0.78 0.14 25)' }}>{rafagaVista.share} del período</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', color: 'oklch(0.94 0.01 265)' }}>{rafagaVista.titulo}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.64 0.02 265)' }}>{rafagaVista.detalle}</div>
        </div>
      </div>

      {/* ── Fila 288: por estación · tendencia · vías ── */}
      <div style={{ height: 288, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.05fr', gap: 13 }}>

        <Panel style={{ padding: '15px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Por estación</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>{estacionNota}</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 8 }}>
            {porEstacion.map(e => (
              <div key={e.nombre} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: e.color }}>{e.nombre}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'oklch(0.50 0.015 265)' }}>{e.share}</span>
                    <span style={{ fontSize: 18, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{e.n}</span>
                  </div>
                </div>
                <div style={{ height: 9, borderRadius: 999, background: 'oklch(1 0 0 / 0.06)', overflow: 'hidden' }}>
                  <div style={{ width: e.ancho, height: '100%', borderRadius: 999, background: e.color }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel style={{ padding: '15px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Tendencia diaria</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>escala logarítmica · la ráfaga aplasta cualquier eje lineal</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 10 }}>
            <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: 10 }}>
              <div style={{ width: 42, flex: '0 0 auto', position: 'relative' }}>
                {tendenciaData.ejeY.map(t => (
                  <div key={t.txt} style={{ position: 'absolute', right: 0, top: t.top, transform: 'translateY(-50%)', fontSize: 13, fontWeight: 500, lineHeight: '16px', fontVariantNumeric: 'tabular-nums', color: 'oklch(0.48 0.015 265)' }}>{t.txt}</div>
                ))}
              </div>
              <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'flex-end', gap: 10, borderBottom: '1px solid oklch(1 0 0 / 0.10)' }}>
                {tendenciaData.tendencia.map((d, i) => (
                  <div key={i} style={{ flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: d.fg }}>{d.n}</div>
                    <div style={{ width: '100%', height: d.alto, borderRadius: '6px 6px 0 0', background: d.color }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height: 22, flex: '0 0 auto', display: 'flex', gap: 10, padding: '6px 0 0 52px' }}>
              {tendenciaData.tendencia.map((d, i) => (
                <div key={i} style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', textAlign: 'center', fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.50 0.015 265)' }}>{d.dia}</div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel style={{ padding: '15px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Vías más afectadas</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>top 10</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 6 }}>
            {topVias.map(v => (
              <div key={v.rank} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 26, flex: '0 0 auto', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: v.rankFg }}>{v.rank}</div>
                <div style={{ width: 44, flex: '0 0 auto', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v.via}</div>
                <div style={{ width: 74, flex: '0 0 auto', fontSize: 13, fontWeight: 600, color: v.color }}>{v.est}</div>
                <div style={{ flex: '1 1 auto', minWidth: 0, height: 8, borderRadius: 999, background: 'oklch(1 0 0 / 0.06)', overflow: 'hidden' }}>
                  <div style={{ width: v.ancho, height: '100%', borderRadius: 999, background: v.color }} />
                </div>
                <div style={{ width: 34, flex: '0 0 auto', textAlign: 'right', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.88 0.01 265)' }}>{v.n}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Fila 196: por hora · causas ── */}
      <div style={{ height: 196, flex: '0 0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 13 }}>
        <Panel style={{ padding: '15px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Por hora del día</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>{horas.nota}</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 8 }}>
            <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: 4, borderBottom: '1px solid oklch(1 0 0 / 0.10)' }}>
              {horas.horas.map((h, i) => (
                <div key={i} style={{ flex: '1 1 0', minWidth: 0, height: h.alto, borderRadius: '4px 4px 0 0', background: h.color }} />
              ))}
            </div>
            <div style={{ height: 16, flex: '0 0 auto', display: 'flex', gap: 4, paddingTop: 4 }}>
              {horas.horas.map((h, i) => (
                <div key={i} style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', textAlign: 'center', fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: h.fg }}>{h.txt}</div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel style={{ padding: '15px 22px' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Causas</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>mensaje del agente</div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', paddingTop: 6 }}>
            {causas.length === 0
              ? <div style={{ color: gris, fontSize: 13, textAlign: 'center' }}>Sin datos</div>
              : causas.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: c.fg }} title={c.txt}>{c.txt}</span>
                    <span style={{ flex: '0 0 auto', fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: c.fg }}>{c.n}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'oklch(1 0 0 / 0.06)', overflow: 'hidden' }}>
                    <div style={{ width: c.ancho, height: '100%', borderRadius: 999, background: c.barra }} />
                  </div>
                </div>
              ))}
          </div>
        </Panel>
      </div>

      {/* ── Historial ──────────────────────────────────────── */}
      <Panel style={{ flex: '1 1 auto', minHeight: 0, padding: '15px 24px' }}>
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 13 }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>Historial</div>
            <div style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.52 0.015 265)' }}>últimos primero</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select value={estacion} onChange={e => setEstacion(e.target.value)} style={{
              padding: '8px 15px', borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: 'pointer',
              color: 'oklch(0.80 0.012 265)', background: 'oklch(0.28 0.02 262 / 0.80)', border: 'none',
              boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)',
            }}>
              <option value="">Todas las estaciones</option>
              {(resumen?.porEstacion ?? []).map(e => <option key={e.estacion} value={e.estacion}>{e.estacion}</option>)}
            </select>
            <div onClick={() => setSolo(v => !v)} style={{
              padding: '8px 15px', borderRadius: 11, fontSize: 15, fontWeight: solo ? 600 : 500, cursor: 'pointer',
              color: solo ? 'oklch(0.20 0.05 62)' : 'oklch(0.66 0.015 265)',
              background: solo ? 'linear-gradient(180deg, oklch(0.86 0.13 68), oklch(0.78 0.13 62))' : 'oklch(0.26 0.02 262 / 0.80)',
              boxShadow: solo ? 'none' : 'inset 0 0 0 1px oklch(1 0 0 / 0.06)',
            }}>Solo activos</div>
            {isAdmin && (
              <div onClick={() => selected.size > 0 && setTagModal(true)} style={{
                padding: '8px 16px', borderRadius: 11, fontSize: 15, fontWeight: 600, cursor: selected.size > 0 ? 'pointer' : 'default',
                color: selected.size > 0 ? 'oklch(0.18 0.04 200)' : 'oklch(0.48 0.015 265)',
                background: selected.size > 0 ? 'linear-gradient(180deg, oklch(0.84 0.11 200), oklch(0.74 0.11 200))' : 'oklch(0.24 0.016 262 / 0.80)',
                boxShadow: selected.size > 0 ? 'none' : 'inset 0 0 0 1px oklch(1 0 0 / 0.05)',
              }}>{selected.size > 0 ? `Etiquetar seleccionados (${selected.size})` : 'Etiquetar seleccionados'}</div>
            )}
          </div>
        </div>

        <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: '34px 1.25fr 0.9fr 60px 1.15fr 1.15fr 88px 92px 2fr', gap: 12, padding: '11px 0 8px', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.50 0.015 265)', borderBottom: '1px solid oklch(1 0 0 / 0.07)' }}>
          <div /><div>Equipo</div><div>Estación</div><div>Vía</div><div>Inicio</div><div>Fin</div><div>Duración</div><div>Tipo</div><div>Causa</div>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
          {items.length === 0
            ? <div style={{ color: gris, fontSize: 14, textAlign: 'center' }}>Sin incidentes en el período</div>
            : items.map(inc => {
              const marcado = selected.has(inc.id)
              const real = inc.tipo === 'Real'
              const activo = !inc.fin
              return (
                <div key={inc.id} onClick={() => setSelected(s => {
                  const n = new Set(s); n.has(inc.id) ? n.delete(inc.id) : n.add(inc.id); return n
                })} style={{ display: 'grid', gridTemplateColumns: '34px 1.25fr 0.9fr 60px 1.15fr 1.15fr 88px 92px 2fr', gap: 12, alignItems: 'center', cursor: 'pointer', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{
                    width: 19, height: 19, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                    color: 'oklch(0.18 0.04 200)', background: marcado ? 'oklch(0.80 0.11 200)' : 'transparent',
                    boxShadow: marcado ? 'none' : 'inset 0 0 0 1px oklch(0.40 0.015 265)',
                  }}>{marcado ? '✓' : ''}</div>
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{inc.equipoNombre}</div>
                  <div style={{ fontWeight: 600, color: COLORS[inc.estacion] ?? gris }}>{inc.estacion}</div>
                  <div style={{ color: 'oklch(0.70 0.015 265)' }}>{inc.via}</div>
                  <div style={{ color: 'oklch(0.60 0.015 265)' }}>{fmt(inc.inicio)}</div>
                  <div style={{ color: 'oklch(0.60 0.015 265)' }}>{fmt(inc.fin)}</div>
                  <div style={{ fontWeight: 600, color: activo ? 'oklch(0.86 0.13 62)' : 'oklch(0.80 0.012 265)' }}>{dur(inc.duracionMin)}</div>
                  <div><span style={{
                    padding: '3px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    color: real ? 'oklch(0.86 0.13 22)' : 'oklch(0.72 0.015 265)',
                    background: real ? 'oklch(0.45 0.13 22 / 0.28)' : 'oklch(0.35 0.01 265 / 0.45)',
                  }}>{TIPO_LABELS[inc.tipo]}</span></div>
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, color: 'oklch(0.58 0.015 265)' }} title={inc.causa ?? ''}>{inc.causa ?? '—'}</div>
                </div>
              )
            })}
        </div>
      </Panel>

      <FormModal title={`Etiquetar ${selected.size} incidente(s)`}
        open={tagModal} onClose={() => setTagModal(false)} onSubmit={guardarEtiqueta} loading={tagging}>
        <Field label="Tipo">
          <Select value={tagTipo} onChange={e => setTagTipo(e.target.value as IncidenteTipo)}>
            {(Object.keys(TIPO_LABELS) as IncidenteTipo[]).map(t => (
              <option key={t} value={t}>{TIPO_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Motivo (opcional)">
          <Input value={tagMotivo} onChange={e => setTagMotivo(e.target.value)}
            placeholder="Ej: Reinicio forzado por jefe de plaza, mantenimiento programado…" />
        </Field>
      </FormModal>
    </ScaledStage>
  )
}
