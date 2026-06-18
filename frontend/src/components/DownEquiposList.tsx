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
    <div style={compact ? {
      background: 'linear-gradient(180deg,#0c141d,#080e15)',
      border: '1px solid rgba(239,75,84,.18)',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    } : undefined} className={compact ? '' : 'bg-surface rounded-xl border border-border overflow-hidden flex flex-col'}>

      {/* Header */}
      {compact ? (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(239,75,84,.14)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: caidos.length > 0 ? '#ef4b54' : '#3fb978', boxShadow: caidos.length > 0 ? '0 0 8px #ef4b54' : '0 0 6px #3fb978', flexShrink: 0 }} className={caidos.length > 0 ? 'animate-blink-down' : ''} />
            <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', color: '#7d8a9c', fontWeight: 700, textTransform: 'uppercase' as const }}>
              Equipos Caídos
            </span>
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: caidos.length > 0 ? 'rgba(239,75,84,.15)' : 'rgba(63,185,120,.12)', color: caidos.length > 0 ? '#ef4b54' : '#3fb978', border: `1px solid ${caidos.length > 0 ? 'rgba(239,75,84,.35)' : 'rgba(63,185,120,.35)'}` }}>
            {caidos.length > 0 ? `${caidos.length} caído${caidos.length > 1 ? 's' : ''}` : 'Todo OK'}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-border flex-shrink-0 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className={`rounded-full flex-shrink-0 w-2 h-2 ${caidos.length > 0 ? 'bg-danger animate-blink-down' : 'bg-brand-light'}`} />
            <span className="font-bold uppercase tracking-widest text-muted text-[0.78rem]">Equipos Caídos</span>
          </div>
          <span className={`font-extrabold px-2 py-0.5 rounded-full text-[0.75rem] ${caidos.length > 0 ? 'bg-danger/20 text-danger' : 'bg-brand/20 text-brand-light'}`}>
            {caidos.length > 0 ? `${caidos.length} caído${caidos.length > 1 ? 's' : ''}` : 'Todo OK'}
          </span>
        </div>
      )}

      {/* Cuerpo */}
      {caidos.length === 0 ? (
        <div className={`flex flex-col items-center justify-center gap-1.5 text-center ${compact ? 'py-6' : 'py-10'}`}>
          <div className={compact ? 'text-xl' : 'text-2xl'}>✓</div>
          <div style={compact ? { fontWeight: 600, fontSize: 14, color: '#3fb978' } : undefined} className={compact ? '' : 'font-bold text-brand-light text-[0.88rem]'}>
            Todos operativos
          </div>
          {!compact && (
            <div className="text-[0.75rem] text-muted">Sin incidentes activos</div>
          )}
        </div>
      ) : compact ? (
        /* ── Modo compacto: tarjetas estilo referencia ── */
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {caidos.map(({ eq, estacion }, idx) => (
            <div
              key={eq.id}
              onClick={() => onEquipoClick(eq)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(239,75,84,.10)', cursor: 'pointer', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,75,84,.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.22)', width: 18, flexShrink: 0 }}>{idx + 1}</span>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4b54', flexShrink: 0, boxShadow: '0 0 8px #ef4b54' }} className="animate-blink-down" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eq.nombre}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#5f7186', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{estacion} · {eq.tipoNombre}</div>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, flexShrink: 0, color: (eq.incMin ?? 0) > 60 ? '#ef4b54' : '#e0991f' }}>
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
