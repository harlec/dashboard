import { useEffect, useState } from 'react'
import { AdminTable } from '../../components/admin/AdminTable'
import { FormModal, Field, Input, Select } from '../../components/admin/FormModal'

interface Servicio { id: number; nombre: string }
interface ServicioCheck {
  id: number; servicioId: number; nombre: string
  tipoCheck: 'Ping' | 'Tcp' | 'Http'; host: string; puerto?: number | null
  ubicacion?: string | null; monitorear: boolean; activo: boolean
  ultimoEstado?: string | null; ultimaLatenciaMs?: number | null; ultimoCheckEn?: string | null
  servicio?: Servicio
}
const empty = (): Partial<ServicioCheck> => ({
  servicioId: 0, nombre: '', tipoCheck: 'Ping', host: '', puerto: null, ubicacion: '', monitorear: true,
})

const HOST_LABEL: Record<string, string> = {
  Ping: 'IP o host',
  Tcp:  'IP o host',
  Http: 'URL (https://...)',
}

function EstadoBadge({ c }: { c: ServicioCheck }) {
  if (!c.ultimoEstado) return <span className="text-muted text-xs">sin datos aún</span>
  const up = c.ultimoEstado === 'UP'
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${up ? 'bg-[#1a2a1a] text-brand' : 'bg-[#2d1212] text-danger'}`}>
      {up ? '● Arriba' : '● Caído'}
    </span>
  )
}

export function AdminServicioChecks() {
  const [rows,      setRows]      = useState<ServicioCheck[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [editing,   setEditing]   = useState<Partial<ServicioCheck>>(empty())
  const [saving,    setSaving]    = useState(false)
  const [search,    setSearch]    = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/servicio-checks', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/servicios',       { credentials: 'include' }).then(r => r.json()),
    ]).then(([c, s]) => { setRows(c); setServicios(s) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = rows.filter(r =>
    r.nombre.toLowerCase().includes(search.toLowerCase()) ||
    r.host.toLowerCase().includes(search.toLowerCase()))

  const openNew  = () => { setEditing({ ...empty(), servicioId: servicios[0]?.id ?? 0 }); setModal(true) }
  const openEdit = (r: ServicioCheck) => { setEditing({ ...r }); setModal(true) }

  const save = async () => {
    setSaving(true)
    const method = editing.id ? 'PUT' : 'POST'
    const url    = editing.id ? `/api/servicio-checks/${editing.id}` : '/api/servicio-checks'
    await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        servicioId: editing.servicioId, nombre: editing.nombre, tipoCheck: editing.tipoCheck,
        host: editing.host, puerto: editing.tipoCheck === 'Tcp' ? (editing.puerto || null) : null,
        ubicacion: editing.ubicacion || null, monitorear: editing.monitorear ?? true,
      })
    })
    setSaving(false); setModal(false); load()
  }

  const remove = async (r: ServicioCheck) => {
    if (!confirm(`¿Eliminar chequeo "${r.nombre}"?`)) return
    await fetch(`/api/servicio-checks/${r.id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-[#eae7e4]">Chequeos de servicio</h1>
          <p className="text-xs text-muted mt-0.5">
            Los criterios de cada servicio: ping a una IP, puerto TCP, o código de respuesta HTTP de una URL.
          </p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar por nombre o host..." value={search}
            onChange={e => setSearch(e.target.value)} className="w-52" />
          <button onClick={openNew} disabled={servicios.length === 0}
            className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all disabled:opacity-40 whitespace-nowrap">
            + Nuevo chequeo
          </button>
        </div>
      </div>

      {servicios.length === 0 && !loading && (
        <div className="text-xs text-muted mb-3">
          Primero crea un servicio en la pantalla <span className="text-[#d4cec9]">Servicios</span>.
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <AdminTable
          columns={[
            { key: 'id',        label: 'ID' },
            { key: 'nombre',    label: 'Nombre' },
            { key: 'servicio',  label: 'Servicio', render: r => r.servicio?.nombre ?? '—' },
            { key: 'tipoCheck', label: 'Tipo' },
            { key: 'host',      label: 'Host/URL', render: r => <code className="text-brand text-xs">{r.host}{r.puerto ? `:${r.puerto}` : ''}</code> },
            { key: 'ubicacion', label: 'Ubicación', render: r => r.ubicacion ?? '—' },
            { key: 'estado',    label: 'Estado actual', render: r => <EstadoBadge c={r} /> },
            { key: 'monitorear', label: 'Monitorear', render: r => r.monitorear ? '✅' : '⏸' },
          ]}
          data={filtered} keyField="id" loading={loading}
          onEdit={openEdit} onDelete={remove}
        />
      </div>

      <FormModal title={editing.id ? 'Editar chequeo' : 'Nuevo chequeo'}
        open={modal} onClose={() => setModal(false)} onSubmit={save} loading={saving}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">
            <Input value={editing.nombre ?? ''} onChange={e => setEditing(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej: Ping DC01, HTTP portal" />
          </Field>
          <Field label="Servicio">
            <Select value={editing.servicioId ?? 0}
              onChange={e => setEditing(p => ({ ...p, servicioId: Number(e.target.value) }))}>
              {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Tipo de chequeo">
            <Select value={editing.tipoCheck ?? 'Ping'}
              onChange={e => setEditing(p => ({ ...p, tipoCheck: e.target.value as ServicioCheck['tipoCheck'] }))}>
              <option value="Ping">Ping (ICMP)</option>
              <option value="Tcp">Puerto TCP</option>
              <option value="Http">HTTP (código de respuesta)</option>
            </Select>
          </Field>
          <Field label="Ubicación (opcional)">
            <Input value={editing.ubicacion ?? ''} onChange={e => setEditing(p => ({ ...p, ubicacion: e.target.value }))}
              placeholder="Lima, Chimbote..." />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={HOST_LABEL[editing.tipoCheck ?? 'Ping']}>
            <Input value={editing.host ?? ''} onChange={e => setEditing(p => ({ ...p, host: e.target.value }))}
              placeholder={editing.tipoCheck === 'Http' ? 'https://www.aunor.com.pe' : '10.15.x.x'} />
          </Field>
          {editing.tipoCheck === 'Tcp' && (
            <Field label="Puerto">
              <Input type="number" value={editing.puerto ?? ''}
                onChange={e => setEditing(p => ({ ...p, puerto: e.target.value ? Number(e.target.value) : null }))}
                placeholder="443" />
            </Field>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={editing.monitorear ?? true}
            onChange={e => setEditing(p => ({ ...p, monitorear: e.target.checked }))}
            className="accent-brand w-4 h-4" />
          Monitorear este chequeo
        </label>
      </FormModal>
    </div>
  )
}
