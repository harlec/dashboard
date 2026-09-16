import { useEffect, useState } from 'react'
import { AdminTable } from '../../components/admin/AdminTable'
import { FormModal, Field, Input } from '../../components/admin/FormModal'

interface Servicio { id: number; nombre: string; descripcion?: string; activo: boolean }
const empty = (): Partial<Servicio> => ({ nombre: '', descripcion: '' })

export function AdminServicios() {
  const [rows,    setRows]    = useState<Servicio[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<Partial<Servicio>>(empty())
  const [saving,  setSaving]  = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/servicios', { credentials: 'include' })
      .then(r => r.json()).then(setRows).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openNew  = () => { setEditing(empty()); setModal(true) }
  const openEdit = (r: Servicio) => { setEditing({ ...r }); setModal(true) }

  const save = async () => {
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    const url    = editing.id ? `/api/servicios/${editing.id}` : '/api/servicios'
    await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: editing.nombre, descripcion: editing.descripcion })
    })
    setSaving(false); setModal(false); load()
  }

  const remove = async (r: Servicio) => {
    if (!confirm(`¿Eliminar servicio "${r.nombre}"? También deja de chequearse todo lo que tenga adentro.`)) return
    await fetch(`/api/servicios/${r.id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-[#eae7e4]">Servicios</h1>
          <p className="text-xs text-muted mt-0.5">
            Cosas que no cuelgan de una vía: servidores en sala (Lima/Chimbote), controlador de dominio,
            facturación, CCO, prepago, páginas web, etc. Cada servicio tiene uno o más chequeos en{' '}
            <span className="text-[#d4cec9]">Chequeos de servicio</span>.
          </p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all whitespace-nowrap">
          + Nuevo servicio
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <AdminTable
          columns={[
            { key: 'id',          label: 'ID' },
            { key: 'nombre',      label: 'Nombre' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'activo',      label: 'Activo', render: r => r.activo ? '✅' : '❌' },
          ]}
          data={rows} keyField="id" loading={loading}
          onEdit={openEdit} onDelete={remove}
        />
      </div>

      <FormModal title={editing.id ? 'Editar servicio' : 'Nuevo servicio'}
        open={modal} onClose={() => setModal(false)} onSubmit={save} loading={saving}>
        <Field label="Nombre">
          <Input value={editing.nombre ?? ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))}
            placeholder="Ej: Controlador de Dominio, CCO, Facturación" />
        </Field>
        <Field label="Descripción (opcional)">
          <Input value={editing.descripcion ?? ''} onChange={e => setEditing(p => ({ ...p, descripcion: e.target.value }))} />
        </Field>
      </FormModal>
    </div>
  )
}
