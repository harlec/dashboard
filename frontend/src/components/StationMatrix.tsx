import type { EstacionLive, EquipoLive } from '../api/client'
import { EquipoChip }    from './EquipoChip'
import { StationGauge }  from './StationGauge'

interface Props {
  estaciones: EstacionLive[]
  onEquipoClick: (eq: EquipoLive) => void
}

// Todos los tipos de equipo en el orden deseado
const TIPO_ORDER = ['PC Via', 'PC OCR', 'Display Tarifario', 'Camara OCR', 'PMV', 'Antena/Router', 'UPS', 'Switch']

export function StationMatrix({ estaciones, onEquipoClick }: Props) {
  // Colectar todos los tipos presentes
  const tiposPresentes = TIPO_ORDER.filter(tipo =>
    estaciones.some(est =>
      est.vias.some(via =>
        via.equipos.some(eq => eq.tipoNombre === tipo))))

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 bg-transparent">
        <thead>
          <tr>
            <th className="bg-transparent" />
            {estaciones.map(est => {
              const pct = est.total > 0 ? Math.round(est.up / est.total * 100) : 0
              return (
                <th key={est.id} className={`rounded-lg p-0 align-bottom transition-colors ${
                  est.enlace === 'STARLINK'
                    ? 'bg-orange-500/15 ring-1 ring-orange-500/40'
                    : 'bg-[#242120]'
                }`}>
                  <div className="relative flex flex-col items-center gap-0.5 px-3 pt-2.5 pb-2">
                    {est.enlace === 'STARLINK' && (
                      <div className="absolute top-1.5 right-2.5 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping-pulse" />
                        <span className="text-[0.58rem] font-bold text-orange-400 uppercase tracking-wide whitespace-nowrap">
                          Respaldo Starlink
                        </span>
                      </div>
                    )}
                    <span className="text-[1rem] font-bold text-[#eae7e4]">{est.nombre}</span>
                    <StationGauge pct={pct} up={est.up} down={est.down} enlace={est.enlace} />
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {tiposPresentes.map((tipo, ti) => (
            <tr key={tipo} className={ti > 0 ? 'border-t border-border' : ''}>
              {/* Label de tipo */}
              <td className="text-right text-[0.9rem] font-bold text-muted uppercase tracking-wide pr-3.5 whitespace-nowrap bg-transparent border-none">
                {tipo}
              </td>

              {/* Una celda por estación */}
              {estaciones.map(est => {
                const chips = est.vias.flatMap(via =>
                  via.equipos.filter(eq => eq.tipoNombre === tipo))

                return (
                  <td key={est.id} className="p-1.5 text-center align-middle bg-transparent border-none">
                    <div className="flex gap-1.5 justify-center flex-wrap">
                      {chips.map(eq => (
                        <EquipoChip key={eq.id} equipo={eq} onClick={onEquipoClick} />
                      ))}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}

          {/* Fila de totales */}
          <tr className="border-t border-border">
            <td className="bg-transparent border-none" />
            {estaciones.map(est => (
              <td key={est.id} className="py-2.5 px-1.5 bg-transparent border-none">
                <div className="flex gap-3 justify-center items-center flex-wrap">
                  <StatCol num={est.up}   label="Operativos" color="text-brand" />
                  <StatCol num={est.down} label="Caídos"     color="text-danger" />
                  <StatCol num={est.sin}  label="Sin datos"  color="text-muted" />
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function StatBadge({ num, label, color }: { num: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-[0.9rem] font-bold ${color}`}>{num}</span>
      <span className="text-[0.6rem] text-muted uppercase">{label}</span>
    </div>
  )
}

function StatCol({ num, label, color }: { num: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-[1.2rem] font-bold ${color}`}>{num}</span>
      <span className="text-[0.62rem] text-muted uppercase">{label}</span>
    </div>
  )
}

