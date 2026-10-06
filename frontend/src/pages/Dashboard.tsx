import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { WallTopbar } from '../components/WallTopbar'
import {
  api,
  type ViaConteo, type IncidenteItem, type ServicioLive,
  type IncidenteResumen, type OcrVia,
  type SlaEstacion, type HoraAnalisis, type TransitosMes,
} from '../api/client'
import { useLiveDashboard } from '../hooks/useLiveDashboard'
import { useAlertSound } from '../hooks/useAlertSound'
import { SigmaTopologia } from '../components/SigmaTopologia'
import { SEMAFORO, TEXTO, PANEL, estacionColor } from '../lib/theme'
import { severidadDac, UMBRAL_DAC, UMBRAL_DAC_VIGILANCIA } from '../lib/dac'

// Fuente de verdad visual: design_handoff_sigma/SIGMA - Tablero NOC.dc.html — layout,
// tipografía y el patrón de "relleno rayado" vienen de ahí. Los colores de estado
// (verde/ámbar/rojo/info) y el color por estación vienen del sistema visual ya
// compartido por el resto de la app (lib/theme.ts) en vez de inventar una tercera
// paleta — así este tablero convive con NOC/Discrepancias/OCR/SLA sin desentonar.
// Los datos son reales (mismos endpoints que Muro NOC, Discrepancias, OCR, SLA e
// Incidentes); el simulador del prototipo no se portó.

// Meta de coincidencia DAC (discrepancias). Es SOLO de discrepancias: la disponibilidad
// de conexión (incidentes de comunicación) no tiene meta, se compara contra el 100%.
const META = 99.5
const LILA = 'oklch(0.68 0.12 305)'

// Paleta mutable: el estilo HUD (Admin → Configuración) la pasa a un solo tono
// verde azulado de SIGMA; el rojo de falla se mantiene para que lo crítico destaque.
// Naranja/rojo del Panel SIGMA v2 en lugar de los del semáforo compartido (que no se toca)
const BASE_SEM = { ...SEMAFORO, warn: PANEL.naranja, critico: PANEL.rojo, lila: LILA }
const SEM: Record<string, string> = { ...BASE_SEM }
const EST_HUD = 'oklch(0.80 0.10 190)'
let hudActivo = false
function aplicarPaleta(hud: boolean) {
  hudActivo = hud
  Object.assign(SEM, hud
    ? { ok: 'oklch(0.82 0.11 190)', warn: PANEL.naranja, critico: PANEL.rojo, info: 'oklch(0.74 0.10 195)', lila: 'oklch(0.66 0.09 195)' }
    : { ...BASE_SEM })
}
const estColor = (nombre: string) => hudActivo ? EST_HUD : estacionColor(nombre)
const HudCtx = createContext(false)
const ORDEN_ESTACIONES = ['Fortaleza', 'Huarmey', 'KM 402', 'Santa', 'Viru']

// La severidad de las vías (lib/dac.ts) usa el límite inferior del intervalo de Wilson,
// igual que Muro NOC y la alerta horaria por correo — una vía con pocos tránsitos no alarma.

function fmtDur(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Escala el lienzo fijo de 1920×1080 al ancho real de la ventana — mismo
// mecanismo que Muro NOC (NocMuro.tsx): llena la pantalla de borde a borde en
// modo kiosco/pantalla completa (16:9) en vez de dejar franjas vacías. ──
function useEscalaTablero(boardW: number) {
  const [escala, setEscala] = useState(() => window.innerWidth / boardW)
  useEffect(() => {
    const calcular = () => setEscala(window.innerWidth / boardW)
    calcular()
    window.addEventListener('resize', calcular)
    return () => window.removeEventListener('resize', calcular)
  }, [boardW])
  return escala
}

// ── Reloj HH:MM ──
function useReloj() {
  const [reloj, setReloj] = useState('--:--')
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      setReloj(`${p(d.getHours())}:${p(d.getMinutes())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return reloj
}

// ── Destello del "flash" al llegar un dato nuevo (Interacciones A del handoff):
// aplica el glow y lo quita 160ms después, para que la transición de 1.1s lo
// desvanezca — así se re-dispara en cada actualización, no solo la primera vez.
function useFlash(value: number | string | null | undefined): boolean {
  const prevRef = useRef(value)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (value == null) return
    if (prevRef.current !== value && prevRef.current !== undefined) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 160)
      prevRef.current = value
      return () => clearTimeout(t)
    }
    prevRef.current = value
  }, [value])
  return flash
}

// ── Delta desde la lectura anterior — para el chip de las tarjetas KPI ──
function useDelta(value: number | null | undefined): number | null {
  const prevRef = useRef<number | null | undefined>(undefined)
  const [delta, setDelta] = useState<number | null>(null)
  useEffect(() => {
    if (value == null) return
    if (prevRef.current != null && prevRef.current !== value) setDelta(value - prevRef.current)
    prevRef.current = value
  }, [value])
  return delta
}

function DeltaChip({ delta, dec = 1, bueno }: { delta: number | null; dec?: number; bueno: (d: number) => boolean }) {
  if (delta == null || Math.abs(delta) < 10 ** -dec / 2) return (
    <span style={{ fontSize: 14, fontWeight: 600, color: TEXTO.terciario }}>estable</span>
  )
  const ok = bueno(delta)
  return (
    <span style={{ fontSize: 14, fontWeight: 600, color: ok ? SEM.ok : PANEL.rojo }}>
      {delta > 0 ? '▲ ' : '▼ '}{Math.abs(delta).toFixed(dec)}
    </span>
  )
}

// ── Relleno de barras: color sólido (Panel SIGMA v2). Los helpers conservan el nombre y la
// firma de cuando eran rayados para no tocar cada barra. ──
function stripedImage(color: string): string {
  return `linear-gradient(${color}, ${color})`
}
// Para un track+fill anidados (fill hijo de un BarTrack) — el fill ocupa el 100% del alto/ancho del track.
function stripedFill(pct: number, color: string): CSSProperties {
  const clamped = Math.max(0, Math.min(100, pct))
  return { width: `${clamped}%`, height: '100%', backgroundImage: stripedImage(color), transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)' }
}

function BarTrack({ children, height = 16, radius = 8, border }: { children: ReactNode; height?: number; radius?: number; border?: string }) {
  return (
    <div style={{
      position: 'relative', height, borderRadius: radius, overflow: 'hidden', flex: 1,
      boxShadow: `inset 0 0 0 1px ${border ?? 'oklch(0.34 0.03 190)'}`, boxSizing: 'border-box', padding: 3,
    }}>
      {children}
    </div>
  )
}

function PeriodChip({ label }: { label: string }) {
  const hud = useContext(HudCtx)
  return (
    <span style={{
      padding: '4px 12px', borderRadius: 8, fontSize: 15, fontWeight: 500,
      color: hud ? 'oklch(0.88 0.09 192)' : 'oklch(0.86 0.10 75)', background: hud ? 'oklch(0.29 0.05 192)' : 'oklch(0.29 0.045 75)', boxShadow: hud ? 'inset 0 0 0 1px oklch(0.46 0.08 192)' : 'inset 0 0 0 1px oklch(0.44 0.06 75)',
    }}>{label}</span>
  )
}

// Hay imagen de fondo (Admin → Configuración) → las tarjetas pasan a "vidrio"
const FondoCtx = createContext(false)

// Esquinas luminosas cian de las tarjetas de vidrio
function Esquinas({ r = 22 }: { r?: number }) {
  const c = 'oklch(0.80 0.12 195)'
  const base: CSSProperties = { position: 'absolute', width: 22, height: 22, pointerEvents: 'none', filter: 'drop-shadow(0 0 6px oklch(0.80 0.12 195 / 0.7))' }
  return (
    <>
      <div style={{ ...base, top: 0, left: 0, borderTop: `2px solid ${c}`, borderLeft: `2px solid ${c}`, borderTopLeftRadius: r }} />
      <div style={{ ...base, bottom: 0, right: 0, borderBottom: `2px solid ${c}`, borderRight: `2px solid ${c}`, borderBottomRightRadius: r }} />
    </>
  )
}

function Card({ children, style, id, foco, onFocus }: { children: ReactNode; style?: CSSProperties; id: string; foco: string | null; onFocus: (id: string) => void }) {
  const activo = foco === id
  const atenuado = foco != null && foco !== id
  const vidrio = useContext(FondoCtx)
  const hud = useContext(HudCtx)
  return (
    <div onClick={() => onFocus(id)} style={{
      position: 'relative',
      boxSizing: 'border-box', borderRadius: hud ? 10 : 22, padding: '18px 22px',
      background: vidrio
        ? 'linear-gradient(170deg, oklch(0.250 0.030 190 / 0.62) 0%, oklch(0.170 0.024 190 / 0.52) 100%)'
        : 'linear-gradient(170deg, oklch(0.250 0.030 190) 0%, oklch(0.185 0.024 190) 100%)',
      backdropFilter: vidrio ? 'blur(14px) saturate(1.25)' : undefined,
      boxShadow: hud
        ? 'inset 0 0 0 1px oklch(0.70 0.10 190 / 0.38), inset 0 0 40px oklch(0.50 0.08 190 / 0.10), 0 18px 44px oklch(0.05 0.02 190 / 0.5)'
        : vidrio
        ? 'inset 0 0 0 1px oklch(0.70 0.08 195 / 0.30), inset 0 1px 0 oklch(1 0 0 / 0.10), 0 18px 44px oklch(0.05 0.02 190 / 0.5)'
        : `inset 0 0 0 1px oklch(0.340 0.030 190), 0 18px 44px oklch(0.09 0.02 190 / 0.55)`,
      outline: activo ? '2px solid oklch(0.760 0.090 200)' : '2px solid transparent', outlineOffset: -1,
      opacity: atenuado ? 0.34 : 1, transition: 'opacity 0.5s ease, outline-color 0.5s ease',
      display: 'flex', flexDirection: 'column', minHeight: 0, cursor: 'pointer', overflow: 'hidden',
      ...style,
    }}>
      {(vidrio || hud) && <Esquinas r={hud ? 10 : 22} />}
      {children}
    </div>
  )
}

function CardHeader({ title, right }: { title: string; right?: ReactNode }) {
  const hud = useContext(HudCtx)
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: '0 0 auto' }}>
      <div style={{ fontSize: hud ? 17 : 19, fontWeight: hud ? 600 : 500, letterSpacing: hud ? '0.14em' : undefined, textTransform: hud ? 'uppercase' : undefined, color: hud ? 'oklch(0.86 0.09 192)' : undefined }}>{hud && <span style={{ display: 'inline-block', width: 6, height: 16, marginRight: 10, verticalAlign: -2, background: 'oklch(0.80 0.11 192)' }} />}{title}</div>
      {right}
    </div>
  )
}

// ── KPI wall — 5 tarjetas, misma geometría, cada una enfoca una sección al hacer clic ──
interface KpiSpec {
  id: string; eyebrow: string; figura: string; sufijo?: string; nota: string; barPct: number
  accent: string; fg: string; nota_fg: string; grad: string; borde: string
  delta: number | null; dec: number; bueno: (d: number) => boolean
  marca?: number   // posición (0-100) de una marca vertical sobre la barra, p. ej. la meta
}
function KpiCard({ k, foco, onFocus }: { k: KpiSpec; foco: string | null; onFocus: (id: string) => void }) {
  const flash = useFlash(k.figura)
  const hud = useContext(HudCtx)
  const atenuado = foco != null && foco !== k.id
  return (
    <div onClick={() => onFocus(k.id)} style={{
      position: 'relative', boxSizing: 'border-box', height: 112, overflow: 'hidden', borderRadius: hud ? 10 : 18, padding: '10px 16px 10px', cursor: 'pointer',
      background: k.grad, boxShadow: `inset 0 0 0 1px ${k.borde}, 0 16px 38px oklch(0.06 0.02 190 / 0.5)`,
      outline: foco === k.id ? '2px solid oklch(0.760 0.090 200)' : '2px solid transparent', outlineOffset: -1,
      opacity: atenuado ? 0.34 : 1, transition: 'opacity 0.5s ease, outline-color 0.5s ease',
    }}>
      {hud && <Esquinas r={10} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: k.accent, flex: '0 0 auto' }} />
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase', color: k.accent }}>{k.eyebrow}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
        <div style={{
          fontSize: 34, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: k.fg,
          textShadow: flash ? `0 0 22px ${k.accent}` : '0 0 0 transparent', transition: 'text-shadow 1.1s ease-out',
        }}>{k.figura}</div>
        {k.sufijo && <div style={{ fontSize: 14, fontWeight: 500, color: 'oklch(0.780 0.020 190)' }}>{k.sufijo}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, minHeight: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: k.nota_fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.nota}</div>
        <DeltaChip delta={k.delta} dec={k.dec} bueno={k.bueno} />
      </div>
      <div style={{ position: 'relative', height: 14, borderRadius: 7, marginTop: 6, boxShadow: `inset 0 0 0 1px ${k.borde}`, padding: 3, boxSizing: 'border-box', overflow: 'hidden' }}>
        <div style={stripedFill(k.barPct, k.accent)} />
        {k.marca != null && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${k.marca}%`, width: 2, background: TEXTO.primario, opacity: 0.85 }} />}
      </div>
    </div>
  )
}

// ── Barra apilada + leyenda: reparte un universo en segmentos (OCR y forma de cobro) ──
interface Segmento { nombre: string; n: number; color: string }
function BarraApilada({ segmentos, total, sinConteo = false }: { segmentos: Segmento[]; total: number; sinConteo?: boolean }) {
  const hud = useContext(HudCtx)
  return (
    <>
      <div style={{ display: 'flex', height: 20, borderRadius: 8, overflow: 'hidden', gap: 2, boxShadow: `inset 0 0 0 1px ${hud ? 'oklch(0.46 0.07 190)' : 'oklch(0.460 0.035 190)'}`, padding: 3, boxSizing: 'border-box' }}>
        {segmentos.map(sg => (
          <div key={sg.nombre} title={`${sg.nombre}: ${sg.n.toLocaleString('es-PE')}`} style={{
            width: `${total > 0 ? sg.n / total * 100 : 0}%`, backgroundImage: stripedImage(sg.color), borderRadius: 3,
            transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
          }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 14px', marginTop: 8 }}>
        {segmentos.map(sg => (
          <div key={sg.nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ width: 6, height: 16, borderRadius: 3, background: sg.color, flex: '0 0 auto' }} />
            <div style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sg.nombre}</div>
            {!sinConteo && <div style={{ fontSize: 13, fontWeight: 500, color: TEXTO.terciario, fontVariantNumeric: 'tabular-nums' }}>{sg.n.toLocaleString('es-PE')}</div>}
            <div style={{ width: 50, textAlign: 'right', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? (sg.n / total * 100).toFixed(1) : '0.0'}%</div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Alertas vivas del pie: solo lo que está pasando AHORA (equipos sin respuesta y vías con
// discrepancia en la última hora). Lo acumulado o histórico (mes, 30 días) no entra al feed. ──
interface AlertaFeed { sev: 'critico' | 'warn' | 'info'; tag: 'RED' | 'DAC' | 'TOP DAC' | 'TOP OCR'; texto: string }

export function Dashboard() {
  const escala = useEscalaTablero(1920)
  const { playDown, playUp } = useAlertSound()
  const [fondo, setFondo] = useState('')
  const [hud, setHud] = useState(false)
  const [oscuridad, setOscuridad] = useState(62)
  aplicarPaleta(hud)
  useEffect(() => {
    fetch('/api/config', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: { clave: string; valor: string }[]) => {
        setFondo(rows.find(r => r.clave === 'fondo_imagen')?.valor ?? '')
        setOscuridad(parseInt(rows.find(r => r.clave === 'fondo_oscuridad')?.valor ?? '62', 10) || 0)
        setHud(rows.find(r => r.clave === 'dashboard_estilo')?.valor === 'hud')
      })
      .catch(() => {})
  }, [])
  const [foco, setFoco] = useState<string | null>(null)
  const onFocus = (id: string) => setFoco(f => f === id ? null : id)

  const [incidentesAbiertos, setIncidentesAbiertos] = useState<IncidenteItem[]>([])
  const [ultimosIncidentes, setUltimosIncidentes] = useState<IncidenteItem[]>([])
  const [resumenInc, setResumenInc] = useState<IncidenteResumen | null>(null)

  const cargarIncidentes = () => {
    api.incidentes({ soloAbiertos: true, pageSize: 100 }).then(r => setIncidentesAbiertos(r.items)).catch(() => {})
    api.incidentes({ pageSize: 6 }).then(r => setUltimosIncidentes(r.items)).catch(() => {})
    api.incidentesResumen(7).then(setResumenInc).catch(() => {})
  }
  const { data } = useLiveDashboard(estado => (estado === 'DOWN' ? playDown() : playUp()), cargarIncidentes)

  useEffect(() => {
    cargarIncidentes()
    const id = setInterval(cargarIncidentes, 60_000)
    return () => clearInterval(id)
  }, [])

  const [vias, setVias] = useState<ViaConteo[]>([])
  const [vias1h, setVias1h] = useState<ViaConteo[]>([])   // KPI "vías degradadas": última hora
  const [porHora, setPorHora] = useState<HoraAnalisis[]>([])
  useEffect(() => {
    const cargar = () => {
      api.discrepanciasVias('12h').then(setVias).catch(() => {})
      api.discrepanciasVias('1h').then(setVias1h).catch(() => {})
      api.discrepanciasAnalisis().then(r => setPorHora(r.porHora)).catch(() => {})
    }
    cargar()
    const id = setInterval(cargar, 60_000)
    return () => clearInterval(id)
  }, [])

  // Peores vías de lectura OCR (últimas 24 h, ordenadas por Wilson en el backend). Consulta liviana
  // y espaciada: el ranking cambia lento y el resumen completo es caro para la BD.
  const [ocrVias24, setOcrVias24] = useState<OcrVia[]>([])
  useEffect(() => {
    const cargar = () => { api.ocrResumen('24h').then(r => setOcrVias24(r.porVia)).catch(() => {}) }
    cargar()
    const id = setInterval(cargar, 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  const [transitosMes, setTransitosMes] = useState<TransitosMes | null>(null)
  useEffect(() => {
    const cargar = () => { api.ocrTransitosMes().then(setTransitosMes).catch(() => {}) }
    cargar()
    const id = setInterval(cargar, 2 * 60_000)
    return () => clearInterval(id)
  }, [])

  // Lectura OCR del mes: sale del mismo endpoint (una sola consulta ligera sobre el mes).
  const ocr = useMemo(() => transitosMes && ({
    totalConPlaca: transitosMes.ocrConPlaca, aciertos: transitosMes.ocrAciertos,
    errores: transitosMes.ocrErrores, sinDetectar: transitosMes.ocrNoLegibles,
    tasaEfectividad: transitosMes.ocrConPlaca > 0 ? transitosMes.ocrAciertos / transitosMes.ocrConPlaca * 100 : 0,
  }), [transitosMes])

  const [porEstacionSla, setPorEstacionSla] = useState<SlaEstacion[]>([])
  useEffect(() => {
    const cargar = () => {
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      api.slaPorEstacion({ desde }).then(setPorEstacionSla).catch(() => {})
    }
    cargar()
    const id = setInterval(cargar, 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  const [servicios, setServicios] = useState<ServicioLive[]>([])
  useEffect(() => {
    const cargar = () => { api.servicios().then(setServicios).catch(() => {}) }
    cargar()
    const id = setInterval(cargar, 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  const estaciones = useMemo(() => {
    if (!data) return []
    return [...data.estaciones].sort((a, b) => ORDEN_ESTACIONES.indexOf(a.nombre) - ORDEN_ESTACIONES.indexOf(b.nombre))
  }, [data])

  // Vías degradadas en la ÚLTIMA HORA: discrepancia > UMBRAL_DAC confirmada con Wilson
  // (no basta el % a secas). "En vigilancia" = entre UMBRAL_DAC_VIGILANCIA y UMBRAL_DAC.
  const viasDegradadas = useMemo(() => vias1h.filter(v => severidadDac(v) === 'critico'), [vias1h])
  const viasVigilancia = useMemo(() => vias1h.filter(v => severidadDac(v) === 'warn'), [vias1h])

  // Ranking por % confirmado (Wilson), no por % a secas: si no, una vía con 2 tránsitos
  // y 1 discrepancia (50%) encabezaría "Vías más críticas" por encima de una con volumen real.
  const viasTop = useMemo(() => [...vias].sort((a, b) => b.pctWilson - a.pctWilson || b.pct - a.pct).slice(0, 5), [vias])
  const maxViaPct = Math.max(1, ...viasTop.map(v => v.pct))

  const totalDiscrepancias = vias.reduce((s, v) => s + v.total, 0)
  const totalTransitos = vias.reduce((s, v) => s + v.totalTransitos, 0)
  const pctCoincidenciaDac = totalTransitos > 0 ? 100 - (totalDiscrepancias / totalTransitos * 100) : 100

  const kpis = data?.kpis
  const fueraDeLinea = kpis ? kpis.total - kpis.ups : 0

  // ── Latencia por estación (mismo cálculo que Muro NOC: promedio de equipos
  // monitoreados, con el mismo umbral de 24ms ya calibrado en producción) ──
  const latenciaPorEstacion = useMemo(() => estaciones.map(est => {
    const eqs = est.vias.flatMap(v => v.equipos).filter(e => e.monitorear)
    const lats = eqs.map(e => e.latenciaMs).filter((n): n is number => n != null)
    const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null
    return {
      nombre: est.nombre, avg, min: lats.length ? Math.min(...lats) : null, max: lats.length ? Math.max(...lats) : null,
      up: est.up, total: est.up + est.down,
    }
  }).filter(e => e.avg != null).sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0)), [estaciones])

  const slaGlobal = porEstacionSla.length ? porEstacionSla.reduce((s, e) => s + e.uptimePct, 0) / porEstacionSla.length : null

  const dacDelta = useDelta(Math.round(pctCoincidenciaDac * 10) / 10)
  const eventosDelta = useDelta(resumenInc?.total ?? null)
  const activosDelta = useDelta(resumenInc?.activos ?? null)
  const fueraDelta = useDelta(fueraDeLinea)
  const ocrDelta = useDelta(ocr ? Math.round(ocr.tasaEfectividad * 10) / 10 : null)

  // Equipos que están sin respuesta AHORA (estado en vivo). Un incidente "abierto" en la BD cuyo
  // equipo ya volvió a verde es un registro rezagado, no una falla vigente: no cuenta.
  const equiposCaidos = useMemo(() => estaciones.flatMap(est =>
    est.vias.flatMap(v => v.equipos.filter(e => e.monitorear && e.ultimoEstado === 'DOWN').map(e => ({ ...e, estacion: est.nombre })))
  ), [estaciones])

  // Alertas actuales para el pie. Orden: críticas primero; dentro de cada nivel, lo más reciente.
  const alertas = useMemo<AlertaFeed[]>(() => {
    const out: AlertaFeed[] = []
    const ahora = Date.now()
    const tipoPorEquipo = new Map(incidentesAbiertos.map(i => [i.equipoId, i.tipo]))
    ;[...equiposCaidos].sort((a, b) => (b.incInicio ?? '').localeCompare(a.incInicio ?? '')).slice(0, 12).forEach(e => {
      const min = e.incMin ?? (e.incInicio ? Math.max(0, (ahora - new Date(e.incInicio).getTime()) / 60_000) : null)
      out.push({
        sev: tipoPorEquipo.get(e.id) === 'Real' || !tipoPorEquipo.has(e.id) ? 'critico' : 'warn', tag: 'RED',
        texto: `${e.nombre} · ${e.estacion} sin respuesta${min != null ? ` hace ${fmtDur(min)}` : ''}`,
      })
    })
    viasDegradadas.forEach(v => out.push({ sev: 'critico', tag: 'DAC', texto: `Vía ${v.via} ${v.estacion} · discrepancia ${v.pct.toFixed(1)}% (${v.total}/${v.totalTransitos}) última hora` }))
    viasVigilancia.forEach(v => out.push({ sev: 'warn', tag: 'DAC', texto: `Vía ${v.via} ${v.estacion} en vigilancia · ${v.pct.toFixed(1)}% de discrepancia` }))
    return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'critico' ? -1 : 1))
  }, [equiposCaidos, incidentesAbiertos, viasDegradadas, viasVigilancia])

  // Rankings (no son fallas): las vías con más discrepancias y peor lectura OCR, ordenadas por el
  // límite inferior de Wilson para que una vía con pocos tránsitos no encabece la lista.
  const rankings = useMemo<AlertaFeed[]>(() => {
    const out: AlertaFeed[] = []
    viasTop.slice(0, 3).filter(v => v.total > 0).forEach((v, i) => out.push({
      sev: 'info', tag: 'TOP DAC',
      texto: `#${i + 1} Vía ${v.via} ${v.estacion} · ${v.pct.toFixed(1)}% de discrepancia 12 h (${v.total}/${v.totalTransitos}) · confirmado ${v.pctWilson.toFixed(1)}%`,
    }))
    ocrVias24.slice(0, 3).filter(v => v.noReconocidas + v.confusiones > 0).forEach((v, i) => out.push({
      sev: 'info', tag: 'TOP OCR',
      texto: `#${i + 1} Vía ${v.via} ${v.estacion} · ${v.efectividad.toFixed(1)}% de acierto OCR 24 h (${v.aciertos}/${v.total}) · ${v.noReconocidas} no legibles`,
    }))
    return out
  }, [viasTop, ocrVias24])
  const feedItems = [...alertas, ...rankings]

  if (!data) return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#04100f', color: TEXTO.secundario }}>
      Cargando…
    </div>
  )

  const tm = transitosMes
  const kpiSpecsBase: KpiSpec[] = [
    {
      id: 'transitos', eyebrow: 'TRÁNSITOS · MES', figura: tm ? tm.total.toLocaleString('es-PE') : '—',
      nota: tm ? `proy. ${tm.proyeccion.toLocaleString('es-PE')}` : 'cargando…',
      barPct: tm ? tm.diasTranscurridos / tm.diasMes * 100 : 0,
      accent: SEM.info, fg: 'oklch(0.870 0.090 200)', nota_fg: 'oklch(0.740 0.035 200)',
      grad: 'linear-gradient(150deg, oklch(0.275 0.055 205), oklch(0.188 0.024 190) 68%)', borde: 'oklch(0.415 0.060 205)',
      delta: null, dec: 0, bueno: d => d > 0,
    },
    {
      id: 'conectividad', eyebrow: 'EQUIPOS EN LÍNEA', figura: String(kpis?.ups ?? '—'), sufijo: `de ${kpis?.total ?? '—'}`,
      nota: fueraDeLinea === 0 ? 'todos respondiendo' : `${fueraDeLinea} sin respuesta`,
      barPct: kpis && kpis.total > 0 ? kpis.ups / kpis.total * 100 : 0,
      accent: SEM.ok, fg: 'oklch(0.900 0.140 172)', nota_fg: 'oklch(0.740 0.030 172)',
      grad: 'linear-gradient(150deg, oklch(0.280 0.060 172), oklch(0.190 0.026 185) 68%)', borde: 'oklch(0.420 0.070 172)',
      delta: fueraDelta, dec: 0, bueno: d => d < 0,
    },
    {
      id: 'discrepancias', eyebrow: 'COINCIDENCIA DAC', figura: pctCoincidenciaDac.toFixed(1), sufijo: `% · meta ${META}%`,
      nota: `${totalDiscrepancias.toLocaleString('es-PE')} de ${totalTransitos.toLocaleString('es-PE')} · 12 h`,
      barPct: pctCoincidenciaDac, marca: META,
      accent: SEM.warn, fg: 'oklch(0.880 0.110 78)', nota_fg: 'oklch(0.760 0.055 78)',
      grad: 'linear-gradient(150deg, oklch(0.278 0.055 78), oklch(0.188 0.024 190) 68%)', borde: 'oklch(0.418 0.062 78)',
      delta: dacDelta, dec: 1, bueno: d => d > 0,
    },
    {
      id: 'ocr', eyebrow: 'ACIERTO OCR', figura: ocr ? ocr.tasaEfectividad.toFixed(1) : '—', sufijo: '%',
      nota: ocr ? 'lectura de placas · mes' : 'cargando…',
      barPct: ocr?.tasaEfectividad ?? 0,
      accent: SEM.lila, fg: 'oklch(0.880 0.090 305)', nota_fg: 'oklch(0.750 0.045 305)',
      grad: 'linear-gradient(150deg, oklch(0.272 0.050 305), oklch(0.188 0.024 190) 68%)', borde: 'oklch(0.410 0.060 305)',
      delta: ocrDelta, dec: 1, bueno: d => d > 0,
    },
    {
      id: 'incidentes', eyebrow: 'INCIDENTES · 7 DÍAS', figura: String(resumenInc?.total ?? '—'), sufijo: `${equiposCaidos.length} activos`,
      nota: resumenInc?.mttrMin != null ? `MTTR ${fmtDur(resumenInc.mttrMin)}` : 'MTTR —',
      barPct: resumenInc ? Math.min(100, equiposCaidos.length / 18 * 100) : 0,
      accent: PANEL.rojo, fg: 'oklch(0.870 0.130 25)', nota_fg: 'oklch(0.760 0.070 25)',
      grad: 'linear-gradient(150deg, oklch(0.272 0.058 25), oklch(0.188 0.024 190) 68%)', borde: 'oklch(0.410 0.070 25)',
      delta: eventosDelta ?? activosDelta, dec: 0, bueno: d => d < 0,
    },
  ]

  // Estilo HUD: todos los KPI en el verde azulado de SIGMA salvo el de incidentes (rojo)
  const kpiSpecs: KpiSpec[] = hud
    ? kpiSpecsBase.map(k => k.eyebrow.startsWith('INCIDENTES') ? k : {
        ...k, accent: 'oklch(0.80 0.10 192)', fg: 'oklch(0.89 0.09 192)', nota_fg: 'oklch(0.74 0.04 192)',
        grad: 'linear-gradient(150deg, oklch(0.275 0.055 192), oklch(0.188 0.024 190) 68%)', borde: 'oklch(0.42 0.065 192)',
      })
    : kpiSpecsBase

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', background: '#04100f', overflowX: 'hidden' }}>
    <div style={{ width: 1920 * escala, height: 1080 * escala, flex: '0 0 auto', margin: '0 auto', overflow: 'hidden' }}>
      <div style={{
        width: 1920, height: 1080, flex: '0 0 auto', transform: `scale(${escala})`, transformOrigin: 'top left',
        boxSizing: 'border-box', padding: '14px 22px 14px', display: 'flex', flexDirection: 'column', gap: 10,
        fontFamily: 'var(--app-font)', color: TEXTO.primario, overflow: 'hidden', backgroundColor: '#061413',
        backgroundImage: (fondo ? [
          `linear-gradient(180deg, oklch(0.12 0.02 190 / ${(oscuridad / 100).toFixed(2)}), oklch(0.09 0.02 190 / ${Math.min(1, oscuridad / 100 + 0.12).toFixed(2)}))`,
          `url(/api/audio/${fondo})`,
        ] : hud ? [
          'radial-gradient(900px 600px at 50% 45%, oklch(0.30 0.06 190 / 0.35), transparent 70%)',
          'linear-gradient(oklch(0.80 0.10 190 / 0.05) 1px, transparent 1px)',
          'linear-gradient(90deg, oklch(0.80 0.10 190 / 0.05) 1px, transparent 1px)',
        ] : [
          'radial-gradient(1200px 700px at 8% -12%, oklch(0.33 0.045 185 / 0.65), transparent 66%)',
          'radial-gradient(1000px 620px at 98% 2%, oklch(0.30 0.040 200 / 0.45), transparent 64%)',
          'radial-gradient(1100px 700px at 55% 120%, oklch(0.26 0.035 190 / 0.55), transparent 70%)',
        ]).join(', '),
        backgroundSize: fondo ? 'cover' : hud ? 'auto, 44px 44px, 44px 44px' : undefined, backgroundPosition: fondo ? 'center' : undefined,
      }}>
        <style>{`@keyframes breathe { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
        <FondoCtx.Provider value={!!fondo}>
        <HudCtx.Provider value={hud}>

        <WallTopbar activo="Panel de control" />

        {/* ── KPIs ── */}
        <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {kpiSpecs.map((k, i) => <KpiCard key={i} k={k} foco={foco} onFocus={onFocus} />)}
        </div>

        {/* ── Main: 3 columnas × 2 filas iguales, una tarjeta de detalle por KPI ── */}
        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: '440px 1fr 460px', gridTemplateRows: '1fr 1fr', gap: 12 }}>

          {/* Izq · fila 1 — Tránsitos y cobro */}
          <Card id="transitos" foco={foco} onFocus={onFocus} style={{ padding: '14px 20px 14px', justifyContent: 'space-between' }}>
            <CardHeader title="Tránsitos y cobro" right={<PeriodChip label={tm ? `día ${tm.diasTranscurridos} de ${tm.diasMes}` : 'mes'} />} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: TEXTO.terciario }} title="Promedio de los días completos del mes (no incluye hoy, que aún no termina)">promedio diario · días completos</div>
                <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{tm ? tm.promedioDia.toLocaleString('es-PE') : '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TEXTO.terciario }} title="Días completos + hoy + días restantes estimados con la mediana de ese mismo día de la semana en las últimas 4 semanas">proyección de cierre</div>
                <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{tm ? tm.proyeccion.toLocaleString('es-PE') : '—'}</div>
              </div>
            </div>
            {(() => {
              // Un slot por día del mes: reales sólidos, restantes proyectados (borde punteado) al promedio
              const dias = tm?.diasMes ?? 31
              const porDia = new Map((tm?.porDia ?? []).map(d => [parseInt(d.fecha.slice(8, 10), 10), d.total]))
              const esperado = new Map((tm?.esperado ?? []).map(e => [parseInt(e.fecha.slice(8, 10), 10), e.esperado]))
              const maxDia = Math.max(1, ...porDia.values(), ...esperado.values())
              return (
                <div>
                  <div style={{ height: 62, display: 'flex', alignItems: 'flex-end', gap: 3, boxShadow: 'inset 0 -1px 0 oklch(0.400 0.028 190)' }}>
                    {Array.from({ length: dias }, (_, i) => {
                      const dia = i + 1
                      const real = porDia.get(dia)
                      const proyectado = real == null
                      const alto = Math.max(4, ((proyectado ? esperado.get(dia) ?? tm?.promedioDia ?? 0 : real) as number) / maxDia * 100)
                      return <div key={dia} title={proyectado ? `día ${dia}: esperado ${(esperado.get(dia) ?? 0).toLocaleString('es-PE')}` : `día ${dia}: ${real.toLocaleString('es-PE')}`} style={{
                        flex: '1 1 0', height: `${alto}%`, borderRadius: '2px 2px 0 0', boxSizing: 'border-box',
                        background: proyectado ? 'transparent' : SEM.info,
                        border: proyectado ? `1px dashed ${TEXTO.terciario}` : undefined, borderBottom: proyectado ? 'none' : undefined,
                        transition: 'height 1.2s cubic-bezier(0.4,0,0.2,1)',
                      }} />
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, fontWeight: 500, color: TEXTO.terciario }}>
                    <span>real</span><span>proyectado · mediana por día de la semana</span>
                  </div>
                </div>
              )
            })()}
            <div style={{ paddingTop: 10, boxShadow: 'inset 0 1px 0 oklch(0.330 0.026 190)' }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 7 }}>Forma de cobro</div>
              <BarraApilada sinConteo total={tm?.total ?? 0} segmentos={[
                { nombre: 'Efectivo', n: tm?.efectivo ?? 0, color: SEM.warn },
                { nombre: 'Tarjeta', n: tm?.tarjeta ?? 0, color: SEM.ok },
                { nombre: 'Prepago', n: tm?.tag ?? 0, color: SEM.info },
                { nombre: 'Tarifa diferenciada', n: tm?.porPlaca ?? 0, color: 'oklch(0.72 0.10 230)' },
                { nombre: 'Exento + otros', n: (tm?.exento ?? 0) + (tm?.otros ?? 0), color: 'oklch(0.50 0.02 190)' },
              ]} />
            </div>
          </Card>

          {/* Centro · fila 1 — Conectividad de nodos */}
            <Card id="conectividad" foco={foco} onFocus={onFocus} style={{ padding: '14px 18px' }}>
              <SigmaTopologia estaciones={estaciones} hud={hud} />
            </Card>

          {/* Der · fila 1 — Disponibilidad 30 días + equipos caídos o sin dato */}
          <Card id="conectividad" foco={foco} onFocus={onFocus} style={{ padding: '14px 20px 12px', justifyContent: 'space-between' }}>
            <CardHeader title="Disponibilidad · 30 días" right={<div style={{ fontSize: 14, fontWeight: 500, color: TEXTO.terciario }}>ref. 100%</div>} />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <div style={{ fontSize: 46, fontWeight: 200, letterSpacing: '-0.045em' }}>{slaGlobal != null ? slaGlobal.toFixed(2) : '—'}</div>
                <div style={{ fontSize: 26, fontWeight: 200, color: 'oklch(0.900 0.015 190)' }}>%</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: TEXTO.secundario }}>
                {slaGlobal != null ? `${Math.max(0, 100 - slaGlobal).toFixed(2)} pp sin conexión` : '—'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, porEstacionSla.length)}, 1fr)`, gap: 8, textAlign: 'center' }}>
              {porEstacionSla.map(e => {
                // Ámbar: la estación queda claramente por debajo del promedio de la red
                const bajo = slaGlobal != null && e.uptimePct < slaGlobal - 0.1
                return (
                  <div key={e.estacionId} style={{ padding: '6px 4px', borderRadius: 10, background: 'oklch(0.215 0.026 190)', boxShadow: bajo ? `inset 0 0 0 1px ${SEM.warn}` : 'inset 0 0 0 1px oklch(0.310 0.028 190)' }}>
                    <div style={{ fontSize: 17, fontWeight: 600, color: bajo ? SEM.warn : SEM.info }}>{e.uptimePct.toFixed(2)}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: estColor(e.estacion), marginTop: 2 }}>{e.estacion}</div>
                  </div>
                )
              })}
            </div>
            {(() => {
              // Lo que requiere atención: equipos sin respuesta AHORA y servicios degradados o sin dato
              type Fila = { key: string; color: string; nombre: string; estado: string }
              const filas: Fila[] = [
                ...equiposCaidos.map(e => ({ key: `e${e.id}`, color: SEM.critico, nombre: `${e.nombre} · ${e.estacion}`, estado: e.incMin != null ? `sin respuesta ${fmtDur(e.incMin)}` : 'sin respuesta' })),
                ...servicios.filter(sv => sv.uptimePct == null || sv.uptimePct < META).map(sv => ({
                  key: `s${sv.id}`, color: sv.uptimePct == null ? SEM.info : SEM.warn, nombre: sv.nombre,
                  estado: sv.uptimePct == null ? 'sin dato' : `degradado ${sv.uptimePct.toFixed(2)}%`,
                })),
              ]
              const MAX = 3
              const visibles = filas.length > MAX ? filas.slice(0, MAX - 1) : filas
              return (
                <div style={{ paddingTop: 8, boxShadow: 'inset 0 1px 0 oklch(0.330 0.026 190)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.12em', color: TEXTO.terciario, marginBottom: 6 }}>EQUIPOS Y SERVICIOS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {filas.length === 0
                      ? <div style={{ padding: '8px 12px', borderRadius: 10, background: 'oklch(0.215 0.026 190)', fontSize: 14, fontWeight: 500, color: SEM.ok }}>Todos los equipos y servicios operativos</div>
                      : visibles.map(f => (
                        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 10, background: 'oklch(0.215 0.026 190)' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, flex: '0 0 auto' }} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: f.color, whiteSpace: 'nowrap' }}>{f.estado}</span>
                        </div>
                      ))}
                    {filas.length > MAX && (
                      <div style={{ padding: '4px 12px', fontSize: 13, fontWeight: 500, color: TEXTO.terciario }}>+{filas.length - visibles.length} más</div>
                    )}
                  </div>
                </div>
              )
            })()}
          </Card>

          {/* Izq · fila 2 — Lectura de placas · OCR */}
          <Card id="ocr" foco={foco} onFocus={onFocus} style={{ padding: '14px 20px 14px', justifyContent: 'space-between' }}>
            <CardHeader title="Lectura de placas · OCR" right={<div style={{ fontSize: 14, fontWeight: 500, color: TEXTO.terciario }}>sin exentos</div>} />
            {(() => {
              const total = Math.max(0, (tm?.total ?? 0) - (tm?.exento ?? 0))
              const sinPlaca = Math.max(0, total - (ocr?.totalConPlaca ?? 0))
              const filas = [
                { nombre: 'Reconocidas', n: ocr?.aciertos ?? 0, color: SEM.ok },
                { nombre: 'No legibles', n: ocr?.sinDetectar ?? 0, color: SEM.critico },
                { nombre: 'Error de detección', n: ocr?.errores ?? 0, color: SEM.warn },
                { nombre: 'Sin placa de referencia', n: sinPlaca, color: 'oklch(0.50 0.02 190)' },
              ]
              return (
                <>
                  <div style={{ display: 'flex', height: 22, borderRadius: 8, overflow: 'hidden', gap: 2, boxShadow: 'inset 0 0 0 1px oklch(0.460 0.035 190)', padding: 3, boxSizing: 'border-box' }}>
                    {filas.map(f => (
                      <div key={f.nombre} style={{ width: `${total > 0 ? f.n / total * 100 : 0}%`, backgroundImage: stripedImage(f.color), borderRadius: 3, transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {filas.map((f, i) => (
                      <div key={f.nombre} title={f.nombre === 'Sin placa de referencia' ? 'Tránsitos sin placa capturada en el sistema: no hay con qué comparar la lectura del OCR' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px', boxShadow: i > 0 ? 'inset 0 1px 0 oklch(0.290 0.024 190)' : undefined }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color, flex: '0 0 auto' }} />
                        <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{f.nombre}</span>
                        <span style={{ fontSize: 14, fontWeight: 500, color: TEXTO.terciario, fontVariantNumeric: 'tabular-nums' }}>{f.n.toLocaleString('es-PE')}</span>
                        <span style={{ width: 60, textAlign: 'right', fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? (f.n / total * 100).toFixed(1) : '0.0'}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: TEXTO.terciario, flex: '0 0 auto', marginRight: 4 }}>Acierto · últimos 5 días</div>
              {(tm?.porDia ?? []).filter(d => d.ocrConPlaca > 0).slice(-5).map(d => (
                <div key={d.fecha} title={d.fecha} style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, background: 'oklch(0.215 0.026 190)', boxShadow: 'inset 0 0 0 1px oklch(0.310 0.028 190)', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {(d.ocrAciertos / d.ocrConPlaca * 100).toFixed(1)}
                </div>
              ))}
            </div>
          </Card>

          {/* Centro · fila 2 — Discrepancias DAC + Latencia, lado a lado */}
          <div style={{ minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card id="discrepancias" foco={foco} onFocus={onFocus} style={{ padding: '14px 18px 12px', justifyContent: 'space-between' }}>
              <CardHeader title="Discrepancias DAC" right={<div style={{ fontSize: 14, fontWeight: 500, color: TEXTO.terciario }}>12 h · meta {META}%</div>} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: TEXTO.terciario, marginBottom: 6 }}>Coincidencia por hora · patrón 7 días</div>
                <div style={{ height: 70, display: 'flex', alignItems: 'flex-end', gap: 3, boxShadow: 'inset 0 -1px 0 oklch(0.400 0.028 190)' }}>
                  {Array.from({ length: 24 }, (_, h) => {
                    const row = porHora.find(pp => pp.hora === h)
                    const coincidencia = row ? 100 - row.tasaError : null
                    const v = coincidencia ?? 90
                    const alto = Math.max(4, Math.min(100, ((v - 89) / (100 - 89)) * 100))
                    const color = coincidencia == null ? 'oklch(0.36 0.02 190)' : coincidencia >= 94 ? SEM.ok : coincidencia >= 92 ? SEM.warn : SEM.critico
                    return <div key={h} title={coincidencia != null ? `${h}h — ${coincidencia.toFixed(1)}%` : `${h}h — sin datos`} style={{ flex: '1 1 0', height: `${alto}%`, background: color, borderRadius: '3px 3px 0 0', transition: 'height 1.2s cubic-bezier(0.4,0,0.2,1)' }} />
                  })}
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} style={{ flex: '1 1 0', textAlign: 'center', fontSize: 10, fontWeight: 500, color: TEXTO.terciario }}>{h % 6 === 0 || h === 23 ? String(h).padStart(2, '0') : ''}</div>
                  ))}
                </div>
              </div>
              <div style={{ paddingTop: 8, boxShadow: 'inset 0 1px 0 oklch(0.330 0.026 190)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.12em', color: TEXTO.terciario, marginBottom: 6 }}>VÍAS MÁS CRÍTICAS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {viasTop.slice(0, 3).length === 0
                    ? <div style={{ color: TEXTO.terciario, fontSize: 14 }}>Sin discrepancias en el período</div>
                    : viasTop.slice(0, 3).map((v, i) => {
                      const sev = severidadDac(v)
                      const color = sev === 'critico' ? SEM.critico : sev === 'warn' ? SEM.warn : SEM.ok
                      return (
                        <div key={`${v.estacion}-${v.via}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 16, fontSize: 14, fontWeight: 600, color: TEXTO.terciario }}>{i + 1}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Vía {v.via} · {v.estacion}</span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: TEXTO.terciario }}>{v.total}/{v.totalTransitos}</span>
                          <span style={{ width: 54, textAlign: 'right', fontSize: 16, fontWeight: 600, color }}>{v.pct.toFixed(1)}%</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </Card>

            <Card id="conectividad" foco={foco} onFocus={onFocus} style={{ padding: '14px 18px 12px', justifyContent: 'space-between' }}>
              <CardHeader title="Latencia" right={<div style={{ fontSize: 14, fontWeight: 500, color: TEXTO.terciario }}>umbral 24 ms</div>} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, justifyContent: 'space-around', paddingTop: 8 }}>
                {latenciaPorEstacion.map(e => {
                  const alto = (e.avg ?? 0) >= 24
                  const color = alto ? SEM.warn : SEM.ok
                  return (
                    <div key={e.nombre} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 84, fontSize: 15, fontWeight: 500, color: estColor(e.nombre), flex: '0 0 auto' }}>{e.nombre}</div>
                      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                        <BarTrack height={14}><div style={stripedFill(Math.min(100, (e.avg ?? 0) / 40 * 100), color)} /></BarTrack>
                        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${24 / 40 * 100}%`, width: 1.5, background: TEXTO.secundario, opacity: 0.8 }} />
                      </div>
                      <div style={{ width: 54, textAlign: 'right', fontSize: 16, fontWeight: 600, color, flex: '0 0 auto' }}>{e.avg} ms</div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* Der · fila 2 — Últimos incidentes */}
          <Card id="incidentes" foco={foco} onFocus={onFocus} style={{ padding: '14px 20px 12px', justifyContent: 'space-between' }}>
            <CardHeader title="Últimos incidentes" right={<div style={{ fontSize: 14, fontWeight: 500, color: TEXTO.terciario }}>7 días</div>} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'space-around', paddingTop: 8, minHeight: 0 }}>
              {ultimosIncidentes.length === 0
                ? <div style={{ textAlign: 'center', color: TEXTO.terciario, fontSize: 14 }}>Sin incidentes recientes</div>
                : ultimosIncidentes.slice(0, 5).map(inc => {
                  const color = inc.tipo === 'Real' ? SEM.critico : SEM.warn
                  const hora = new Date(inc.inicio)
                  return (
                    <div key={inc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'oklch(0.215 0.026 190)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.equipoNombre}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: TEXTO.terciario, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.estacion} · {inc.motivo ?? inc.tipo}</div>
                      </div>
                      <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{inc.duracionMin != null ? fmtDur(inc.duracionMin) : 'abierto'}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: TEXTO.terciario }}>{hora.getDate()}/{hora.getMonth() + 1} {String(hora.getHours()).padStart(2, '0')}:{String(hora.getMinutes()).padStart(2, '0')}</div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </Card>
        </div>

        {/* ── Feed de alertas actuales ── */}
        <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 14, height: 38, padding: '0 16px', borderRadius: hud ? 8 : 999, background: 'oklch(0.200 0.026 190)', boxShadow: `inset 0 0 0 1px ${alertas.some(a => a.sev === 'critico') ? 'oklch(0.50 0.12 25)' : 'oklch(0.360 0.028 190)'}` }}>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, letterSpacing: '.12em', color: alertas.length ? PANEL.rojo : SEM.ok }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: alertas.length ? PANEL.rojo : SEM.ok, animation: alertas.length ? 'breathe 1.4s ease-in-out infinite' : undefined }} />
            ALERTAS · {alertas.length}
          </div>
          <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', position: 'relative' }}>
            {feedItems.length === 0
              ? <div style={{ fontSize: 15, fontWeight: 500, color: TEXTO.secundario }}>Sin alertas en vivo · equipos respondiendo y vías dentro de lo esperado</div>
              : (
                <div style={{ display: 'flex', width: 'max-content', animation: `ticker ${Math.max(30, feedItems.length * 9)}s linear infinite` }}>
                  {[0, 1].map(copia => (
                    <div key={copia} style={{ display: 'flex', alignItems: 'center', gap: 34, paddingRight: 34 }}>
                      {feedItems.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap', fontSize: 15, fontWeight: 500 }}>
                          <span style={{ padding: '1px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', color: 'oklch(0.16 0.03 200)', background: a.sev === 'critico' ? PANEL.rojo : a.sev === 'warn' ? SEM.warn : SEM.info }}>{a.tag}</span>
                          {a.texto}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
          </div>
          {foco != null && (
            <div onClick={() => setFoco(null)} style={{ flex: '0 0 auto', cursor: 'pointer', fontSize: 14, fontWeight: 600, letterSpacing: '.04em', color: 'oklch(0.860 0.100 195)' }}>VER TODO</div>
          )}
        </div>
        </HudCtx.Provider>
        </FondoCtx.Provider>
      </div>
    </div>
    </div>
  )
}
