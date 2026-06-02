import { useEffect, useState } from 'react'
import { AdminTable } from '../../components/admin/AdminTable'
import { FormModal, Field, Input, Select } from '../../components/admin/FormModal'

interface TipoEquipo { id: number; nombre: string }
interface Via { id: number; numero: string; estacion?: { nombre: string } }
interface Equipo { id: number; viaId: number; tipoEquipoId: number; nombre: string; ip: string; descripcion?: string; checkPort?: string | null; monitorear: boolean; activo: boolean; via?: Via; tipoEquipo?: TipoEquipo }
const empty = (): Partial<Equipo> => ({ viaId: 0, tipoEquipoId: 0, nombre: '', ip: '', descripcion: '', checkPort: null, monitorear: true })

const PORT_HINTS: Record<string, string> = {
  'PC Via': '445', 'PC OCR': '445',
  'Display Tarifario': '8080,80', 'Camara OCR': '554', 'PMV': '502'
}

export function AdminEquipos() {
  const [rows,   setRows]   = useState<Equipo[]>([])
  const [vias,   setVias]   = useState<Via[]>([])
  const [tipos,  setTipos]  = useState<TipoEquipo[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<Partial<Equipo>>(empty())
  const [saving,  setSaving]  = useState(false)
  const [search,  setSearch]  = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/equipos', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/vias',    { credentials: 'include' }).then(r => r.json()),
      fetch('/api/tipos-equipo', { credentials: 'include' }).then(r => r.json()),
    ]).then(([e, v, t]) => { setRows(e); setVias(v); setTipos(t) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = rows.filter(r =>
    r.nombre.toLowerCase().includes(search.toLowerCase()) ||
    r.ip.includes(search))

  const openNew  = () => { setEditing({ ...empty(), viaId: vias[0]?.id ?? 0, tipoEquipoId: tipos[0]?.id ?? 0 }); setModal(true) }
  const openEdit = (r: Equipo) => { setEditing({ ...r }); setModal(true) }

  // Al cambiar tipo, sugerir puerto automáticamente
  const onTipoChange = (tipoId: number) => {
    const tipo = tipos.find(t => t.id === tipoId)
    const port = tipo ? (PORT_HINTS[tipo.nombre] ?? null) : null
    setEditing(p => ({ ...p, tipoEquipoId: tipoId, checkPort: port }))
  }

  const save = async () => {
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    const url    = editing.id ? `/api/equipos/${editing.id}` : '/api/equipos'
    await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        viaId: editing.viaId, tipoEquipoId: editing.tipoEquipoId,
        nombre: editing.nombre, ip: editing.ip,
        descripcion: editing.descripcion,
        checkPort: editing.checkPort ?? null,
        monitorear: editing.monitorear
      })
    })
    setSaving(false); setModal(false); load()
  }

  const remove = async (r: Equipo) => {
    if (!confirm(`¿Eliminar equipo "${r.nombre}"?`)) return
    await fetch(`/api/equipos/${r.id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold text-[#eae7e4]">Equipos</h1>
        <div className="flex gap-2">
          <Input placeholder="Buscar por nombre o IP..." value={search}
            onChange={e => setSearch(e.target.value)} className="w-52" />
          <button onClick={openNew}
            className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all">
            + Nuevo equipo
          </button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <AdminTable
          columns={[
            { key: 'id',         label: 'ID' },
            { key: 'nombre',     label: 'Nombre' },
            { key: 'ip',         label: 'IP', render: r => <code className="text-brand text-xs">{r.ip}</code> },
            { key: 'tipo',       label: 'Tipo', render: r => (r as any).tipoEquipo?.nombre ?? '—' },
            { key: 'via',        label: 'Vía', render: r => (r as any).via ? `${(r as any).via.estacion?.nombre} — ${(r as any).via.numero}` : '—' },
            { key: 'monitorear', label: 'Monitorear', render: r => r.monitorear ? '✅' : '⏸' },
          ]}
          data={filtered} keyField="id" loading={loading}
          onEdit={openEdit} onDelete={remove}
        />
      </div>

      <FormModal title={editing.id ? 'Editar equipo' : 'Nuevo equipo'}
        open={modal} onClose={() => setModal(false)} onSubmit={save} loading={saving}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">
            <Input value={editing.nombre ?? ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))} />
          </Field>
          <Field label="IP">
            <Input value={editing.ip ?? ''} placeholder="10.15.x.x"
              onChange={e => setEditing(p => ({ ...p, ip: e.target.value }))} />
          </Field>
          <Field label="Vía">
            <Select value={editing.viaId ?? 0}
              onChange={e => setEditing(p => ({ ...p, viaId: Number(e.target.value) }))}>
              {vias.map(v => <option key={v.id} value={v.id}>{v.estacion?.nombre} — {v.numero}</option>)}
            </Select>
          </Field>
          <Field label="Tipo de equipo">
            <Select value={editing.tipoEquipoId ?? 0}
              onChange={e => onTipoChange(Number(e.target.value))}>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Descripción (opcional)">
            <Input value={editing.descripcion ?? ''} onChange={e => setEditing(p => ({ ...p, descripcion: e.target.value }))} />
          </Field>
          <Field label="Puerto(s) TCP (vacío = ICMP)">
            <Input
              type="text"
              placeholder="445 · 554 · 8080,80 · vacío=ping"
              value={editing.checkPort ?? ''}
              onChange={e => setEditing(p => ({ ...p, checkPort: e.target.value || null }))}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={editing.monitorear ?? true}
            onChange={e => setEditing(p => ({ ...p, monitorear: e.target.checked }))}
            className="accent-brand w-4 h-4" />
          Monitorear este equipo
        </label>
      </FormModal>
    </div>
  )
}
