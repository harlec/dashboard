import type { EquipoLive } from '../api/client'

interface Props { equipo: EquipoLive; onClick: (eq: EquipoLive) => void }

function chipClasses(eq: EquipoLive): string {
  if (!eq.monitorear) return 'bg-transparent text-[#5a5450] cursor-default'
  if (!eq.ultimoEstado) return 'bg-[#38332F] text-[#a09890]'
  if (eq.ultimoEstado === 'UP')   return 'bg-[#2d7a2d] text-white'
  if (eq.ultimoEstado === 'DOWN') return 'bg-[#8B1A1A] text-white animate-blink-down'
  return 'bg-[#38332F] text-[#a09890]'
}

function tooltip(eq: EquipoLive): string {
  const estado = eq.ultimoEstado ?? 'Sin datos'
  const lat    = eq.latenciaMs  != null ? ` · ${Math.round(eq.latenciaMs)}ms` : ''
  const inc    = eq.incMin      != null ? ` · Inc: ${formatDur(eq.incMin)}`   : ''
  return `${eq.nombre} — ${estado}${lat}${inc}`
}

function formatDur(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// Etiqueta corta basada en el número de vía
function chipLabel(eq: EquipoLive): string {
  const match = eq.nombre.match(/\d{3}$/)
  return match ? match[0] : eq.nombre.slice(0, 3).toUpperCase()
}

export function EquipoChip({ equipo: eq, onClick }: Props) {
  return (
    <button
      title={tooltip(eq)}
      onClick={() => eq.monitorear && onClick(eq)}
      className={`w-[42px] h-[40px] rounded-md text-[0.8rem] font-extrabold
        inline-flex items-center justify-center border-none relative
        transition-transform transition-filter duration-150
        hover:scale-110 hover:brightness-110 hover:z-10
        ${chipClasses(eq)}`}
    >
      {chipLabel(eq)}
    </button>
  )
}
