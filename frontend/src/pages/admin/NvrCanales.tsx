import { useEffect, useState } from 'react'
import { FormModal, Field, Input, Select } from '../../components/admin/FormModal'

interface Canal { id: number; canal: number; tipo: string; viaNumero?: number | null; sentido?: string | null; nombre: string }
interface Nvr {
  id: number; coestTransito: number; peaje: string; ip: string; puertoHttp: number
  usuario: string; passwordRef: string; retencionDias: number; canales: Canal[]
}

// tra_coest de la tabla transitos (Consolidado)
const PEAJES: Record<number, string> = { 1: 'Fortaleza', 2: 'Huarmey', 3: 'KM 402', 4: 'Virú', 5: 'Santa' }
const TIPOS = ['OCR', 'VALIDACION', 'PTZ']

const emptyNvr = (): Partial<Nvr> => ({ coestTransito: 4, peaje: 'Virú', ip: '', puertoHttp: 80, usuario: 'admin', passwordRef: '', retencionDias: 90 })
const emptyCanal = (): Partial<Canal> => ({ canal: 1, tipo: 'OCR', viaNumero: null, sentido: '', nombre: '' })

const call = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) })

export function AdminNvrCanales() {
  const [nvrs, setNvrs] = useState<Nvr[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [nvrModal, setNvrModal] = useState(false)
  const [nvr, setNvr] = useState<Partial<Nvr>>(emptyNvr())

  const [canalModal, setCanalModal] = useState(false)
  const [canalNvrId, setCanalNvrId] = useState(0)
  const [canal, setCanal] = useState<Partial<Canal>>(emptyCanal())
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/nvr', { credentials: 'include' })
      .then(r => r.json()).then(setNvrs).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Convierte la respuesta de error del backend (JSON de validación o texto) en un mensaje legible
  const textoError = async (res: Response) => {
    if (res.status === 403) return 'Solo un administrador puede guardar esta configuración'
    const t = await res.text()
    try {
      const j = JSON.parse(t)
      if (j.errors) return Object.values(j.errors as Record<string, string[]>).flat().join(' · ')
      if (j.title) return j.title
    } catch { /* texto plano */ }
    return t || `Error ${res.status}`
  }

  const guardar = async (req: Promise<Response>, cerrar: () => void) => {
    setSaving(true); setError('')
    const res = await req.catch(() => null)
    setSaving(false)
    if (!res) { setError('No se pudo contactar al servidor'); return }
    if (!res.ok) { setError(await textoError(res)); return }
    cerrar(); load()
  }

  const saveNvr = () => {
    if (!nvr.ip?.trim() || !nvr.usuario?.trim() || !nvr.passwordRef?.trim()) {
      setError('Completa la IP, el usuario y la variable de entorno de la contraseña (ej. NVR_VIRU_PWD)')
      return Promise.resolve()
    }
    return guardarNvr()
  }

  const guardarNvr = () => guardar(
    call(nvr.id ? `/api/nvr/${nvr.id}` : '/api/nvr', nvr.id ? 'PUT' : 'POST', {
      coestTransito: nvr.coestTransito, peaje: PEAJES[nvr.coestTransito!] ?? nvr.peaje, ip: nvr.ip,
      puertoHttp: Number(nvr.puertoHttp), usuario: nvr.usuario,
      passwordRef: nvr.passwordRef, retencionDias: Number(nvr.retencionDias),
    }), () => setNvrModal(false))

  const saveCanal = () => {
    if (!canal.nombre?.trim()) { setError('Escribe un nombre para el canal (ej. Cámara OCR vía 3)'); return Promise.resolve() }
    if (canal.tipo !== 'PTZ' && (canal.viaNumero == null || Number.isNaN(canal.viaNumero))) {
      setError('OCR y validación necesitan el número de vía'); return Promise.resolve()
    }
    return guardarCanal()
  }

  const guardarCanal = () => guardar(
    call(canal.id ? `/api/nvr/canales/${canal.id}` : `/api/nvr/${canalNvrId}/canales`, canal.id ? 'PUT' : 'POST', {
      canal: Number(canal.canal), tipo: canal.tipo,
      viaNumero: canal.tipo === 'PTZ' || canal.viaNumero == null || canal.viaNumero === ('' as unknown) ? null : Number(canal.viaNumero),
      sentido: canal.sentido || null, nombre: canal.nombre,
    }), () => setCanalModal(false))

  const delNvr = async (n: Nvr) => {
    if (!confirm(`¿Eliminar el NVR de ${n.peaje}?`)) return
    await call(`/api/nvr/${n.id}`, 'DELETE'); load()
  }
  const delCanal = async (c: Canal) => {
    if (!confirm(`¿Eliminar el canal ${c.canal} (${c.nombre})?`)) return
    await call(`/api/nvr/canales/${c.id}`, 'DELETE'); load()
  }

  const btn = 'px-3 py-1.5 text-xs font-bold rounded-lg border border-border hover:bg-surface-3'

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold text-[#eae7e4]">NVR y canales de cámara</h1>
        <button onClick={() => { setNvr(emptyNvr()); setError(''); setNvrModal(true) }}
          className="px-4 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110">
          + Nuevo NVR
        </button>
      </div>

      {loading && <div className="text-muted">Cargando…</div>}
      {!loading && nvrs.length === 0 && (
        <div className="text-muted">Aún no hay NVR configurados. Agrega uno por peaje.</div>
      )}

      {nvrs.map(n => (
        <div key={n.id} className="bg-surface rounded-xl border border-border mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <div className="font-extrabold text-[#eae7e4]">{n.peaje}</div>
              <div className="text-xs text-muted">
                {n.ip}:{n.puertoHttp} · usuario {n.usuario} · contraseña en <code>{n.passwordRef}</code> · retención {n.retencionDias} días
              </div>
            </div>
            <div className="flex gap-2">
              <button className={btn} onClick={() => { setCanalNvrId(n.id); setCanal(emptyCanal()); setError(''); setCanalModal(true) }}>+ Canal</button>
              <button className={btn} onClick={() => { setNvr({ ...n }); setError(''); setNvrModal(true) }}>Editar</button>
              <button className={btn} onClick={() => delNvr(n)}>Eliminar</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] text-muted uppercase">
                <th className="px-4 py-2">Canal</th><th>Tipo</th><th>Vía</th><th>Sentido</th><th>Nombre</th><th />
              </tr>
            </thead>
            <tbody>
              {[...n.canales].sort((a, b) => a.canal - b.canal).map(c => (
                <tr key={c.id} className="border-t border-border text-[#eae7e4]">
                  <td className="px-4 py-2 font-bold">{c.canal}</td>
                  <td>{c.tipo}</td>
                  <td>{c.viaNumero ?? '—'}</td>
                  <td>{c.sentido ?? '—'}</td>
                  <td>{c.nombre}</td>
                  <td className="text-right pr-4">
                    <button className={btn} onClick={() => { setCanalNvrId(n.id); setCanal({ ...c }); setError(''); setCanalModal(true) }}>Editar</button>{' '}
                    <button className={btn} onClick={() => delCanal(c)}>Quitar</button>
                  </td>
                </tr>
              ))}
              {n.canales.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-3 text-muted">Sin canales configurados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      <FormModal title={nvr.id ? 'Editar NVR' : 'Nuevo NVR'} open={nvrModal}
        onClose={() => setNvrModal(false)} onSubmit={saveNvr} loading={saving}>
        <Field label="Peaje">
          <Select value={nvr.coestTransito} disabled={!!nvr.id}
            onChange={e => setNvr(p => ({ ...p, coestTransito: Number(e.target.value) }))}>
            {Object.entries(PEAJES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="IP del NVR"><Input value={nvr.ip ?? ''} onChange={e => setNvr(p => ({ ...p, ip: e.target.value }))} placeholder="10.x.x.x" /></Field>
        <Field label="Puerto HTTP"><Input type="number" value={nvr.puertoHttp ?? 80} onChange={e => setNvr(p => ({ ...p, puertoHttp: Number(e.target.value) }))} /></Field>
        <Field label="Usuario"><Input value={nvr.usuario ?? ''} onChange={e => setNvr(p => ({ ...p, usuario: e.target.value }))} /></Field>
        <Field label="Variable de entorno con la contraseña">
          <Input value={nvr.passwordRef ?? ''} onChange={e => setNvr(p => ({ ...p, passwordRef: e.target.value }))} placeholder="NVR_VIRU_PWD" />
        </Field>
        <Field label="Retención de video (días)"><Input type="number" value={nvr.retencionDias ?? 90} onChange={e => setNvr(p => ({ ...p, retencionDias: Number(e.target.value) }))} /></Field>
        {error && <div className="text-danger text-sm">{error}</div>}
      </FormModal>

      <FormModal title={canal.id ? 'Editar canal' : 'Nuevo canal'} open={canalModal}
        onClose={() => setCanalModal(false)} onSubmit={saveCanal} loading={saving}>
        <Field label="Canal del NVR"><Input type="number" value={canal.canal ?? 1} onChange={e => setCanal(p => ({ ...p, canal: Number(e.target.value) }))} /></Field>
        <Field label="Tipo">
          <Select value={canal.tipo} onChange={e => setCanal(p => ({ ...p, tipo: e.target.value }))}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        {canal.tipo !== 'PTZ' ? (
          <Field label="Vía (número, igual a tra_nuvia)">
            <Input type="number" value={canal.viaNumero ?? ''} onChange={e => setCanal(p => ({ ...p, viaNumero: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="701" />
          </Field>
        ) : (
          <Field label="Sentido que cubre (vacío = todos)">
            <Input value={canal.sentido ?? ''} onChange={e => setCanal(p => ({ ...p, sentido: e.target.value }))} placeholder="Como viene en tra_senti" />
          </Field>
        )}
        <Field label="Nombre"><Input value={canal.nombre ?? ''} onChange={e => setCanal(p => ({ ...p, nombre: e.target.value }))} placeholder="Cámara OCR vía 3" /></Field>
        {error && <div className="text-danger text-sm">{error}</div>}
      </FormModal>
    </div>
  )
}
