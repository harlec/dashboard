import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ViaConteo, type IncidenteItem, type EquipoLive, type DisponibilidadDiaria } from '../api/client'
import { useLiveDashboard } from '../hooks/useLiveDashboard'
import { useAlertSound } from '../hooks/useAlertSound'
import { EquipoModal } from '../components/EquipoModal'
import logo from '../assets/logo.png'

// Paleta corporativa ALEATICA (manual de marca, sección "2.7 Colores corporativos") —
// hex derivado de los RGB de la guía. No trae un rojo, así que "down"/crítico se
// mantiene en rojo por convención de seguridad (ver CHIP.down más abajo).
const ALEATICA = {
  verde:       '#72BF44', // Verde ALEATICA — primario
  musgo:       '#0DB14B', // Musgo Secundario
  lima:        '#D3DF4E', // Lima Secundario
  naranja:     '#F99B1C', // Naranja ALEATICA — primario
  naranjaSec:  '#F57E20', // Naranja Secundario
  gris:        '#6F605A', // Gris ALEATICA
  grisSec:     '#F2F1EF', // Gris Secundario
  verdeCrema:  '#D9E8AE', // Verde Crema ALEATICA
  azul:        '#00BBE7', // Azul ALEATICA
  amarillo:    '#FFDD00', // Amarillo ALEATICA
} as const

// Mismos destinos que NavBar.tsx — el muro es una pantalla aparte (sin el nav normal
// por el presupuesto de píxeles fijo), este menú es la única forma de llegar al resto
// desde acá cuando alguien la ve con mouse en vez de en la TV.
const MENU_LINKS = [
  { to: '/',              label: 'Dashboard' },
  { to: '/noc',           label: 'NOC' },
  { to: '/incidentes',    label: 'Incidentes' },
  { to: '/reporte',       label: 'Reporte SLA' },
  { to: '/reportes',      label: 'Reportes' },
  { to: '/discrepancias', label: 'Discrepancias' },
  { to: '/ocr',           label: 'OCR Placas' },
  { to: '/admin',         label: 'Admin' },
] as const

// ── Escala la pantalla de 1920×1080 al tamaño real del monitor (ej. TV 4K de 65") ──
// El diseño es a píxel fijo por spec, así que en vez de rehacerlo fluido se escala
// entero con transform — el patrón estándar para pantallas de señalización/muro.
// Se escala por ANCHO (llena de borde a borde) — en pantalla completa real (F11 /
// modo kiosco) el monitor es 16:9 igual que el diseño, así que alto y ancho calzan
// exacto; en una ventana normal del navegador (con barra/pestañas) puede recortar
// unos px de la parte de abajo, pero eso no pasa en la TV real.
function useEscalaPantalla() {
  const [escala, setEscala] = useState(1)
  useEffect(() => {
    const calcular = () => setEscala(window.innerWidth / 1920)
    calcular()
    window.addEventListener('resize', calcular)
    return () => window.removeEventListener('resize', calcular)
  }, [])
  return escala
}


// ── Reloj HH:MM, tick propio de 1s — separado del refresco de datos ──
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

// ── Estilos de chip por estado (sección 1.3 del handoff) ──
interface ChipStyle { bg: string; fg: string; sh: string }
// "up" tiene DOS variantes, alternables con el switch "Resaltar solo fallas" del
// header (el handoff traía este flag para comparar pero pedía no exponerlo en
// producción salvo que el cliente lo pidiera — lo pidió):
//  - excepción (por defecto): apagado/desaturado, matiz verde ALEATICA sutil — el
//    color se reserva para lo que falla.
//  - coloreado: verde ALEATICA a toda saturación, como el comportamiento clásico.
// "degraded" usa el naranja ALEATICA a color completo en ambos modos (siempre debe
// llamar la atención). "down" se queda en rojo — la guía de marca no trae un rojo y
// es el color de peligro universal, no tiene sentido reemplazarlo por fidelidad.
const UP_EXCEPCION: ChipStyle = { bg: 'oklch(0.32 0.03 145 / 0.80)', fg: 'oklch(0.80 0.05 145)', sh: 'inset 0 1px 0 oklch(1 0 0 / 0.05)' }
const UP_COLOREADO: ChipStyle = {
  bg: `linear-gradient(180deg, ${ALEATICA.verde}, ${ALEATICA.musgo})`, fg: '#0B2E12',
  sh: `0 0 14px ${ALEATICA.verde}59, inset 0 1px 0 oklch(1 0 0 / 0.30)`,
}
const CHIP_ESTATICO: Record<'degraded' | 'down' | 'na' | 'blank', ChipStyle> = {
  degraded: {
    bg: `linear-gradient(180deg, #FCC067, ${ALEATICA.naranja})`, fg: '#3A2205',
    sh: `0 0 18px ${ALEATICA.naranja}6B, inset 0 1px 0 oklch(1 0 0 / 0.35)`,
  },
  down: {
    bg: 'linear-gradient(180deg, oklch(0.66 0.17 15), oklch(0.53 0.16 15))', fg: 'oklch(0.99 0.02 15)',
    sh: '0 0 20px oklch(0.66 0.18 15 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.28)',
  },
  na: { bg: 'transparent', fg: 'oklch(0.42 0.012 265)', sh: 'inset 0 0 0 1px oklch(0.36 0.012 265)' },
  blank: { bg: 'transparent', fg: 'transparent', sh: 'none' },
}
// Estado de transición — ~5s tras un cambio de red, antes de asentarse en su color
// final. "Cayendo" (subía→bajaba) pasa por un naranja intermedio; "subiendo"
// (bajaba→subía) pasa por un verde más claro que el normal. Ambos con latido rápido
// (0.5s) para que se note claramente que ACABA de cambiar, distinto del parpadeo
// lento (2s) de un "down" que ya lleva rato así.
const TRANSICION_CAYENDO: ChipStyle = {
  bg: `linear-gradient(180deg, #FCC067, ${ALEATICA.naranja})`, fg: '#3A2205',
  sh: `0 0 22px ${ALEATICA.naranja}B0, inset 0 1px 0 oklch(1 0 0 / 0.40)`,
}
const TRANSICION_SUBIENDO: ChipStyle = {
  bg: `linear-gradient(180deg, #A6F08A, ${ALEATICA.verde})`, fg: '#0B2E12',
  sh: `0 0 22px ${ALEATICA.verde}B0, inset 0 1px 0 oklch(1 0 0 / 0.45)`,
}

function estiloDe(estado: 'up' | 'degraded' | 'down' | 'na' | 'blank', resaltarSoloFallas: boolean): ChipStyle {
  return estado === 'up' ? (resaltarSoloFallas ? UP_EXCEPCION : UP_COLOREADO) : CHIP_ESTATICO[estado]
}

// ── Estaciones: orden de despliegue + alias hacia el dominio de Discrepancias ──
// (allá "KM 402" se llama "402" — ver EstacionCase en DiscrepanciasService.cs)
const ORDEN_ESTACIONES = ['Fortaleza', 'Huarmey', 'KM 402', 'Santa', 'Viru']
function claveDiscrepancias(nombreLive: string): string {
  const up = nombreLive.toUpperCase()
  return up.startsWith('KM ') ? up.slice(3) : up
}

const FILAS_TIPO = [
  { tipo: 'PC Via', label: 'PC vía' },
  { tipo: 'PC OCR', label: 'PC OCR' },
  { tipo: 'Display Tarifario', label: 'Display tarif.' },
  { tipo: 'Camara OCR', label: 'Cámara OCR' },
  { tipo: 'Cámara Validación', label: 'Cámara valid.' },
] as const

type Estado = 'up' | 'degraded' | 'down' | 'na' | 'blank'
type Transicion = 'subiendo' | 'cayendo'
interface Chip extends ChipStyle { txt: string; title: string; estado: Estado; onClick?: () => void; transicion?: Transicion }
const chipDe = (
  estado: Estado, txt: string, resaltarSoloFallas: boolean, title: string, onClick?: () => void, transicion?: Transicion,
): Chip => ({
  txt, title, estado, onClick, transicion,
  ...(transicion === 'cayendo' ? TRANSICION_CAYENDO : transicion === 'subiendo' ? TRANSICION_SUBIENDO : estiloDe(estado, resaltarSoloFallas)),
})

// Mismo formato de tooltip que ya usa EquipoChip.tsx en el Dashboard (Estado en
// Tiempo Real) — para que el operador vea la misma información al pasar el mouse
// en cualquiera de las dos pantallas.
function tooltipEquipo(eq: { nombre: string; ultimoEstado?: string; latenciaMs?: number; incMin?: number }): string {
  const estado = eq.ultimoEstado ?? 'Sin datos'
  const lat = eq.latenciaMs == null ? '' : eq.ultimoEstado === 'DOWN'
    ? ` · ${Math.round(eq.latenciaMs)}ms (previo a caer)`
    : ` · ${Math.round(eq.latenciaMs)}ms`
  const inc = eq.incMin != null ? ` · Inc: ${fmtDur(eq.incMin)}` : ''
  return `${eq.nombre} — ${estado}${lat}${inc}`
}

function fmtDur(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Severidad del DAC: % discrepancias/tránsitos de las últimas 24h, pero exige
// un mínimo de tránsitos para llegar a cada nivel. Una vía alterna con 5 tránsitos
// y 1 discrepancia es 20% — estadísticamente no dice nada; una vía regular con
// 2000 tránsitos al 20% sí es una señal real. Por eso el umbral de tránsitos crece
// junto con la severidad exigida: entre menos tráfico, más tolerante hay que ser.
function severidadDac(pct: number, transitos: number): 'up' | 'degraded' | 'down' {
  if (pct > 20 && transitos >= 30) return 'down'
  if (pct > 12 && transitos >= 15) return 'degraded'
  return 'up'
}


export function NocMuro() {
  const reloj = useReloj()
  const escala = useEscalaPantalla()
  const { playDown, playUp } = useAlertSound()
  const { data } = useLiveDashboard(estado => (estado === 'DOWN' ? playDown() : playUp()))

  const [vias, setVias] = useState<ViaConteo[]>([])
  const [incidentesAbiertos, setIncidentesAbiertos] = useState<IncidenteItem[]>([])
  const [mttrMin, setMttrMin] = useState<number | null>(null)
  const [disponibilidadDiaria, setDisponibilidadDiaria] = useState<DisponibilidadDiaria | null>(null)
  const [selectedEquipo, setSelectedEquipo] = useState<EquipoLive | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)

  // Transición de ~5s tras un cambio real de estado (subiendo/cayendo) por equipo,
  // antes de asentarse en su color final — ver TRANSICION_CAYENDO/SUBIENDO arriba.
  const [transiciones, setTransiciones] = useState<Map<number, Transicion>>(new Map())
  const estadoAnteriorRef = useRef<Map<number, string | undefined>>(new Map())
  const timeoutsRef = useRef<number[]>([])
  useEffect(() => {
    if (!data) return
    const anteriores = estadoAnteriorRef.current
    const nuevas: [number, Transicion][] = []
    for (const est of data.estaciones) for (const via of est.vias) for (const eq of via.equipos) {
      const previo = anteriores.get(eq.id)
      if (eq.monitorear && previo !== undefined && previo !== eq.ultimoEstado
        && (eq.ultimoEstado === 'UP' || eq.ultimoEstado === 'DOWN')) {
        nuevas.push([eq.id, eq.ultimoEstado === 'UP' ? 'subiendo' : 'cayendo'])
      }
      anteriores.set(eq.id, eq.ultimoEstado)
    }
    if (nuevas.length === 0) return
    setTransiciones(prev => {
      const next = new Map(prev)
      for (const [id, t] of nuevas) next.set(id, t)
      return next
    })
    // OJO: este timeout NO se cancela cuando vuelve a correr el efecto (llega otro
    // dato de SignalR, algo frecuente) — si se cancelara ahí, una transición podía
    // quedar pegada parpadeando para siempre en vez de asentarse a los 5s.
    timeoutsRef.current.push(window.setTimeout(() => {
      setTransiciones(prev => {
        const next = new Map(prev)
        for (const [equipoId] of nuevas) next.delete(equipoId)
        return next
      })
    }, 5000))
  }, [data])

  useEffect(() => () => { timeoutsRef.current.forEach(id => window.clearTimeout(id)) }, [])

  // Promedio de los 30 días reales (mismo dato que alimenta el gráfico de abajo)
  const disponibilidad30d = disponibilidadDiaria
    ? disponibilidadDiaria.dias.reduce((s, d) => s + d.pct, 0) / disponibilidadDiaria.dias.length
    : null

  // Switch "Resaltar solo fallas" — se recuerda por navegador/monitor (localStorage)
  const [resaltarSoloFallas, setResaltarSoloFallas] = useState(() => {
    try { return localStorage.getItem('muro_resaltar_solo_fallas') !== '0' } catch { return true }
  })
  const toggleResaltar = () => setResaltarSoloFallas(v => {
    const next = !v
    try { localStorage.setItem('muro_resaltar_solo_fallas', next ? '1' : '0') } catch { /* noop */ }
    return next
  })

  // Datos que NO llegan por SignalR (a diferencia del estado de red de
  // useLiveDashboard, que se actualiza solo con cada ping) — hay que refrescarlos
  // por polling propio. La pantalla de muro queda abierta horas, así que no basta
  // con cargarlos una sola vez al montar.
  useEffect(() => {
    const cargar = () => {
      api.incidentes({ soloAbiertos: true, pageSize: 100 }).then(r => setIncidentesAbiertos(r.items)).catch(() => {})
      api.incidentesResumen(7).then(r => setMttrMin(r.mttrMin ?? null)).catch(() => {})
      api.disponibilidadDiaria(30).then(setDisponibilidadDiaria).catch(() => {})
    }
    cargar()
    const id = setInterval(cargar, 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  // Vías/DAC — % discrepancias sobre tránsitos de las últimas 24h. Se pide aparte,
  // cada 1h: es una ventana que se mueve hora a hora, no tiene sentido pedirla más
  // seguido, y es una consulta más pesada (agrupa transitos vs disjus) que el resto.
  useEffect(() => {
    const cargar = () => { api.discrepanciasVias('24h').then(setVias).catch(() => {}) }
    cargar()
    const id = setInterval(cargar, 60 * 60_000)
    return () => clearInterval(id)
  }, [])

  // Vías indexadas por "ESTACION|via" — % y tránsitos de las últimas 24h
  const viasPorVia = useMemo(() => {
    const m = new Map<string, ViaConteo>()
    for (const v of vias) m.set(`${v.estacion}|${v.via}`, v)
    return m
  }, [vias])

  // Solo las que el criterio de severidad marca fuera de parámetro — para el KPI
  const viasCriticas = useMemo(() =>
    vias
      .map(v => ({ ...v, severidad: severidadDac(v.pct, v.totalTransitos) }))
      .filter(v => v.severidad !== 'up'),
    [vias])

  const estaciones = useMemo(() => {
    if (!data) return []
    return [...data.estaciones].sort((a, b) =>
      ORDEN_ESTACIONES.indexOf(a.nombre) - ORDEN_ESTACIONES.indexOf(b.nombre))
  }, [data])

  // ── Matriz: filas por tipo × columnas por vía, más fila PMV ──
  const matriz = useMemo(() => estaciones.map(est => {
    const clave = claveDiscrepancias(est.nombre)
    const viasNum = est.vias
      .filter(v => /^\d+$/.test(v.numero))
      .sort((a, b) => Number(a.numero) - Number(b.numero))
    const pmvVias = est.vias.filter(v => v.numero === 'NOR' || v.numero === 'SUR')

    // PC vía / PC OCR / Display / Cámara OCR / Cámara valid. — solo estado de red
    // (¿responde?). El DAC (¿clasifica bien?) es una fila aparte más abajo: son
    // dos preguntas distintas y un PC vía puede estar UP y aun así generar mucha
    // discrepancia si el sensor DAC está mal calibrado.
    const filas: Chip[][] = FILAS_TIPO.map(({ tipo }) =>
      viasNum.map(via => {
        const eq = via.equipos.find(e => e.tipoNombre === tipo)
        if (!eq) return chipDe('na', via.numero, resaltarSoloFallas, `${tipo} ${via.numero} — no instalado`)
        // Deshabilitado (existe pero no entra al monitoreo) es distinto de "no instalado" —
        // mismo tratamiento visual apagado que usa EquipoChip.tsx en el Dashboard, pero
        // con su propio tooltip para que no se confunda con un equipo que no existe.
        if (!eq.monitorear) return chipDe('na', via.numero, resaltarSoloFallas, `${eq.nombre} — deshabilitado (no se monitorea)`)
        return chipDe(eq.ultimoEstado === 'DOWN' ? 'down' : 'up', via.numero, resaltarSoloFallas, tooltipEquipo(eq),
          () => setSelectedEquipo(eq), transiciones.get(eq.id))
      }))

    // DAC — es un "equipo" más (tipo_equipo DAC, uno por vía, se activa/desactiva
    // desde Admin → Equipos igual que cualquier otro). No se pinguea (monitorear=0):
    // su color sale del % de discrepancia sobre tránsitos de las últimas 24h, con
    // un mínimo de tránsitos exigido (ver severidadDac) para no alarmar por vías
    // alternas de tráfico bajo.
    const dacFila: Chip[] = viasNum.map(via => {
      const eqDac = via.equipos.find(e => e.tipoNombre === 'DAC')
      if (!eqDac) return chipDe('na', via.numero, resaltarSoloFallas, `DAC vía ${via.numero} — no instalado`)
      const v = viasPorVia.get(`${clave}|${via.numero}`)
      if (!v) return chipDe('na', via.numero, resaltarSoloFallas, `DAC vía ${via.numero} — sin tránsito en las últimas 24h`)
      const txt = `${Math.round(v.pct)}%`
      const title = `DAC vía ${via.numero} — ${v.pct.toFixed(1)}% discrepancia (${v.total}/${v.totalTransitos} tránsitos, 24h)`
      return chipDe(severidadDac(v.pct, v.totalTransitos), txt, resaltarSoloFallas, title)
    })
    filas.push(dacFila)

    const pmvFila: Chip[] = pmvVias.map(via => {
      const eq = via.equipos.find(e => e.tipoNombre === 'PMV')
      const txt = via.numero === 'NOR' ? 'N' : 'S'
      if (!eq) return chipDe('na', txt, resaltarSoloFallas, `PMV ${txt} — no instalado`)
      if (!eq.monitorear) return chipDe('na', txt, resaltarSoloFallas, `${eq.nombre} — deshabilitado (no se monitorea)`)
      return chipDe(eq.ultimoEstado === 'DOWN' ? 'down' : 'up', txt, resaltarSoloFallas, tooltipEquipo(eq),
        () => setSelectedEquipo(eq), transiciones.get(eq.id))
    })
    while (pmvFila.length < 8) pmvFila.push(chipDe('blank', '', resaltarSoloFallas, ''))
    filas.push(pmvFila)

    const latencias = est.vias.flatMap(v => v.equipos).map(e => e.latenciaMs).filter((n): n is number => n != null)
    const latAvg = latencias.length ? Math.round(latencias.reduce((s, n) => s + n, 0) / latencias.length) : null

    return {
      nombre: est.nombre.toUpperCase(),
      ratio: `${est.up}/${est.total}`,
      completo: est.up === est.total,
      latencia: latAvg,
      latMin: latencias.length ? Math.min(...latencias) : null,
      latMax: latencias.length ? Math.max(...latencias) : null,
      filas,
    }
  }), [estaciones, viasPorVia, resaltarSoloFallas, transiciones])

  // ── KPIs ──
  const kpis = data?.kpis
  const degradadosCount = viasCriticas.length

  // Equipos actualmente monitoreados — un incidente puede seguir "abierto" en la BD
  // aunque alguien haya desactivado el monitoreo de ese equipo después; no debe
  // seguir generando alertas en la cola si ya no se está vigilando.
  const equipoMonitoreado = useMemo(() => {
    const s = new Set<number>()
    if (data) for (const est of data.estaciones) for (const via of est.vias) for (const eq of via.equipos)
      if (eq.monitorear) s.add(eq.id)
    return s
  }, [data])

  // ── Cola "Requieren atención": incidentes de red + vías funcionales fuera de parámetro ──
  const colaRed = [...incidentesAbiertos]
    .filter(inc => equipoMonitoreado.has(inc.equipoId))
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
    .map(inc => ({
      severidad: 'critico' as const,
      titulo: `${inc.equipoNombre} · ${inc.estacion}`,
      causa: inc.causa ?? 'sin heartbeat',
      duracion: fmtDur((Date.now() - new Date(inc.inicio).getTime()) / 60000),
      key: `inc-${inc.id}`,
    }))
  const colaFuncional = [...viasCriticas]
    .sort((a, b) => b.pct - a.pct)
    .map(v => ({
      severidad: v.severidad === 'down' ? 'critico' as const : 'degradado' as const,
      titulo: `DAC vía ${v.via} · ${v.estacion}`,
      causa: `${v.pct.toFixed(1)}% de discrepancia (${v.total}/${v.totalTransitos} tránsitos, 24h)`,
      duracion: '—', // sin timestamp de transición persistido — no se puede calcular antigüedad real
      key: `via-${v.estacion}-${v.via}`,
    }))
  const cola = [...colaRed, ...colaFuncional]
  const colaVisible = cola.slice(0, 4)

  // ── Salud de la red: latencia agregada por estación, ascendente ──
  const redOrdenada = [...matriz]
    .filter(e => e.latencia != null)
    .sort((a, b) => (a.latencia ?? 0) - (b.latencia ?? 0))
  const maxRed = redOrdenada.length ? Math.max(...redOrdenada.map(e => e.latencia ?? 0)) : 0

  if (!data) return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d13', color: 'oklch(0.60 0.015 265)', fontFamily: 'var(--app-font)' }}>
      Cargando…
    </div>
  )

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d13', overflow: 'hidden' }}>
    <div style={{
      width: 1920, height: 1080, flex: '0 0 auto', transform: `scale(${escala})`,
      boxSizing: 'border-box', padding: '28px 30px',
      display: 'flex', flexDirection: 'column', gap: 20,
      fontFamily: 'var(--app-font)', color: 'oklch(0.96 0.004 265)', overflow: 'hidden',
      backgroundColor: '#0a0d13',
      backgroundImage: [
        'radial-gradient(1100px 620px at 12% -12%, oklch(0.30 0.055 250 / 0.55), transparent 65%)',
        'radial-gradient(900px 560px at 92% 8%, oklch(0.28 0.05 190 / 0.34), transparent 62%)',
        'linear-gradient(180deg, oklch(0.165 0.018 262) 0%, oklch(0.112 0.014 262) 100%)',
      ].join(', '),
    }}>
      <style>{`
        @keyframes breathe { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.45; transform:scale(.86); } }
        @keyframes blinkDown { 0%,100% { opacity:1; } 50% { opacity:.55; } }
        @keyframes latidoRapido { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.65; transform:scale(0.93); } }
        .noc-chip { transition: transform .12s ease, filter .12s ease; }
        .noc-chip:hover { transform: scale(1.12); filter: brightness(1.15); z-index: 5; }
        .noc-menu-item:hover { background: oklch(1 0 0 / 0.08); }
      `}</style>

      {/* ── Header ── */}
      <div style={{ height: 64, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src={logo} alt="Pulso Vial" style={{ height: 36, width: 'auto', display: 'block' }} />
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'oklch(0.45 0.02 265)' }} />
          <div style={{ fontSize: 25, fontWeight: 500, letterSpacing: '-0.01em', color: 'oklch(0.90 0.006 265)' }}>Centro de operaciones</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 15px 7px 12px', borderRadius: 999, background: `${ALEATICA.verde}29`, boxShadow: `inset 0 0 0 1px ${ALEATICA.verde}47` }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: ALEATICA.verde, animation: 'breathe 2.6s ease-in-out infinite' }} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.04em', color: ALEATICA.lima }}>EN VIVO</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.60 0.015 265)', letterSpacing: '0.02em' }}>
            5 estaciones · {kpis?.total ?? '—'} equipos · red MPLS
          </div>
          <div style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'oklch(0.95 0.004 265)' }}>{reloj}</div>

          {/* Menú hacia el resto de la app — el muro no tiene el NavBar normal */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuAbierto(v => !v)} aria-label="Menú" style={{
              width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: menuAbierto ? 'oklch(1 0 0 / 0.10)' : 'transparent',
              color: 'oklch(0.75 0.015 265)', fontSize: 20, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>☰</button>
            {menuAbierto && (
              <>
                <div onClick={() => setMenuAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: 44, right: 0, zIndex: 41, minWidth: 190, borderRadius: 12,
                  padding: 8, background: 'oklch(0.185 0.016 262 / 0.98)',
                  boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.45)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {MENU_LINKS.map(l => (
                    <Link key={l.to} to={l.to} onClick={() => setMenuAbierto(false)} className="noc-menu-item" style={{
                      display: 'block', padding: '9px 14px', borderRadius: 8, textDecoration: 'none',
                      fontSize: 15, fontWeight: 500, color: 'oklch(0.85 0.006 265)',
                    }}>{l.label}</Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Banda KPI ── */}
      <div style={{ height: 124, flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>

        <div style={{ boxSizing: 'border-box', borderRadius: 22, padding: '16px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: `linear-gradient(160deg, ${ALEATICA.verde}4D 0%, oklch(0.22 0.025 250 / 0.55) 100%)`, boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: ALEATICA.verde }}>Operativos</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 46, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: ALEATICA.verdeCrema }}>{kpis?.ups ?? '—'}</div>
            <div style={{ fontSize: 21, fontWeight: 400, color: 'oklch(0.62 0.03 200)' }}>de {kpis?.total ?? '—'}</div>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'oklch(1 0 0 / 0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${kpis && kpis.total > 0 ? Math.round(kpis.ups / kpis.total * 100) : 0}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${ALEATICA.musgo}, ${ALEATICA.verde})`, boxShadow: `0 0 12px ${ALEATICA.verde}8C` }} />
          </div>
        </div>

        <div style={{ boxSizing: 'border-box', borderRadius: 22, padding: '16px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'linear-gradient(160deg, oklch(0.36 0.10 15 / 0.55) 0%, oklch(0.22 0.03 265 / 0.55) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.72 0.17 15)', animation: 'breathe 1.8s ease-in-out infinite' }} />
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.80 0.10 15)' }}>Caídos</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 46, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'oklch(0.85 0.13 15)' }}>{kpis?.downs ?? '—'}</div>
            <div style={{ fontSize: 19, fontWeight: 400, color: 'oklch(0.66 0.05 15)' }}>
              {kpis?.downs ? 'equipos sin respuesta' : ''}
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'oklch(0.62 0.035 15)' }}>
            {colaRed.length > 0 ? `más antiguo: ${colaRed[0].duracion}` : 'sin caídas abiertas'}
          </div>
        </div>

        <div style={{ boxSizing: 'border-box', borderRadius: 22, padding: '16px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: `linear-gradient(160deg, ${ALEATICA.naranja}45 0%, oklch(0.22 0.03 265 / 0.55) 100%)`, boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: ALEATICA.naranja }}>Degradados</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 46, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#FCC067' }}>{degradadosCount}</div>
            <div style={{ fontSize: 19, fontWeight: 400, color: `${ALEATICA.naranja}B3` }}>fuera de parámetro</div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: `${ALEATICA.naranja}99` }}>
            {degradadosCount > 0 ? `${degradadosCount} vía${degradadosCount > 1 ? 's' : ''} con DAC degradado` : 'Todo dentro de parámetro'}
          </div>
        </div>

        <div style={{ boxSizing: 'border-box', borderRadius: 22, padding: '16px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: `linear-gradient(160deg, ${ALEATICA.azul}40 0%, oklch(0.21 0.022 265 / 0.55) 100%)`, boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.09), 0 12px 34px oklch(0 0 0 / 0.30)' }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: ALEATICA.azul }}>Disponibilidad 30 d</div>
          <div style={{ fontSize: 46, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#8FE3FA' }}>
            {disponibilidad30d != null ? disponibilidad30d.toFixed(2) : '—'}<span style={{ fontSize: 26 }}>%</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: `${ALEATICA.azul}B3` }}>
            monitoreo de red · últimos 30 días
          </div>
        </div>
      </div>

      {/* ── Matriz de equipos ── */}
      <div style={{ height: 376, flex: '0 0 auto', boxSizing: 'border-box', borderRadius: 24, padding: '10px 18px', overflow: 'hidden', background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / 0.92) 0%, oklch(0.185 0.016 262 / 0.92) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.32)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 30, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Equipos en campo</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'oklch(0.55 0.015 265)' }}>
              {resaltarSoloFallas ? 'el color aparece solo donde hay que mirar' : 'todos los estados a color'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 15, fontWeight: 500, color: 'oklch(0.62 0.015 265)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: 5, background: resaltarSoloFallas ? 'oklch(0.32 0.03 145 / 0.85)' : `linear-gradient(180deg, ${ALEATICA.verde}, ${ALEATICA.musgo})` }} />
              operativo
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 14, height: 14, borderRadius: 5, background: `linear-gradient(180deg, #FCC067, ${ALEATICA.naranja})` }} />degradado</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 14, height: 14, borderRadius: 5, background: 'linear-gradient(180deg, oklch(0.66 0.17 15), oklch(0.54 0.16 15))' }} />caído</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 14, height: 14, borderRadius: 5, boxShadow: 'inset 0 0 0 1px oklch(0.40 0.012 265)' }} />no instalado</div>

            {/* Switch "Resaltar solo fallas" */}
            <div onClick={toggleResaltar} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', paddingLeft: 18, borderLeft: '1px solid oklch(0.30 0.012 265)' }}>
              <span>Resaltar solo fallas</span>
              <div style={{
                width: 34, height: 19, borderRadius: 999, flex: '0 0 auto', position: 'relative',
                background: resaltarSoloFallas ? `${ALEATICA.verde}55` : 'oklch(1 0 0 / 0.10)',
                boxShadow: resaltarSoloFallas ? `inset 0 0 0 1px ${ALEATICA.verde}80` : 'inset 0 0 0 1px oklch(0.40 0.012 265)',
                transition: 'background 0.15s ease',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: resaltarSoloFallas ? 17 : 2, width: 15, height: 15, borderRadius: '50%',
                  background: resaltarSoloFallas ? ALEATICA.verde : 'oklch(0.55 0.015 265)',
                  transition: 'left 0.15s ease',
                }} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: `128px repeat(${matriz.length || 5}, 1fr)`, gap: '8px 12px', paddingTop: 8 }}>
          <div />
          {matriz.map(est => (
            <div key={est.nombre} style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
              <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '0.02em' }}>{est.nombre}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', padding: '3px 9px', borderRadius: 999,
                  color: est.completo ? 'oklch(0.82 0.09 175)' : 'oklch(0.84 0.13 15)',
                  background: est.completo ? 'oklch(0.50 0.09 175 / 0.18)' : 'oklch(0.55 0.14 15 / 0.20)',
                }}>{est.ratio}</span>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.50 0.015 265)' }}>{est.latencia != null ? `${est.latencia} ms` : '—'}</span>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 }}>
            {[...FILAS_TIPO.map(f => f.label), 'DAC', 'PMV'].map(label => (
              <div key={label} style={{
                height: 30, display: 'flex', alignItems: 'center', fontSize: 16,
                fontWeight: label === 'DAC' ? 700 : 500,
                color: label === 'DAC' ? ALEATICA.naranja : 'oklch(0.64 0.015 265)',
              }}>{label}</div>
            ))}
          </div>

          {matriz.map(est => (
            <div key={est.nombre} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 }}>
              {est.filas.map((fila, fi) => (
                <div key={fi} style={{ height: 30, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
                  {fila.map((chip, ci) => (
                    <div key={ci} title={chip.title || undefined} onClick={chip.onClick}
                      className={chip.estado !== 'blank' ? 'noc-chip' : undefined} style={{
                      width: '100%', height: '100%', boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9,
                      fontSize: 16, fontWeight: 600, letterSpacing: '0.01em', fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap', overflow: 'hidden', minHeight: 0, minWidth: 0,
                      background: chip.bg, color: chip.fg, boxShadow: chip.sh,
                      cursor: chip.onClick ? 'pointer' : 'default',
                      animation: chip.transicion ? 'latidoRapido 0.5s ease-in-out infinite'
                        : chip.estado === 'down' ? 'blinkDown 2s ease-in-out infinite' : undefined,
                    }}>{chip.txt}</div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Fila inferior ── */}
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: '1.28fr 1fr 1fr', gap: 18 }}>

        {/* A · Requieren atención */}
        <div style={{ boxSizing: 'border-box', borderRadius: 24, padding: '22px 24px', background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / 0.92) 0%, oklch(0.185 0.016 262 / 0.92) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.32)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: 30, flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Requieren atención</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'oklch(0.55 0.015 265)' }}>{cola.length} abiertos · más antiguos primero</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minHeight: 0 }}>
            {colaVisible.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, color: 'oklch(0.55 0.015 265)' }}>
                Todo operativo
              </div>
            ) : colaVisible.map(ev => {
              const crit = ev.severidad === 'critico'
              return (
                <div key={ev.key} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center', padding: '8px 16px', borderRadius: 14,
                  background: crit
                    ? 'linear-gradient(100deg, oklch(0.34 0.085 15 / 0.42), oklch(0.26 0.04 15 / 0.22))'
                    : 'linear-gradient(100deg, oklch(0.36 0.075 62 / 0.34), oklch(0.26 0.035 62 / 0.18))',
                  boxShadow: crit
                    ? 'inset 0 0 0 1px oklch(0.60 0.12 15 / 0.22)'
                    : 'inset 0 0 0 1px oklch(0.62 0.10 62 / 0.20)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                    <div style={{
                      width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto',
                      background: crit ? 'oklch(0.72 0.17 15)' : 'oklch(0.82 0.13 62)',
                      boxShadow: crit ? '0 0 12px oklch(0.72 0.17 15 / 0.8)' : '0 0 12px oklch(0.82 0.13 62 / 0.7)',
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>{ev.titulo}</div>
                      <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: 'oklch(0.66 0.02 265)' }}>{ev.causa}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: crit ? 'oklch(0.82 0.12 15)' : 'oklch(0.86 0.11 62)' }}>{ev.duracion}</div>
                </div>
              )
            })}

            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 16, fontWeight: 500, color: 'oklch(0.52 0.015 265)' }}>
              <span>{Math.max(0, cola.length - colaVisible.length)} eventos más en la cola</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>MTTR {mttrMin != null ? fmtDur(mttrMin) : '—'}</span>
            </div>
          </div>
        </div>

        {/* B · Salud de la red */}
        <div style={{ boxSizing: 'border-box', borderRadius: 24, padding: '22px 24px', background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / 0.92) 0%, oklch(0.185 0.016 262 / 0.92) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.32)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: 30, flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Salud de la red</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'oklch(0.55 0.015 265)' }}>umbral 40 ms</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 auto' }}>
            {redOrdenada.map(e => {
              const alto = (e.latencia ?? 0) >= 24
              return (
                <div key={e.nombre}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.25 }}>{e.nombre}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.48 0.015 265)' }}>{e.latMin}–{e.latMax} ms</span>
                      <span style={{ fontSize: 19, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: alto ? 'oklch(0.86 0.12 62)' : 'oklch(0.84 0.11 175)' }}>{e.latencia} ms</span>
                    </div>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'oklch(1 0 0 / 0.07)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, Math.round((e.latencia ?? 0) / 40 * 100))}%`, height: '100%', borderRadius: 999,
                      background: alto ? 'linear-gradient(90deg, oklch(0.70 0.10 90), oklch(0.84 0.13 62))' : 'linear-gradient(90deg, oklch(0.68 0.10 200), oklch(0.84 0.12 175))',
                      boxShadow: `0 0 10px ${alto ? 'oklch(0.84 0.12 62 / 0.45)' : 'oklch(0.82 0.11 175 / 0.45)'}`,
                    }} />
                  </div>
                </div>
              )
            })}

            <div style={{ marginTop: 'auto', fontSize: 16, fontWeight: 500, lineHeight: 1.4, color: 'oklch(0.60 0.018 265)' }}>
              {maxRed > 0 && maxRed < 40
                ? <>Nadie pasa del {Math.round(maxRed / 40 * 100)}% del umbral. <span style={{ color: 'oklch(0.90 0.006 265)' }}>La red no explica los degradados.</span></>
                : 'Latencia dentro de parámetro en todas las estaciones.'}
            </div>
          </div>
        </div>

        {/* C · Últimos 30 días — disponibilidad real de monitoreo de red, hasta ayer */}
        <div style={{ boxSizing: 'border-box', borderRadius: 24, padding: '22px 24px', background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / 0.92) 0%, oklch(0.185 0.016 262 / 0.92) 100%)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.32)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: 30, flex: '0 0 auto', display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Últimos 30 días</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'oklch(0.55 0.015 265)' }}>% operativo diario de red · hasta ayer</div>
          </div>

          <div style={{ position: 'relative', height: 100, flex: '0 0 auto' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${disponibilidadDiaria?.dias.length || 30}, 1fr)`, gap: 4, alignItems: 'end', zIndex: 1 }}>
              {(disponibilidadDiaria?.dias ?? []).map((d, i, arr) => {
                // Se amplifica la escala (base 80%) para que las variaciones reales
                // (normalmente entre 90-100%) se vean, en vez de barras casi idénticas.
                const alto = Math.max(4, Math.min(100, (d.pct - 80) / 20 * 100))
                const esUltimo = i === arr.length - 1
                const color = d.pct < 90
                  ? 'linear-gradient(180deg, oklch(0.68 0.16 15), oklch(0.54 0.15 15))'
                  : d.pct < 97
                    ? `linear-gradient(180deg, #FCC067, ${ALEATICA.naranja})`
                    : esUltimo
                      ? `linear-gradient(180deg, ${ALEATICA.verde}, ${ALEATICA.musgo})`
                      : 'oklch(0.46 0.055 190 / 0.75)'
                return <div key={d.fecha} title={`${d.fecha} — ${d.pct}%`} style={{ height: `${alto}%`, borderRadius: 4, background: color }} />
              })}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 500, color: 'oklch(0.45 0.015 265)', marginTop: 8, marginBottom: 12 }}>
            <span>hace 30 días</span><span style={{ color: 'oklch(0.62 0.015 265)' }}>ayer</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ borderRadius: 14, padding: '9px 14px', background: 'oklch(1 0 0 / 0.045)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.58 0.015 265)' }}>MTBF</div>
              <div style={{ fontSize: 25, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                {disponibilidadDiaria ? `${disponibilidadDiaria.mtbfDias} d` : '—'}
              </div>
            </div>
            <div style={{ borderRadius: 14, padding: '9px 14px', background: 'oklch(1 0 0 / 0.045)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.58 0.015 265)' }}>Caídas</div>
              <div style={{ fontSize: 25, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                {disponibilidadDiaria ? disponibilidadDiaria.caidas : '—'}
              </div>
            </div>
          </div>

          {disponibilidadDiaria && (() => {
            const peor = disponibilidadDiaria.dias.reduce((a, b) => (a.pct <= b.pct ? a : b))
            const critico = peor.pct < 95
            return (
              <div style={{
                marginTop: 'auto', borderRadius: 14, padding: '11px 15px',
                background: critico
                  ? 'linear-gradient(100deg, oklch(0.34 0.085 15 / 0.38), oklch(0.26 0.04 15 / 0.20))'
                  : 'oklch(1 0 0 / 0.045)',
                boxShadow: critico ? 'inset 0 0 0 1px oklch(0.60 0.12 15 / 0.22)' : 'none',
              }}>
                <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, color: critico ? 'oklch(0.84 0.12 15)' : 'oklch(0.90 0.006 265)' }}>
                  Peor día: {peor.fecha} ({peor.pct}%)
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: 'oklch(0.68 0.02 265)' }}>
                  {disponibilidadDiaria.caidas} caídas en 30 días · MTBF {disponibilidadDiaria.mtbfDias} d
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      <EquipoModal equipo={selectedEquipo} onClose={() => setSelectedEquipo(null)} />
    </div>
    </div>
  )
}
