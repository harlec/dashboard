import type { ReactNode, CSSProperties } from 'react'

// Superficie de panel compartida (sistema-visual.md) — usada por todos los
// paneles que no son tarjeta KPI (gráficas, listas, tablas). `style` permite
// ajustar padding/alto puntual por pantalla sin perder el fondo/sombra base.
export function Panel({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rounded-[22px] p-4 min-w-0 flex flex-col ${className ?? ''}`}
      style={{
        background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / .92) 0%, oklch(0.185 0.016 262 / .92) 100%)',
        boxShadow: 'inset 0 1px 0 oklch(1 0 0 / .07), 0 14px 40px oklch(0 0 0 / .32)',
        ...style,
      }}>
      {children}
    </div>
  )
}
