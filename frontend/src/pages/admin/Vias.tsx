import { useEffect, useState } from 'react'
import { AdminTable } from '../../components/admin/AdminTable'
import { FormModal, Field, Input, Select } from '../../components/admin/FormModal'

interface Estacion { id: number; nombre: string }
interface Via { id: number; estacionId: number; numero: string; nombre?: string; activo: boolean; estacion?: Estacion }
const empty = (): Partial<Via> => ({ estacionId: 0, numero: '', nombre: '' })

export function AdminVias() {
  const [rows,       setRows]       = useState<Via[]>([])
  const [estaciones, setEstaciones] = useState<Estacion[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(false)
  const [editing,    setEditing]    = useState<Partial<Via>>(empty())
  const [saving,     setSaving]     = useState(false)
  const [filtroEst,  setFiltroEst]  = useState(0)

  const load = () => {
    setLoading(true)
    const qs = filtroEst ? `?estacionId=${filtroEst}` : ''
    Promise.all([
      fetch(`/api/vias${qs}`, { credentials: 'include' }).then(r => r.json()),
      fetch('/api/estaciones', { credentials: 'include' }).then(r => r.json()),
    ]).then(([v, e]) => { setRows(v); setEstaciones(e) }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filtroEst])

  const openNew  = () => { setEditing({ ...empty(), estacionId: estaciones[0]?.id ?? 0 }); setModal(true) }
  const openEdit = (r: Via) => { setEditing({ ...r }); setModal(true) }

  const save = async () => {
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    const url    = editing.id ? `/api/vias/${editing.id}` : '/api/vias'
    await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estacionId: editing.estacionId, numero: editing.numero, nombre: editing.nombre })
    })
    setSaving(false); setModal(false); load()
  }

  const remove = async (r: Via) => {
    if (!confirm(`¿Eliminar vía ${r.numero}?`)) return
    await fetch(`/api/vias/${r.id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold text-[#eae7e4]">Vías</h1>
        <div className="flex gap-2">
          <Select value={filtroEst} onChange={e => setFiltroEst(Number(e.target.value))} className="w-44">
            <option value={0}>Todas las estaciones</option>
            {estaciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </Select>
          <button onClick={openNew}
            className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all">
            + Nueva vía
          </button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <AdminTable
          columns={[
            { key: 'id',      label: 'ID' },
            { key: 'numero',  label: 'Número' },
            { key: 'nombre',  label: 'Nombre' },
            { key: 'estacion', label: 'Estación', render: r => (r as any).estacion?.nombre ?? '—' },
            { key: 'activo',  label: 'Activo', render: r => r.activo ? '✅' : '❌' },
          ]}
          data={rows} keyField="id" loading={loading}
          onEdit={openEdit} onDelete={remove}
        />
      </div>

      <FormModal title={editing.id ? 'Editar vía' : 'Nueva vía'}
        open={modal} onClose={() => setModal(false)} onSubmit={save} loading={saving}>
        <Field label="Estación">
          <Select value={editing.estacionId ?? 0}
            onChange={e => setEditing(p => ({ ...p, estacionId: Number(e.target.value) }))}>
            {estaciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Número">
          <Input value={editing.numero ?? ''} placeholder="Ej: 701"
            onChange={e => setEditing(p => ({ ...p, numero: e.target.value }))} />
        </Field>
        <Field label="Nombre (opcional)">
          <Input value={editing.nombre ?? ''}
            onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
        </Field>
      </FormModal>
    </div>
  )
}
