import { useEffect, useState } from 'react'
import { AdminTable } from '../../components/admin/AdminTable'
import { FormModal, Field, Input, Select } from '../../components/admin/FormModal'

interface Equipo {
  id: number; nombre: string; sitio: string; marca: string; ipMgmt: string; rolHa: string
  grupoHa: string | null; certSha256: string | null; activo: boolean; tieneKey: boolean
}
interface EquipoForm extends Partial<Equipo> { apiKey?: string }
interface Enlace {
  id: number; deviceId: number; dispositivo: string; interfaz: string; zona: string | null; rol: string
  mbpsContratadoIn: number | null; mbpsContratadoOut: number | null
  umbralWarnPct: number; umbralCritPct: number; medirAlerta: boolean
}

async function llamar(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method, credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error((await r.text()) || `Error ${r.status}`)
}

const numOrNull = (v: string) => v === '' ? null : Number(v)

export function AdminRed() {
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [enlaces, setEnlaces] = useState<Enlace[]>([])
  const [loading, setLoading] = useState(true)
  const [eq, setEq] = useState<EquipoForm | null>(null)
  const [en, setEn] = useState<Partial<Enlace> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/red/admin/equipos', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/red/admin/enlaces', { credentials: 'include' }).then(r => r.json()),
    ]).then(([a, b]) => { setEquipos(a); setEnlaces(b) }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const guardarEquipo = async () => {
    if (!eq) return
    setSaving(true); setError('')
    try {
      const body = {
        nombre: eq.nombre ?? '', sitio: eq.sitio ?? '', marca: eq.marca ?? 'PaloAlto', ipMgmt: eq.ipMgmt ?? '',
        rolHa: eq.rolHa ?? 'ninguno', grupoHa: eq.grupoHa || null, certSha256: eq.certSha256 || null,
        activo: eq.activo ?? true, apiKey: eq.apiKey || null,
      }
      await (eq.id ? llamar(`/api/red/admin/equipos/${eq.id}`, 'PUT', body) : llamar('/api/red/admin/equipos', 'POST', body))
      setEq(null); load()
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  const eliminarEquipo = async (r: Equipo) => {
    if (!confirm(`¿Eliminar el equipo "${r.nombre}"?`)) return
    try { await llamar(`/api/red/admin/equipos/${r.id}`, 'DELETE'); load() }
    catch (e) { alert((e as Error).message) }
  }

  const guardarEnlace = async () => {
    if (!en) return
    setSaving(true); setError('')
    try {
      const body = {
        deviceId: en.deviceId, interfaz: en.interfaz ?? '', zona: en.zona || null, rol: en.rol ?? 'INTERNET',
        mbpsContratadoIn: en.mbpsContratadoIn ?? null, mbpsContratadoOut: en.mbpsContratadoOut ?? null,
        umbralWarnPct: en.umbralWarnPct ?? 70, umbralCritPct: en.umbralCritPct ?? 85, medirAlerta: en.medirAlerta ?? true,
      }
      await (en.id ? llamar(`/api/red/admin/enlaces/${en.id}`, 'PUT', body) : llamar('/api/red/admin/enlaces', 'POST', body))
      setEn(null); load()
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  const btn = 'px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all whitespace-nowrap'

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-extrabold text-[#eae7e4]">Red · Equipos</h1>
            <p className="text-xs text-muted mt-0.5">
              Firewalls cuyos enlaces se miden (Palo Alto hoy; Fortinet próximamente). La API key se guarda cifrada y no se vuelve a mostrar.
              Para un par HA, registre ambas unidades con el mismo grupo HA.
            </p>
          </div>
          <button className={btn} onClick={() => { setError(''); setEq({ marca: 'PaloAlto', rolHa: 'ninguno', activo: true }) }}>+ Nuevo equipo</button>
        </div>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <AdminTable<Equipo>
            columns={[
              { key: 'nombre', label: 'Nombre' }, { key: 'sitio', label: 'Sitio' }, { key: 'marca', label: 'Marca' },
              { key: 'ipMgmt', label: 'IP gestión' },
              { key: 'rolHa', label: 'HA', render: r => r.grupoHa ? `${r.rolHa} (${r.grupoHa})` : r.rolHa },
              { key: 'tieneKey', label: 'API key', render: r => r.tieneKey ? '🔑 cargada' : '⚠ falta' },
              { key: 'certSha256', label: 'Huella TLS', render: r => r.certSha256 ? '✅' : '⚠ falta' },
              { key: 'activo', label: 'Activo', render: r => r.activo ? '✅' : '❌' },
            ]}
            data={equipos} keyField="id" loading={loading}
            onEdit={r => { setError(''); setEq({ ...r, apiKey: '' }) }} onDelete={eliminarEquipo} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-extrabold text-[#eae7e4]">Red · Enlaces</h1>
            <p className="text-xs text-muted mt-0.5">
              Interfaces medidas y ancho de banda contratado (Mbps). El % de uso se calcula contra ese valor.
            </p>
          </div>
          <button className={btn} disabled={equipos.length === 0}
            onClick={() => { setError(''); setEn({ deviceId: equipos[0]?.id, rol: 'INTERNET', umbralWarnPct: 70, umbralCritPct: 85, medirAlerta: true }) }}>
            + Nuevo enlace
          </button>
        </div>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <AdminTable<Enlace>
            columns={[
              { key: 'dispositivo', label: 'Equipo' }, { key: 'interfaz', label: 'Interfaz' }, { key: 'rol', label: 'Rol' },
              { key: 'in', label: 'Contratado ↓ / ↑ (Mbps)', render: r => `${r.mbpsContratadoIn ?? '—'} / ${r.mbpsContratadoOut ?? '—'}` },
              { key: 'um', label: 'Aviso / Crítico', render: r => `${r.umbralWarnPct}% / ${r.umbralCritPct}%` },
              { key: 'medirAlerta', label: 'Alerta', render: r => r.medirAlerta ? '✅' : 'informativo' },
            ]}
            data={enlaces} keyField="id" loading={loading}
            onEdit={r => { setError(''); setEn({ ...r }) }} />
        </div>
      </section>

      <FormModal title={eq?.id ? 'Editar equipo' : 'Nuevo equipo'} open={eq !== null}
        onClose={() => setEq(null)} onSubmit={guardarEquipo} loading={saving}>
        {eq && <>
          <Field label="Nombre"><Input value={eq.nombre ?? ''} onChange={e => setEq({ ...eq, nombre: e.target.value })} placeholder="Fw-Aunor-Primario" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sitio"><Input value={eq.sitio ?? ''} onChange={e => setEq({ ...eq, sitio: e.target.value })} placeholder="Lima" /></Field>
            <Field label="Marca">
              <Select value={eq.marca ?? 'PaloAlto'} onChange={e => setEq({ ...eq, marca: e.target.value })}>
                <option value="PaloAlto">Palo Alto</option>
                <option value="Fortinet">Fortinet (cliente pendiente)</option>
              </Select>
            </Field>
          </div>
          <Field label="IP de gestión"><Input value={eq.ipMgmt ?? ''} onChange={e => setEq({ ...eq, ipMgmt: e.target.value })} placeholder="10.15.112.202" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rol HA">
              <Select value={eq.rolHa ?? 'ninguno'} onChange={e => setEq({ ...eq, rolHa: e.target.value })}>
                <option value="ninguno">ninguno</option><option value="primario">primario</option><option value="secundario">secundario</option>
              </Select>
            </Field>
            <Field label="Grupo HA"><Input value={eq.grupoHa ?? ''} onChange={e => setEq({ ...eq, grupoHa: e.target.value })} placeholder="LIMA-FW" /></Field>
          </div>
          <Field label={eq.tieneKey ? 'API key (dejar vacío para no cambiarla)' : 'API key'}>
            <Input type="password" autoComplete="new-password" value={eq.apiKey ?? ''}
              onChange={e => setEq({ ...eq, apiKey: e.target.value })}
              placeholder={eq.tieneKey ? '•••••••• (guardada)' : 'Pegar la API key de solo lectura'} />
          </Field>
          <Field label="Huella SHA-256 del certificado TLS">
            <Input value={eq.certSha256 ?? ''} onChange={e => setEq({ ...eq, certSha256: e.target.value })}
              placeholder="AA:BB:CC:… (64 hex) — sin ella no se conecta" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[#eae7e4]">
            <input type="checkbox" checked={eq.activo ?? true} onChange={e => setEq({ ...eq, activo: e.target.checked })} /> Activo (se sondea)
          </label>
          {error && <div className="text-danger text-sm">{error}</div>}
        </>}
      </FormModal>

      <FormModal title={en?.id ? 'Editar enlace' : 'Nuevo enlace'} open={en !== null}
        onClose={() => setEn(null)} onSubmit={guardarEnlace} loading={saving}>
        {en && <>
          <Field label="Equipo">
            <Select value={en.deviceId ?? ''} disabled={!!en.id} onChange={e => setEn({ ...en, deviceId: Number(e.target.value) })}>
              {equipos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Interfaz"><Input value={en.interfaz ?? ''} onChange={e => setEn({ ...en, interfaz: e.target.value })} placeholder="ethernet1/1" /></Field>
            <Field label="Zona"><Input value={en.zona ?? ''} onChange={e => setEn({ ...en, zona: e.target.value })} placeholder="INTERNET" /></Field>
            <Field label="Rol">
              <Select value={en.rol ?? 'INTERNET'} onChange={e => setEn({ ...en, rol: e.target.value })}>
                <option>INTERNET</option><option>MPLS</option><option>LAN</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contratado entrada (Mbps)"><Input type="number" min={0} value={en.mbpsContratadoIn ?? ''} onChange={e => setEn({ ...en, mbpsContratadoIn: numOrNull(e.target.value) })} /></Field>
            <Field label="Contratado salida (Mbps)"><Input type="number" min={0} value={en.mbpsContratadoOut ?? ''} onChange={e => setEn({ ...en, mbpsContratadoOut: numOrNull(e.target.value) })} /></Field>
            <Field label="Umbral aviso (%)"><Input type="number" min={1} max={100} value={en.umbralWarnPct ?? 70} onChange={e => setEn({ ...en, umbralWarnPct: Number(e.target.value) })} /></Field>
            <Field label="Umbral crítico (%)"><Input type="number" min={1} max={100} value={en.umbralCritPct ?? 85} onChange={e => setEn({ ...en, umbralCritPct: Number(e.target.value) })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#eae7e4]">
            <input type="checkbox" checked={en.medirAlerta ?? true} onChange={e => setEn({ ...en, medirAlerta: e.target.checked })} /> Generar alertas (desmarcar = solo informativo)
          </label>
          {error && <div className="text-danger text-sm">{error}</div>}
        </>}
      </FormModal>
    </div>
  )
}
