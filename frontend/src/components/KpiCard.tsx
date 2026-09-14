import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  sub?: ReactNode
  /** Color de arranque del degradado — ya con su alpha, ej. 'oklch(0.38 0.09 62 / .50)' */
  tint: string
  /** Color sólido para la etiqueta y la cifra */
  accent: string
  children?: ReactNode
  className?: string
}

// Tarjeta KPI con degradado — mismo componente en Discrepancias/Incidentes/
// OCR/Reporte SLA (sistema-visual.md: radio 20px, cifra 40-46px/300).
export function KpiCard({ label, value, sub, tint, accent, children, className }: Props) {
  return (
    <div className={`rounded-[20px] p-4 flex flex-col justify-between gap-2 min-w-0 ${className ?? ''}`}
      style={{
        background: `linear-gradient(160deg, ${tint} 0%, oklch(0.22 0.03 265 / .55) 100%)`,
        boxShadow: 'inset 0 1px 0 oklch(1 0 0 / .09), 0 12px 34px oklch(0 0 0 / .30)',
      }}>
      <div className="text-[0.78rem] font-semibold uppercase tracking-wide" style={{ color: accent }}>
        {label}
      </div>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <div className="text-[2rem] font-light leading-none tabular-nums"
          style={{ letterSpacing: '-0.035em', color: accent }}>
          {value}
        </div>
        {sub && <div className="text-[0.8rem] text-white/50">{sub}</div>}
      </div>
      {children}
    </div>
  )
}
