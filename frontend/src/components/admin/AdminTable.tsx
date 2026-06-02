interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  loading?: boolean
}

export function AdminTable<T>({ columns, data, keyField, onEdit, onDelete, loading }: Props<T>) {
  if (loading) return <div className="text-center py-12 text-muted">Cargando…</div>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {columns.map(col => (
              <th key={col.key} className="text-left px-4 py-3 text-[0.7rem] text-muted font-bold uppercase whitespace-nowrap">
                {col.label}
              </th>
            ))}
            {(onEdit || onDelete) && (
              <th className="px-4 py-3 text-[0.7rem] text-muted font-bold uppercase text-right">Acciones</th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr><td colSpan={columns.length + 1} className="text-center py-10 text-muted">Sin registros</td></tr>
          )}
          {data.map(row => (
            <tr key={String(row[keyField])} className="border-b border-[#2a2826] hover:bg-surface-2 transition-colors">
              {columns.map(col => (
                <td key={col.key} className="px-4 py-2.5 text-[#d4cec9]">
                  {col.render ? col.render(row) : String((row as any)[col.key] ?? '—')}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-4 py-2.5 text-right">
                  <div className="flex gap-2 justify-end">
                    {onEdit && (
                      <button onClick={() => onEdit(row)}
                        className="px-3 py-1 rounded-md bg-[#1a2a1a] text-brand text-xs font-bold hover:brightness-110 transition-all">
                        Editar
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(row)}
                        className="px-3 py-1 rounded-md bg-[#2d1212] text-danger text-xs font-bold hover:brightness-110 transition-all">
                        Eliminar
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
