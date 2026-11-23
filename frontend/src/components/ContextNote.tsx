import type { ReactNode } from 'react'

interface Props { color: string; children: ReactNode; className?: string }

// Nota de contexto — una frase que dice qué hacer con el dato (ej. "excluye
// la ráfaga", "el patrón nocturno es iluminación, no calibración").
export function ContextNote({ color, children, className }: Props) {
  return (
    <div className={`rounded-lg px-3 py-2 flex items-start gap-2.5 text-[0.8rem] leading-snug ${className ?? ''}`}
      style={{ background: 'light-dark(oklch(0.32 0.04 210 / .45), oklch(0.923 0.028 210 / 0.45))', color: 'light-dark(oklch(0.78 0.02 220), oklch(0.370 0.020 220))' }}>
      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-[3px]" style={{ background: color }} />
      <div>{children}</div>
    </div>
  )
}
