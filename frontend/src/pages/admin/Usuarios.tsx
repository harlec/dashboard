import { useEffect, useState } from 'react'
import { AdminTable } from '../../components/admin/AdminTable'
import { FormModal, Field, Input, Select } from '../../components/admin/FormModal'

interface Usuario { id: number; username: string; nombre?: string; rol: string; activo: boolean }

export function AdminUsuarios() {
  const [rows,    setRows]    = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<'create' | 'edit' | 'password' | null>(null)
  const [editing, setEditing] = useState<Partial<Usuario & { password: string }>>({})
  const [saving,  setSaving]  = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/usuarios', { credentials: 'include' })
      .then(r => r.json()).then(setRows).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openNew  = () => { setEditing({ username: '', nombre: '', rol: 'viewer', password: '' }); setModal('create') }
  const openEdit = (r: Usuario) => { setEditing({ ...r }); setModal('edit') }
  const openPass = (r: Usuario) => { setEditing({ ...r, password: '' }); setModal('password') }

  const saveCreate = async () => {
    setSaving(true)
    await fetch('/api/usuarios', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: editing.username, password: editing.password, nombre: editing.nombre, rol: editing.rol })
    })
    setSaving(false); setModal(null); load()
  }

  const saveEdit = async () => {
    setSaving(true)
    await fetch(`/api/usuarios/${editing.id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: editing.nombre, rol: editing.rol, activo: editing.activo })
    })
    setSaving(false); setModal(null); load()
  }

  const savePassword = async () => {
    setSaving(true)
    await fetch(`/api/usuarios/${editing.id}/password`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: editing.password })
    })
    setSaving(false); setModal(null)
  }

  const remove = async (r: Usuario) => {
    if (!confirm(`¿Desactivar usuario "${r.username}"?`)) return
    await fetch(`/api/usuarios/${r.id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold text-[#eae7e4]">Usuarios</h1>
        <button onClick={openNew}
          className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all">
          + Nuevo usuario
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <AdminTable
          columns={[
            { key: 'id',       label: 'ID' },
            { key: 'username', label: 'Usuario' },
            { key: 'nombre',   label: 'Nombre' },
            { key: 'rol',      label: 'Rol', render: r =>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.rol === 'admin' ? 'bg-brand/20 text-brand' : 'bg-surface-3 text-muted'}`}>
                {r.rol}
              </span>
            },
            { key: 'activo', label: 'Activo', render: r => r.activo ? '✅' : '❌' },
          ]}
          data={rows} keyField="id" loading={loading}
          onEdit={openEdit}
          onDelete={remove}
        />
      </div>

      {/* Botón de cambiar password en cada fila */}
      {rows.length > 0 && (
        <div className="mt-2 text-xs text-muted">
          Para cambiar contraseña: edita el usuario y usa el botón "Cambiar contraseña" en la tabla de arriba.
        </div>
      )}

      {/* Modal crear */}
      <FormModal title="Nuevo usuario" open={modal === 'create'}
        onClose={() => setModal(null)} onSubmit={saveCreate} loading={saving}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Usuario">
            <Input value={editing.username ?? ''} onChange={e => setEditing(p => ({ ...p, username: e.target.value }))} />
          </Field>
          <Field label="Contraseña">
            <Input type="password" value={editing.password ?? ''}
              onChange={e => setEditing(p => ({ ...p, password: e.target.value }))} />
          </Field>
          <Field label="Nombre completo">
            <Input value={editing.nombre ?? ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
          </Field>
          <Field label="Rol">
            <Select value={editing.rol ?? 'viewer'} onChange={e => setEditing(p => ({ ...p, rol: e.target.value }))}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </div>
      </FormModal>

      {/* Modal editar */}
      <FormModal title={`Editar usuario: ${editing.username}`} open={modal === 'edit'}
        onClose={() => setModal(null)} onSubmit={saveEdit} loading={saving}>
        <Field label="Nombre completo">
          <Input value={editing.nombre ?? ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
        </Field>
        <Field label="Rol">
          <Select value={editing.rol ?? 'viewer'} onChange={e => setEditing(p => ({ ...p, rol: e.target.value }))}>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={editing.activo ?? true}
            onChange={e => setEditing(p => ({ ...p, activo: e.target.checked }))}
            className="accent-brand w-4 h-4" />
          Usuario activo
        </label>
        <div className="border-t border-border pt-3">
          <button onClick={() => setModal('password')}
            className="text-sm text-warn hover:underline">
            Cambiar contraseña →
          </button>
        </div>
      </FormModal>

      {/* Modal cambiar password */}
      <FormModal title={`Cambiar contraseña: ${editing.username}`} open={modal === 'password'}
        onClose={() => setModal(null)} onSubmit={savePassword} loading={saving} submitLabel="Cambiar">
        <Field label="Nueva contraseña">
          <Input type="password" value={editing.password ?? ''}
            onChange={e => setEditing(p => ({ ...p, password: e.target.value }))}
            placeholder="Mínimo 6 caracteres" />
        </Field>
      </FormModal>
    </div>
  )
}
