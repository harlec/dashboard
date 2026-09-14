interface Props {
  /** 0-100 — si el rango útil es angosto (ej. uptime 90-100%), mapear antes de pasarlo */
  pct: number
  color: string
  height?: number
  glow?: boolean
}

// Barra de progreso — pista + relleno con gradiente del semáforo
// (sistema-visual.md: componente compartido).
export function ProgressBar({ pct, color, height = 6, glow = true }: Props) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="rounded-full overflow-hidden" style={{ height, background: 'oklch(1 0 0 / .08)' }}>
      <div className="h-full rounded-full transition-[width]" style={{
        width: `${clamped}%`,
        background: color,
        boxShadow: glow ? `0 0 12px ${color}` : undefined,
      }} />
    </div>
  )
}
