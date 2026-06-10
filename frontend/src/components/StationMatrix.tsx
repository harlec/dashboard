import type { EstacionLive, EquipoLive } from '../api/client'

interface Props {
  estaciones: EstacionLive[]
  onEquipoClick: (eq: EquipoLive) => void
}

const TIPO_ORDER = [
  'PC Via', 'PC OCR', 'Display Tarifario', 'Camara OCR',
  'PMV', 'Antena/Router', 'UPS', 'Switch',
]

// ── Chip dentro de la cuadrícula ──────────────────────────────
function GridChip({ eq, showLabel, onClick }: {
  eq: EquipoLive
  showLabel?: boolean
  onClick: (eq: EquipoLive) => void
}) {
  const state = !eq.monitorear ? 'off'
    : eq.ultimoEstado === 'UP'   ? 'up'
    : eq.ultimoEstado === 'DOWN' ? 'down'
    : 'sin'

  const style: Record<string, string> = {
    up:   'bg-[#1a4d1a] border-[#2d7a2d] text-[#73BF69]',
    down: 'bg-[#5a1010] border-[#c72020] text-[#f87171] animate-blink-down',
    sin:  'bg-[#242120] border-[#38332F] text-[#5a5450]',
    off:  'bg-transparent border-transparent text-[#2c2c2c]',
  }[state]

  const title = `${eq.nombre} — ${eq.ultimoEstado ?? 'Sin datos'}${
    eq.latenciaMs != null ? ` · ${Math.round(eq.latenciaMs)}ms` : ''
  }${eq.incMin != null ? ` · Inc: ${fmtDur(eq.incMin)}` : ''}`

  const shortName = eq.nombre.match(/\d+$/)?.[0]?.slice(-1)
    ?? eq.nombre.slice(0, 2).toUpperCase()

  return (
    <button
      title={title}
      onClick={() => eq.monitorear && onClick(eq)}
      className={`h-7 rounded border transition-all
        hover:brightness-125 hover:scale-110 hover:z-10 relative
        inline-flex items-center justify-center gap-0.5
        text-[0.65rem] font-bold
        ${showLabel ? 'px-1.5 min-w-[2rem]' : 'w-7'}
        ${style}`}
    >
      {state === 'down' && <span className="text-[0.7rem]">⚠</span>}
      {showLabel && <span>{shortName}</span>}
    </button>
  )
}

function fmtDur(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Tarjeta de una estación ───────────────────────────────────
function StationCard({ est, onEquipoClick }: {
  est: EstacionLive
  onEquipoClick: (eq: EquipoLive) => void
}) {
  const vias = [...est.vias].sort((a, b) =>
    a.numero.localeCompare(b.numero, undefined, { numeric: true })
  )

  const tipos = TIPO_ORDER.filter(tipo =>
    vias.some(v => v.equipos.some(eq => eq.tipoNombre === tipo))
  )

  const isStarlink = est.enlace === 'STARLINK'
  const isSinRuta  = est.enlace === 'SIN_CONEXION'

  return (
    <div className={`rounded-lg overflow-hidden border transition-colors ${
      isStarlink  ? 'bg-[#1c1a0f] border-orange-500/30' :
      isSinRuta   ? 'bg-[#1a1010] border-red-500/20'    :
                    'bg-[#181b1f] border-white/[0.08]'
    }`}>

      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
        isStarlink ? 'border-orange-500/20' : 'border-white/[0.06]'
      }`}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#e0e0e0] text-[0.95rem]">{est.nombre}</span>
          {isStarlink && (
            <span className="flex items-center gap-1 text-[0.6rem] font-bold text-orange-400
              uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping-pulse" />
              Starlink
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[0.78rem]">
          <span className="text-[#73BF69]">● {est.up}</span>
          {est.down > 0 && (
            <span className="text-[#F2495C] font-bold">▲ {est.down}</span>
          )}
          {est.sin > 0 && (
            <span className="text-[#5c5c5c]">◆ {est.sin}</span>
          )}
        </div>
      </div>

      {/* Tabla via × tipo */}
      <div className="px-3 py-2.5 overflow-x-auto">
        <table className="border-separate border-spacing-x-1 border-spacing-y-1">
          <thead>
            <tr>
              {/* columna de etiquetas */}
              <th className="w-28" />
              {vias.map(v => (
                <th key={v.id}
                  className="text-center text-[0.68rem] font-medium text-[#5c5c5c] px-0.5 min-w-[28px]">
                  {v.numero}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tipos.map(tipo => (
              <tr key={tipo}>
                <td className="text-right text-[0.72rem] text-[#6c6c6c] pr-2 whitespace-nowrap align-middle">
                  {tipo}
                </td>
                {vias.map(v => {
                  const equipos = v.equipos.filter(eq => eq.tipoNombre === tipo)
                  const multi   = equipos.length > 1

                  return (
                    <td key={v.id} className="text-center align-middle">
                      {equipos.length === 0 ? (
                        <span className="text-[#2c2c2c] text-[0.75rem] select-none">—</span>
                      ) : (
                        <div className="flex gap-0.5 justify-center">
                          {equipos.map(eq => (
                            <GridChip
                              key={eq.id}
                              eq={eq}
                              showLabel={multi}
                              onClick={onEquipoClick}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 px-4 pb-2.5 text-[0.62rem] text-[#4c4c4c]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#1a4d1a] border border-[#2d7a2d] inline-block" />
          operativo
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#5a1010] border border-[#c72020] inline-block" />
          caído
        </span>
        <span>— no aplica</span>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export function StationMatrix({ estaciones, onEquipoClick }: Props) {
  return (
    <div className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
      {estaciones.map(est => (
        <StationCard key={est.id} est={est} onEquipoClick={onEquipoClick} />
      ))}
    </div>
  )
}
