import type { ReactNode, CSSProperties } from 'react'

// Superficie de panel compartida (sistema-visual.md) — usada por todos los
// paneles que no son tarjeta KPI (gráficas, listas, tablas). `style` permite
// ajustar padding/alto puntual por pantalla sin perder el fondo/sombra base.
export function Panel({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rounded-[22px] p-4 min-w-0 flex flex-col ${className ?? ''}`}
      style={{
        background: 'linear-gradient(180deg, rgb(var(--s1) / .92) 0%, rgb(var(--s0) / .92) 100%)',
        boxShadow: 'inset 0 1px 0 rgb(var(--ov) / .07), 0 14px 40px rgb(var(--shadow) / .32)',
        ...style,
      }}>
      {children}
    </div>
  )
}
