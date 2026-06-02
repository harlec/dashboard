import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { AdminTable } from '../../components/admin/AdminTable'
import { FormModal, Field, Input } from '../../components/admin/FormModal'

interface Estacion { id: number; nombre: string; codigo: string; descripcion?: string; activo: boolean }
const empty = (): Partial<Estacion> => ({ nombre: '', codigo: '', descripcion: '' })

export function AdminEstaciones() {
  const [rows,    setRows]    = useState<Estacion[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<Partial<Estacion>>(empty())
  const [saving,  setSaving]  = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/estaciones', { credentials: 'include' })
      .then(r => r.json()).then(setRows).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openNew  = () => { setEditing(empty()); setModal(true) }
  const openEdit = (r: Estacion) => { setEditing({ ...r }); setModal(true) }

  const save = async () => {
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    const url    = editing.id ? `/api/estaciones/${editing.id}` : '/api/estaciones'
    await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: editing.nombre, codigo: editing.codigo, descripcion: editing.descripcion })
    })
    setSaving(false); setModal(false); load()
  }

  const remove = async (r: Estacion) => {
    if (!confirm(`¿Eliminar estación "${r.nombre}"?`)) return
    await fetch(`/api/estaciones/${r.id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold text-[#eae7e4]">Estaciones</h1>
        <button onClick={openNew}
          className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all">
          + Nueva estación
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <AdminTable
          columns={[
            { key: 'id',          label: 'ID' },
            { key: 'nombre',      label: 'Nombre' },
            { key: 'codigo',      label: 'Código' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'activo',      label: 'Activo', render: r => r.activo ? '✅' : '❌' },
          ]}
          data={rows} keyField="id" loading={loading}
          onEdit={openEdit} onDelete={remove}
        />
      </div>

      <FormModal title={editing.id ? 'Editar estación' : 'Nueva estación'}
        open={modal} onClose={() => setModal(false)} onSubmit={save} loading={saving}>
        <Field label="Nombre">
          <Input value={editing.nombre ?? ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
        </Field>
        <Field label="Código">
          <Input value={editing.codigo ?? ''} onChange={e => setEditing(p => ({ ...p, codigo: e.target.value }))}
            placeholder="Ej: VIRU, SANTA" />
        </Field>
        <Field label="Descripción (opcional)">
          <Input value={editing.descripcion ?? ''} onChange={e => setEditing(p => ({ ...p, descripcion: e.target.value }))} />
        </Field>
      </FormModal>
    </div>
  )
}
