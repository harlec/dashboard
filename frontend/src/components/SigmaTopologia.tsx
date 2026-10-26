import { useEffect, useMemo, useRef } from 'react'
import type { EstacionLive, ServicioCheckLive } from '../api/client'
import { PANEL, TEXTO } from '../lib/theme'

// Conectividad de nodos v2 (design: "SIGMA · Conectividad de nodos v2").
// Mapa estilo "ciberataque" que llena el 100% del panel: nodos y etiquetas en coordenadas %,
// enlaces en un SVG viewBox 0 0 100 100 estirado (preserveAspectRatio="none", trazos
// non-scaling-stroke) y los círculos como <div> encima, para que no se deformen en elipses.
// Radar, pings y barrido son CSS puro. Los paquetes que viajan por los enlaces se mueven con un
// único requestAnimationFrame que mide la posición sobre la curva (getPointAtLength) y la aplica
// con transform: así avanzan de forma continua y sin saltos (el dasharray con non-scaling-stroke
// se mide en píxeles de pantalla y daba tirones). Los elementos tienen keys estables, así que al
// llegar datos nuevos solo cambian color y texto — las animaciones no se reinician.
// Vive dentro de un <Card> del Dashboard (position: relative; overflow: hidden).

interface Props { estaciones: EstacionLive[]; servicioChecks?: ServicioCheckLive[]; hud?: boolean }

type Estado = 'ok' | 'degradado' | 'caido'
interface Nodo {
  id: string; nombre: string; tipo: 'peaje' | 'infra'
  x: number; y: number; lat: number | null; estado: Estado; detalle: string
}

// Mismo umbral que la tarjeta de Latencia del tablero
const UMBRAL_LAT_MS = 24
const COLOR: Record<Estado, string> = { ok: PANEL.acento, degradado: PANEL.naranja, caido: PANEL.rojo }
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

// Posiciones (en %) de los peajes conocidos; el resto de nodos toma el primer hueco libre.
const POS_PEAJE: Record<string, [number, number]> = {
  viru: [14, 30], santa: [20, 78], fortaleza: [84, 22], huarmey: [88, 60], 'km 402': [68, 86], '402': [68, 86], km402: [68, 86],
}
const HUECOS: [number, number][] = [[34, 16], [64, 14], [36, 84], [50, 6], [50, 94], [8, 52], [93, 40], [8, 12], [92, 90]]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function avgLat(est: EstacionLive): number | null {
  const lats = est.vias.flatMap(v => v.equipos).filter(e => e.monitorear && e.latenciaMs != null).map(e => e.latenciaMs!)
  if (!lats.length) return null
  return Math.round(lats.reduce((a, b) => a + b, 0) / lats.length)
}

function construirNodos(estaciones: EstacionLive[], checks: ServicioCheckLive[]): Nodo[] {
  const usados = new Set<string>()
  const key = (p: [number, number]) => `${p[0]},${p[1]}`
  const nodos: Nodo[] = []

  // Primero los que tienen posición fija, para que ningún otro nodo les ocupe el lugar
  const fija = (n: string) => POS_PEAJE[norm(n)]
  estaciones.forEach(e => { const p = fija(e.nombre); if (p) usados.add(key(p)) })
  const libre = (): [number, number] => {
    const h = HUECOS.find(p => !usados.has(key(p))) ?? [50, 50 + 40 - (usados.size % 5) * 8]
    usados.add(key(h))
    return h
  }

  estaciones.forEach(est => {
    const total = est.up + est.down
    const lat = avgLat(est)
    const estado: Estado = total > 0 && est.up === 0 ? 'caido'
      : est.down > 0 || (lat != null && lat > UMBRAL_LAT_MS) ? 'degradado' : 'ok'
    const [x, y] = fija(est.nombre) ?? libre()
    nodos.push({ id: `p-${est.id}`, nombre: est.nombre, tipo: 'peaje', x, y, lat, estado, detalle: `${est.up}/${total} equipos en línea` })
  })

  // Un nodo de infraestructura por SERVICIO (no por IP): los chequeos de un mismo servicio —p. ej. el
  // CCO físico y el virtual— se resumen en un solo punto. Todos caídos → caído; alguno caído o por
  // encima del umbral → degradado; el resto → ok. Para que dos sitios distintos no se mezclen, cada
  // sitio se da de alta como su propio servicio (Admin → Servicios).
  const grupos = new Map<number, ServicioCheckLive[]>()
  checks.filter(c => c.activo && c.monitorear).forEach(c => grupos.set(c.servicioId, [...(grupos.get(c.servicioId) ?? []), c]))
  ;[...grupos.entries()].sort((a, b) => a[0] - b[0]).forEach(([servicioId, g]) => {
    g.sort((a, b) => a.id - b.id)
    const caidos = g.filter(c => c.ultimoEstado === 'DOWN').length
    const lats = g.filter(c => c.ultimoEstado !== 'DOWN' && c.ultimaLatenciaMs != null).map(c => c.ultimaLatenciaMs!)
    const lat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null
    const estado: Estado = caidos === g.length ? 'caido' : caidos > 0 || (lat != null && lat > UMBRAL_LAT_MS) ? 'degradado' : 'ok'
    const [x, y] = libre()
    // Etiqueta corta (solo el servicio) para que no se monte con la del nodo vecino; la ubicación va en el tooltip
    const nombre = g[0].servicio?.nombre || g[0].nombre
    const ubicaciones = [...new Set(g.map(c => c.ubicacion).filter(Boolean))].join(' / ')
    const detalle = g.map(c => `${c.host} (${c.nombre}): ${c.ultimoEstado === 'DOWN' ? 'sin respuesta' : c.ultimaLatenciaMs != null ? (c.ultimaLatenciaMs === 0 ? '<1 ms' : `${c.ultimaLatenciaMs} ms`) : 'sin dato'}`).join('\n')
    nodos.push({ id: `i-${servicioId}`, nombre, tipo: 'infra', x, y, lat, estado, detalle: ubicaciones ? `${ubicaciones}\n${detalle}` : detalle })
  })
  return nodos
}

const CSS = `
@keyframes sgSpin { to { transform: rotate(360deg) } }
@keyframes sgPing { from { transform: translate(-50%,-50%) scale(.5); opacity: .9 } to { transform: translate(-50%,-50%) scale(3); opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .sg-anim { animation: none !important } }
`

export function SigmaTopologia({ estaciones, servicioChecks = [] }: Props) {
  const nodos = useMemo(() => construirNodos(estaciones, servicioChecks), [estaciones, servicioChecks])
  const peajes = nodos.filter(n => n.tipo === 'peaje').length
  const infra = nodos.length - peajes
  const enLinea = nodos.filter(n => n.estado !== 'caido').length
  const degradados = nodos.filter(n => n.estado === 'degradado').length

  // ── Paquetes: posición calculada sobre la curva, un solo bucle para todos los enlaces ──
  const rootRef = useRef<HTMLDivElement>(null)
  const tam = useRef({ w: 1, h: 1 })
  const pathRefs = useRef(new Map<string, SVGPathElement>())
  const dotRefs = useRef(new Map<string, (HTMLDivElement | null)[]>())
  const nodosRef = useRef(nodos)
  useEffect(() => { nodosRef.current = nodos }, [nodos])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const medir = () => { tam.current = { w: root.clientWidth || 1, h: root.clientHeight || 1 } }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(root)
    const t0 = performance.now()
    let raf = 0
    const colocar = (dot: HTMLDivElement | null | undefined, path: SVGPathElement, len: number, tt: number, invertir: boolean, escala: number, opMax: number) => {
      if (!dot) return
      if (tt < 0) { dot.style.opacity = '0'; return }   // la estela aún no sale del origen en este ciclo
      const f = invertir ? 1 - tt : tt
      const pt = path.getPointAtLength(f * len)
      const fade = tt < 0.1 ? tt / 0.1 : tt > 0.88 ? (1 - tt) / 0.12 : 1   // aparece y se apaga suavemente en los extremos
      dot.style.transform = `translate3d(${pt.x / 100 * tam.current.w}px, ${pt.y / 100 * tam.current.h}px, 0) translate(-50%, -50%) scale(${escala})`
      dot.style.opacity = String(Math.max(0, fade * opMax))
    }
    const frame = (now: number) => {
      const t = (now - t0) / 1000
      nodosRef.current.forEach((n, i) => {
        const path = pathRefs.current.get(n.id)
        const dots = dotRefs.current.get(n.id)
        if (!path || !dots) return
        if (n.estado === 'caido') { dots.forEach(d => { if (d) d.style.opacity = '0' }); return }
        const len = path.getTotalLength()
        const durOut = n.estado === 'degradado' ? 3.6 : 1.8 + (i % 3) * 0.5
        const durIn = 2.6 + (i % 2) * 0.8
        // Salida (hub → nodo): cabeza + 3 puntos de estela
        const pOut = (t - i * 0.37) / durOut
        const cicloOut = Math.floor(pOut)
        for (let k = 0; k < 4; k++)
          colocar(dots[k], path, len, pOut < 0 ? -1 : pOut - cicloOut - k * 0.03, false, 1 - k * 0.2, 1 - k * 0.25)
        // Entrada (nodo → hub): punto blanco con una estela corta
        const pIn = (t - (i * 0.61 + 0.9)) / durIn
        const cicloIn = Math.floor(pIn)
        for (let k = 0; k < 2; k++)
          colocar(dots[4 + k], path, len, pIn < 0 ? -1 : pIn - cicloIn - k * 0.03, true, 1 - k * 0.3, 0.85 - k * 0.4)
      })
      raf = requestAnimationFrame(frame)
    }
    // Con "reducir movimiento" los paquetes no se animan
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const alfa = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`
  const centrado = { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' } as const

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* 1. Fondo de puntos */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(63,214,200,.13) 1px, transparent 1.5px)', backgroundSize: '16px 16px' }} />

      {/* 2. Anillos de radar */}
      {[[42, .16], [78, .11], [116, .07]].map(([h, a]) => (
        <div key={h} style={{ ...centrado, height: `${h}%`, aspectRatio: '1', borderRadius: '50%', border: `1px dashed rgba(63,214,200,${a})`, pointerEvents: 'none' }} />
      ))}

      {/* 3. Barrido de radar */}
      <div style={{ ...centrado, height: '116%', aspectRatio: '1', pointerEvents: 'none' }}>
        <div className="sg-anim" style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(63,214,200,.16), transparent 70deg)', animation: 'sgSpin 7s linear infinite' }} />
      </div>

      {/* 4. Enlaces: arcos hub → nodo con paquetes de salida y de entrada */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {nodos.map((n, i) => {
          const c = COLOR[n.estado]
          const mx = (50 + n.x) / 2, my = (50 + n.y) / 2, dx = n.x - 50, dy = n.y - 50
          const k = i % 2 ? .22 : -.22
          const d = `M50 50 Q${mx - dy * k} ${my + dx * k} ${n.x} ${n.y}`
          const lento = n.estado === 'degradado'
          return (
            <g key={n.id} fill="none">
              <path ref={el => { if (el) pathRefs.current.set(n.id, el); else pathRefs.current.delete(n.id) }}
                d={d} stroke={c} strokeOpacity={n.tipo === 'infra' ? .22 : .32} strokeWidth={1}
                strokeDasharray={lento || n.estado === 'caido' ? '1.5 1.5' : undefined} vectorEffect="non-scaling-stroke" />
            </g>
          )
        })}
      </svg>

      {/* 4b. Paquetes (puntos con estela) — su posición la calcula el bucle de animación */}
      {nodos.map(n => (
        <div key={`pq-${n.id}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[0, 1, 2, 3, 4, 5].map(k => {
            const salida = k < 4
            const c = COLOR[n.estado]
            const d = salida ? 7 : 4
            return (
              <div key={k} ref={el => {
                const arr = dotRefs.current.get(n.id) ?? []
                arr[k] = el
                dotRefs.current.set(n.id, arr)
              }} style={{
                position: 'absolute', left: 0, top: 0, width: d, height: d, borderRadius: '50%', opacity: 0, willChange: 'transform, opacity',
                background: salida ? c : '#e3efee', boxShadow: salida ? `0 0 8px ${c}, 0 0 16px ${alfa(c, 50)}` : '0 0 5px rgba(227,239,238,.7)',
              }} />
            )
          })}
        </div>
      ))}

      {/* 5. Pings: peajes y hub */}
      {nodos.filter(n => n.tipo === 'peaje').map((n, i) => (
        <div key={`ping-${n.id}`} className="sg-anim" style={{
          position: 'absolute', left: `${n.x}%`, top: `${n.y}%`, width: 14, height: 14, borderRadius: '50%', boxSizing: 'border-box',
          border: `1.5px solid ${COLOR[n.estado]}`, pointerEvents: 'none',
          animation: `sgPing ${n.estado === 'caido' ? 1 : n.estado === 'degradado' ? 1.4 : 2.8}s ease-out ${i * 0.5}s infinite`,
        }} />
      ))}
      <div className="sg-anim" style={{ position: 'absolute', left: '50%', top: '50%', width: 58, height: 58, borderRadius: '50%', boxSizing: 'border-box', border: `1.5px solid ${PANEL.acento}`, pointerEvents: 'none', animation: 'sgPing 3.2s ease-out infinite' }} />

      {/* 6. Hub SIGMA */}
      <div style={{ ...centrado, width: 58, height: 58, borderRadius: '50%', background: '#1fbfb1', color: '#06201e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, letterSpacing: '.05em', boxShadow: '0 0 0 8px rgba(63,214,200,.14), 0 0 44px rgba(63,214,200,.5)' }}>SIGMA</div>

      {/* 7. Nodos y etiquetas (solo nombre y latencia: disponibilidad y equipos ya están en otros paneles) */}
      {nodos.map(n => {
        const c = COLOR[n.estado]
        const izquierda = n.x > 60
        const peaje = n.tipo === 'peaje'
        return (
          <div key={`nodo-${n.id}`} style={{ position: 'absolute', left: `${n.x}%`, top: `${n.y}%`, width: 0, height: 0 }}>
            <div title={`${n.nombre}\n${n.detalle}${n.lat != null ? `\n${n.lat === 0 ? '<1' : n.lat} ms` : ''}`} style={peaje ? {
              position: 'absolute', width: 13, height: 13, borderRadius: '50%', background: c, transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 0 4px ${alfa(c, 16)}, 0 0 18px ${c}`, pointerEvents: 'auto',
            } : {
              position: 'absolute', width: 9, height: 9, background: c, transform: 'translate(-50%, -50%) rotate(45deg)',
              boxShadow: `0 0 10px ${c}`, pointerEvents: 'auto',
            }} />
            <div style={{
              position: 'absolute', top: 0, transform: 'translateY(-50%)', whiteSpace: 'nowrap', lineHeight: 1.25,
              ...(izquierda ? { right: 16, textAlign: 'right' } : { left: 16 }),
            }}>
              <div style={{ fontSize: peaje ? 15 : 13, fontWeight: 500, color: peaje ? TEXTO.primario : '#b9d3d1' }}>{n.nombre}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: c }}>
                {n.estado === 'caido' ? 'sin respuesta' : n.lat != null ? (n.lat === 0 ? '<1 ms' : `${n.lat} ms`) : '—'}
              </div>
            </div>
          </div>
        )
      })}

      {/* Encabezado */}
      <div style={{ position: 'absolute', top: 12, left: 18, right: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', pointerEvents: 'none' }}>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: PANEL.acento }}>Conectividad de nodos · en vivo</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: TEXTO.terciario }}>{peajes} peajes · {infra} infra · ciclo 30 s</div>
      </div>

      {/* Pie: leyenda y resumen */}
      <div style={{ position: 'absolute', bottom: 10, left: 18, right: 18, display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11, color: TEXTO.terciario, pointerEvents: 'none' }}>
        <div>
          <span style={{ color: PANEL.acento }}>●</span> peaje &nbsp; <span style={{ color: PANEL.acento }}>◆</span> infraestructura &nbsp; <span style={{ color: PANEL.naranja }}>●</span> fuera de umbral
        </div>
        <div>{enLinea}/{nodos.length} en línea · {degradados} degradado{degradados === 1 ? '' : 's'}</div>
      </div>
    </div>
  )
}
