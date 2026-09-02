import { useEffect, useState } from 'react'
import { AdminTable } from '../../components/admin/AdminTable'
import { FormModal, Field, Input } from '../../components/admin/FormModal'

interface TipoEquipo { id: number; nombre: string; icono?: string; descripcion?: string; activo: boolean }
const empty = (): Partial<TipoEquipo> => ({ nombre: '', icono: '', descripcion: '' })

export function AdminTiposEquipo() {
  const [rows,    setRows]    = useState<TipoEquipo[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<Partial<TipoEquipo>>(empty())
  const [saving,  setSaving]  = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/tipos-equipo', { credentials: 'include' })
      .then(r => r.json()).then(setRows).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openNew  = () => { setEditing(empty()); setModal(true) }
  const openEdit = (r: TipoEquipo) => { setEditing({ ...r }); setModal(true) }

  const save = async () => {
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    const url    = editing.id ? `/api/tipos-equipo/${editing.id}` : '/api/tipos-equipo'
    await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: editing.nombre, icono: editing.icono, descripcion: editing.descripcion })
    })
    setSaving(false); setModal(false); load()
  }

  const remove = async (r: TipoEquipo) => {
    if (!confirm(`¿Eliminar tipo de equipo "${r.nombre}"?`)) return
    await fetch(`/api/tipos-equipo/${r.id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold text-[#eae7e4]">Tipos de equipo</h1>
        <button onClick={openNew}
          className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all">
          + Nuevo tipo
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <AdminTable
          columns={[
            { key: 'id',          label: 'ID' },
            { key: 'nombre',      label: 'Nombre' },
            { key: 'icono',       label: 'Ícono' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'activo',      label: 'Activo', render: r => r.activo ? '✅' : '❌' },
          ]}
          data={rows} keyField="id" loading={loading}
          onEdit={openEdit} onDelete={remove}
        />
      </div>

      <FormModal title={editing.id ? 'Editar tipo de equipo' : 'Nuevo tipo de equipo'}
        open={modal} onClose={() => setModal(false)} onSubmit={save} loading={saving}>
        <Field label="Nombre">
          <Input value={editing.nombre ?? ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))}
            placeholder="Ej: Cam Validacion" />
        </Field>
        <Field label="Ícono (opcional)">
          <Input value={editing.icono ?? ''} onChange={e => setEditing(p => ({ ...p, icono: e.target.value }))}
            placeholder="Ej: [CAM]" />
        </Field>
        <Field label="Descripción (opcional)">
          <Input value={editing.descripcion ?? ''} onChange={e => setEditing(p => ({ ...p, descripcion: e.target.value }))} />
        </Field>
      </FormModal>
    </div>
  )
}
