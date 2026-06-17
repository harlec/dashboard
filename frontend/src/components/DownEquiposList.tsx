import type { EstacionLive, EquipoLive } from '../api/client'

interface Props {
  estaciones:    EstacionLive[]
  onEquipoClick: (eq: EquipoLive) => void
  compact?:      boolean   // modo columna derecha: menos columnas, filas más pequeñas
}

function dur(min?: number | null) {
  if (min == null) return '—'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function DownEquiposList({ estaciones, onEquipoClick, compact }: Props) {
  const caidos = estaciones.flatMap(est =>
    est.vias.flatMap(via =>
      via.equipos
        .filter(eq => eq.monitorear && eq.ultimoEstado === 'DOWN')
        .map(eq => ({ eq, estacion: est.nombre, via: via.nombre ?? via.numero }))
    )
  ).sort((a, b) => (b.eq.incMin ?? 0) - (a.eq.incMin ?? 0))

  return (
    <div className={`bg-surface rounded-xl border border-border overflow-hidden flex flex-col ${compact ? 'h-full' : ''}`}>

      {/* Header */}
      <div className={`flex items-center justify-between border-b border-border flex-shrink-0 ${compact ? 'px-4 py-2' : 'px-5 py-3'}`}>
        <div className="flex items-center gap-2">
          <div className={`rounded-full flex-shrink-0 ${caidos.length > 0 ? 'bg-danger animate-blink-down' : 'bg-brand-light'} ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'}`} />
          <span className={`font-bold uppercase tracking-widest text-muted ${compact ? 'text-[0.65rem]' : 'text-[0.78rem]'}`}>
            Equipos Caídos
          </span>
        </div>
        <span className={`font-extrabold px-2 py-0.5 rounded-full ${
          caidos.length > 0 ? 'bg-danger/20 text-danger' : 'bg-brand/20 text-brand-light'
        } ${compact ? 'text-[0.65rem]' : 'text-[0.75rem]'}`}>
          {caidos.length > 0 ? `${caidos.length} caído${caidos.length > 1 ? 's' : ''}` : 'Todo OK'}
        </span>
      </div>

      {/* Cuerpo */}
      {caidos.length === 0 ? (
        <div className={`flex flex-col items-center justify-center gap-1.5 text-center ${compact ? 'py-6' : 'py-10'}`}>
          <div className={compact ? 'text-xl' : 'text-2xl'}>✓</div>
          <div className={`font-bold text-brand-light ${compact ? 'text-[0.78rem]' : 'text-[0.88rem]'}`}>
            Todos operativos
          </div>
          {!compact && (
            <div className="text-[0.75rem] text-muted">Sin incidentes activos</div>
          )}
        </div>
      ) : compact ? (
        /* ── Modo compacto: lista numerada estilo Threatrix ── */
        <div className="flex-1 overflow-y-auto">
          {caidos.map(({ eq, estacion }, idx) => (
            <div
              key={eq.id}
              onClick={() => onEquipoClick(eq)}
              className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border/40 cursor-pointer hover:bg-surface-2 transition-colors"
            >
              <span className="text-[0.65rem] text-muted/60 font-mono w-4 flex-shrink-0">{idx + 1}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0 animate-blink-down" />
              <div className="flex-1 min-w-0">
                <div className="text-[0.78rem] font-bold text-[#eae7e4] truncate">{eq.nombre}</div>
                <div className="text-[0.65rem] text-muted truncate">{estacion} · {eq.tipoNombre}</div>
              </div>
              <span className={`text-[0.72rem] font-bold flex-shrink-0 ${(eq.incMin ?? 0) > 60 ? 'text-danger' : 'text-warn'}`}>
                {dur(eq.incMin)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* ── Modo completo: tabla con todas las columnas ── */
        <table className="w-full text-[0.82rem] border-collapse">
          <thead>
            <tr className="bg-surface-2">
              {['Equipo', 'Estación', 'Vía', 'IP', 'Tiempo caído'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[0.7rem] font-bold text-muted uppercase tracking-wide border-b border-border">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {caidos.map(({ eq, estacion, via }, i) => (
              <tr
                key={eq.id}
                onClick={() => onEquipoClick(eq)}
                className={`cursor-pointer transition-colors hover:bg-surface-3 border-b border-border/50 ${i === 0 ? 'bg-danger/5' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-danger animate-blink-down flex-shrink-0" />
                    <span className="font-bold text-[#eae7e4]">{eq.nombre}</span>
                  </div>
                  <div className="text-[0.7rem] text-muted ml-3.5">{eq.tipoNombre}</div>
                </td>
                <td className="px-4 py-3 text-[#d4cec9]">{estacion}</td>
                <td className="px-4 py-3 text-muted">{via}</td>
                <td className="px-4 py-3 font-mono text-[0.78rem] text-[#d4cec9]">{eq.ip}</td>
                <td className="px-4 py-3">
                  <span className={`font-bold ${(eq.incMin ?? 0) > 60 ? 'text-danger' : 'text-warn'}`}>
                    {dur(eq.incMin)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
