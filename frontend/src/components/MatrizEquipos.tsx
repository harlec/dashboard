import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type EquipoLive, type EstacionLive, type ViaConteo } from '../api/client'
import { severidadDac as severidadDacBase } from '../lib/dac'

// Matriz "Equipos en campo" del Muro NOC (NocMuro.tsx) como componente
// autocontenido para la página Vías: misma forma (estaciones × tipo de equipo ×
// vía + fila DAC + fila PMV), mismos colores y el mismo switch "Resaltar solo
// fallas" (misma clave de localStorage, así que la preferencia se comparte).
// Pide el % de discrepancia DAC por su cuenta (24 h, refresco cada hora).

const ALEATICA = { verde: '#72BF44', musgo: '#0DB14B', naranja: '#F99B1C' } as const

interface ChipStyle { bg: string; fg: string; sh: string }
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
const TRANSICION_CAYENDO: ChipStyle = {
  bg: `linear-gradient(180deg, #FCC067, ${ALEATICA.naranja})`, fg: '#3A2205',
  sh: `0 0 22px ${ALEATICA.naranja}B0, inset 0 1px 0 oklch(1 0 0 / 0.40)`,
}
const TRANSICION_SUBIENDO: ChipStyle = {
  bg: `linear-gradient(180deg, #A6F08A, ${ALEATICA.verde})`, fg: '#0B2E12',
  sh: `0 0 22px ${ALEATICA.verde}B0, inset 0 1px 0 oklch(1 0 0 / 0.45)`,
}

type Estado = 'up' | 'degraded' | 'down' | 'na' | 'blank'
type Transicion = 'subiendo' | 'cayendo'
interface Chip extends ChipStyle { txt: string; title: string; estado: Estado; onClick?: () => void; transicion?: Transicion }

const chipDe = (
  estado: Estado, soloFallas: boolean, txt: string, title: string, onClick?: () => void, transicion?: Transicion,
): Chip => ({
  txt, title, estado, onClick, transicion,
  ...(transicion === 'cayendo' ? TRANSICION_CAYENDO
    : transicion === 'subiendo' ? TRANSICION_SUBIENDO
    : estado === 'up' ? (soloFallas ? UP_EXCEPCION : UP_COLOREADO) : CHIP_ESTATICO[estado]),
})

const ORDEN_ESTACIONES = ['Fortaleza', 'Huarmey', 'KM 402', 'Santa', 'Viru']
const claveDiscrepancias = (nombre: string) => {
  const up = nombre.toUpperCase()
  return up.startsWith('KM ') ? up.slice(3) : up
}

const FILAS_TIPO = [
  { tipo: 'PC Via', label: 'PC vía' },
  { tipo: 'PC OCR', label: 'PC OCR' },
  { tipo: 'Display Tarifario', label: 'Display tarif.' },
  { tipo: 'Camara OCR', label: 'Cámara OCR' },
  { tipo: 'Cámara Validación', label: 'Cámara valid.' },
] as const

const fmtDur = (min: number) => {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
const tooltipEquipo = (eq: { nombre: string; ultimoEstado?: string; latenciaMs?: number; incMin?: number }) => {
  const estado = eq.ultimoEstado ?? 'Sin datos'
  const lat = eq.latenciaMs == null ? '' : eq.ultimoEstado === 'DOWN'
    ? ` · ${Math.round(eq.latenciaMs)}ms (previo a caer)` : ` · ${Math.round(eq.latenciaMs)}ms`
  const inc = eq.incMin != null ? ` · Inc: ${fmtDur(eq.incMin)}` : ''
  return `${eq.nombre} — ${estado}${lat}${inc}`
}
const severidadDac = (v: ViaConteo): 'up' | 'degraded' | 'down' => {
  const s = severidadDacBase(v)
  return s === 'critico' ? 'down' : s === 'warn' ? 'degraded' : 'up'
}

interface Props {
  estaciones: EstacionLive[]
  onEquipoClick: (eq: EquipoLive) => void
  /** Alto de cada fila de chips (px del lienzo de 1920). El muro usa 30. */
  rowH?: number
}

export function MatrizEquipos({ estaciones, onEquipoClick, rowH = 32 }: Props) {
  const [vias, setVias] = useState<ViaConteo[]>([])
  const [soloFallas, setSoloFallas] = useState(() => {
    try { return localStorage.getItem('muro_resaltar_solo_fallas') !== '0' } catch { return true }
  })
  const toggle = () => setSoloFallas(v => {
    const next = !v
    try { localStorage.setItem('muro_resaltar_solo_fallas', next ? '1' : '0') } catch { /* noop */ }
    return next
  })

  useEffect(() => {
    const cargar = () => { api.discrepanciasVias('24h').then(setVias).catch(() => {}) }
    cargar()
    const id = setInterval(cargar, 60 * 60_000)
    return () => clearInterval(id)
  }, [])
  const viasPorVia = useMemo(() => {
    const m = new Map<string, ViaConteo>()
    for (const v of vias) m.set(`${v.estacion}|${v.via}`, v)
    return m
  }, [vias])

  // Transición de ~5 s tras un cambio real de estado (mismo comportamiento del muro)
  const [transiciones, setTransiciones] = useState<Map<number, Transicion>>(new Map())
  const previoRef = useRef<Map<number, string | undefined>>(new Map())
  const timeoutsRef = useRef<number[]>([])
  useEffect(() => {
    const previos = previoRef.current
    const nuevas: [number, Transicion][] = []
    for (const est of estaciones) for (const via of est.vias) for (const eq of via.equipos) {
      const previo = previos.get(eq.id)
      if (eq.monitorear && previo !== undefined && previo !== eq.ultimoEstado
        && (eq.ultimoEstado === 'UP' || eq.ultimoEstado === 'DOWN')) {
        nuevas.push([eq.id, eq.ultimoEstado === 'UP' ? 'subiendo' : 'cayendo'])
      }
      previos.set(eq.id, eq.ultimoEstado)
    }
    if (nuevas.length === 0) return
    setTransiciones(prev => {
      const next = new Map(prev)
      for (const [id, t] of nuevas) next.set(id, t)
      return next
    })
    timeoutsRef.current.push(window.setTimeout(() => {
      setTransiciones(prev => {
        const next = new Map(prev)
        for (const [id] of nuevas) next.delete(id)
        return next
      })
    }, 5000))
  }, [estaciones])
  useEffect(() => () => { timeoutsRef.current.forEach(id => window.clearTimeout(id)) }, [])

  const matriz = useMemo(() => [...estaciones]
    .sort((a, b) => ORDEN_ESTACIONES.indexOf(a.nombre) - ORDEN_ESTACIONES.indexOf(b.nombre))
    .map(est => {
      const clave = claveDiscrepancias(est.nombre)
      const viasNum = est.vias.filter(v => /^\d+$/.test(v.numero)).sort((a, b) => Number(a.numero) - Number(b.numero))
      const pmvVias = est.vias.filter(v => v.numero === 'NOR' || v.numero === 'SUR')

      const filas: Chip[][] = FILAS_TIPO.map(({ tipo }) => viasNum.map(via => {
        const eq = via.equipos.find(e => e.tipoNombre === tipo)
        if (!eq) return chipDe('na', soloFallas, via.numero, `${tipo} ${via.numero} — no instalado`)
        if (!eq.monitorear) return chipDe('na', soloFallas, via.numero, `${eq.nombre} — deshabilitado (no se monitorea)`)
        return chipDe(eq.ultimoEstado === 'DOWN' ? 'down' : 'up', soloFallas, via.numero, tooltipEquipo(eq),
          () => onEquipoClick(eq), transiciones.get(eq.id))
      }))

      filas.push(viasNum.map(via => {
        const eqDac = via.equipos.find(e => e.tipoNombre === 'DAC')
        if (!eqDac) return chipDe('na', soloFallas, via.numero, `DAC vía ${via.numero} — no instalado`)
        const v = viasPorVia.get(`${clave}|${via.numero}`)
        if (!v) return chipDe('na', soloFallas, via.numero, `DAC vía ${via.numero} — sin tránsito en las últimas 24h`)
        return chipDe(severidadDac(v), soloFallas, `${Math.round(v.pct)}%`,
          `DAC vía ${via.numero} — ${v.pct.toFixed(1)}% discrepancia (${v.total}/${v.totalTransitos} tránsitos, 24h)`)
      }))

      const pmvFila: Chip[] = pmvVias.map(via => {
        const eq = via.equipos.find(e => e.tipoNombre === 'PMV')
        const txt = via.numero === 'NOR' ? 'N' : 'S'
        if (!eq) return chipDe('na', soloFallas, txt, `PMV ${txt} — no instalado`)
        if (!eq.monitorear) return chipDe('na', soloFallas, txt, `${eq.nombre} — deshabilitado (no se monitorea)`)
        return chipDe(eq.ultimoEstado === 'DOWN' ? 'down' : 'up', soloFallas, txt, tooltipEquipo(eq),
          () => onEquipoClick(eq), transiciones.get(eq.id))
      })
      while (pmvFila.length < 8) pmvFila.push(chipDe('blank', soloFallas, '', ''))
      filas.push(pmvFila)

      const lats = est.vias.flatMap(v => v.equipos).map(e => e.latenciaMs).filter((n): n is number => n != null)
      return {
        nombre: est.nombre.toUpperCase(),
        ratio: `${est.up}/${est.total}`,
        completo: est.up === est.total,
        latencia: lats.length ? Math.round(lats.reduce((s, n) => s + n, 0) / lats.length) : null,
        filas,
      }
    }), [estaciones, viasPorVia, soloFallas, transiciones, onEquipoClick])

  const leyenda = (color: string, txt: string, borde?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 16, height: 16, borderRadius: 5, background: borde ? undefined : color, boxShadow: borde ? 'inset 0 0 0 1px oklch(0.40 0.012 265)' : undefined }} />
      {txt}
    </div>
  )

  return (
    <div style={{
      boxSizing: 'border-box', borderRadius: 24, padding: '16px 22px 22px',
      background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / 0.92) 0%, oklch(0.185 0.016 262 / 0.92) 100%)',
      boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.32)',
    }}>
      <style>{`
        @keyframes blinkDown { 0%,100% { opacity:1; } 50% { opacity:.55; } }
        @keyframes latidoRapido { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.65; transform:scale(0.93); } }
        .noc-chip { transition: transform .12s ease, filter .12s ease; }
        .noc-chip:hover { transform: scale(1.12); filter: brightness(1.15); z-index: 5; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em' }}>Equipos en campo</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'oklch(0.55 0.015 265)' }}>
            {soloFallas ? 'el color aparece solo donde hay que mirar' : 'todos los estados a color'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 15, fontWeight: 500, color: 'oklch(0.62 0.015 265)' }}>
          {leyenda(soloFallas ? 'oklch(0.32 0.03 145 / 0.85)' : `linear-gradient(180deg, ${ALEATICA.verde}, ${ALEATICA.musgo})`, 'operativo')}
          {leyenda(`linear-gradient(180deg, #FCC067, ${ALEATICA.naranja})`, 'degradado')}
          {leyenda('linear-gradient(180deg, oklch(0.66 0.17 15), oklch(0.54 0.16 15))', 'caído')}
          {leyenda('', 'no instalado', true)}
          <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', paddingLeft: 18, borderLeft: '1px solid oklch(0.30 0.012 265)' }}>
            <span>Resaltar solo fallas</span>
            <div style={{
              width: 38, height: 21, borderRadius: 999, flex: '0 0 auto', position: 'relative',
              background: soloFallas ? `${ALEATICA.verde}55` : 'oklch(1 0 0 / 0.10)',
              boxShadow: soloFallas ? `inset 0 0 0 1px ${ALEATICA.verde}80` : 'inset 0 0 0 1px oklch(0.40 0.012 265)',
              transition: 'background 0.15s ease',
            }}>
              <div style={{
                position: 'absolute', top: 2, left: soloFallas ? 19 : 2, width: 17, height: 17, borderRadius: '50%',
                background: soloFallas ? ALEATICA.verde : 'oklch(0.55 0.015 265)', transition: 'left 0.15s ease',
              }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${matriz.length || 5}, 1fr)`, gap: '8px 14px', paddingTop: 8 }}>
        <div />
        {matriz.map(est => (
          <div key={est.nombre} style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
            <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '0.02em' }}>{est.nombre}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', padding: '3px 10px', borderRadius: 999,
                color: est.completo ? 'oklch(0.82 0.09 175)' : 'oklch(0.84 0.13 15)',
                background: est.completo ? 'oklch(0.50 0.09 175 / 0.18)' : 'oklch(0.55 0.14 15 / 0.20)',
              }}>{est.ratio}</span>
              <span style={{ fontSize: 16, fontWeight: 500, color: 'oklch(0.50 0.015 265)' }}>{est.latencia != null ? `${est.latencia} ms` : '—'}</span>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 }}>
          {[...FILAS_TIPO.map(f => f.label), 'DAC', 'PMV'].map(label => (
            <div key={label} style={{
              height: rowH, display: 'flex', alignItems: 'center', fontSize: 16,
              fontWeight: label === 'DAC' ? 700 : 500,
              color: label === 'DAC' ? ALEATICA.naranja : 'oklch(0.64 0.015 265)',
            }}>{label}</div>
          ))}
        </div>

        {matriz.map(est => (
          <div key={est.nombre} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 }}>
            {est.filas.map((fila, fi) => (
              <div key={fi} style={{ height: rowH, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 7 }}>
                {fila.map((chip, ci) => (
                  <div key={ci} title={chip.title || undefined} onClick={chip.onClick}
                    className={chip.estado !== 'blank' ? 'noc-chip' : undefined} style={{
                      width: '100%', height: '100%', boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
                      fontSize: 15, fontWeight: 600, letterSpacing: '0.01em', fontVariantNumeric: 'tabular-nums',
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
  )
}
