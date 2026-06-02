import type { ReactNode } from 'react'

interface Props {
  title: string
  open: boolean
  onClose: () => void
  onSubmit: () => void
  loading?: boolean
  children: ReactNode
  submitLabel?: string
}

export function FormModal({ title, open, onClose, onSubmit, loading, children, submitLabel = 'Guardar' }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/70 z-[1000] flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-surface-2 rounded-2xl w-full max-w-lg shadow-2xl border border-[#38332F]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#38332F]">
          <h2 className="font-bold text-[1rem] text-[#eae7e4]">{title}</h2>
          <button onClick={onClose}
            className="text-muted hover:text-danger px-2 py-1 rounded-md transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          {children}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#38332F]">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-3 text-muted text-sm font-bold hover:bg-surface-2 transition-colors">
            Cancelar
          </button>
          <button onClick={onSubmit} disabled={loading}
            className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50">
            {loading ? 'Guardando…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Campo de formulario reutilizable
interface FieldProps {
  label: string
  children: ReactNode
}
export function Field({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[0.75rem] text-muted font-bold uppercase">{label}</label>
      {children}
    </div>
  )
}

// Input estilizado
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export function Input(props: InputProps) {
  return (
    <input {...props}
      className={`w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-[#eae7e4] text-sm
        outline-none focus:border-brand transition-colors ${props.className ?? ''}`} />
  )
}

// Select estilizado
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode
}
export function Select({ children, ...props }: SelectProps) {
  return (
    <select {...props}
      className={`w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-[#eae7e4] text-sm
        outline-none focus:border-brand transition-colors ${props.className ?? ''}`}>
      {children}
    </select>
  )
}
