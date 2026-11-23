interface Option<T extends string> { key: T; label: string }

interface Props<T extends string> {
  options: readonly Option<T>[]
  value: T
  onChange: (key: T) => void
}

// Selector de rango tipo pill — mismo componente en Discrepancias/Incidentes/
// OCR/Reporte SLA (sistema-visual.md: "Segmented de rango").
export function RangeSegmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-[13px] flex-wrap"
      style={{ background: 'rgb(var(--s1) / 0.80)', boxShadow: 'inset 0 0 0 1px rgb(var(--ov) / 0.05)' }}>
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-[10px] text-[0.82rem] font-semibold transition-all whitespace-nowrap ${
            value === o.key ? 'text-[#0a0d13]' : 'text-ink/50 hover:text-ink/80'}`}
          style={value === o.key ? { background: 'oklch(0.82 0.13 62)' } : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
