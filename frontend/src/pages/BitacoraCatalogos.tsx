import { useCallback, useEffect, useState } from 'react'
import { bitacoraApi } from '../api/bitacora'

// Administración de catálogos de la Bitácora (solo admin). Nada se borra: "Desactivar" conserva los registros viejos.
type Fila = Record<string, unknown> & { id: number; activo: boolean }
interface Campo { key: string; label: string; tipo?: 'select' | 'bool' | 'sede' | 'categoria' | 'usuario'; opciones?: string[] }

const CATALOGOS: { id: string; titulo: string; campos: Campo[] }[] = [
  { id: 'sedes', titulo: 'Sedes', campos: [
    { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Nombre' },
    { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: ['Oficina', 'Peaje'] } ] },
  { id: 'categorias', titulo: 'Categorías', campos: [
    { key: 'nombre', label: 'Nombre' },
    { key: 'segmento', label: 'Segmento', tipo: 'select', opciones: ['S. Operación', 'S. Información'] },
    { key: 'aplicaSla', label: 'SLA', tipo: 'bool' } ] },
  { id: 'proveedores', titulo: 'Proveedores', campos: [{ key: 'nombre', label: 'Nombre' }] },
  { id: 'personal', titulo: 'Personal', campos: [
    { key: 'nombre', label: 'Nombre' }, { key: 'sedeBase', label: 'Sede base' },
    { key: 'usuarioSigmaId', label: 'Usuario de Sigma', tipo: 'usuario' } ] },
  { id: 'palabras-clave', titulo: 'Palabras clave', campos: [
    { key: 'palabra', label: 'Palabra' }, { key: 'sedeId', label: 'Sede', tipo: 'sede' },
    { key: 'categoriaId', label: 'Categoría', tipo: 'categoria' } ] },
]

interface Opcion { id: number; nombre: string }

export function BitacoraCatalogos({ onCambio }: { onCambio: () => void }) {
  const [cat, setCat] = useState(CATALOGOS[0])
  const [filas, setFilas] = useState<Fila[]>([])
  const [sedes, setSedes] = useState<Opcion[]>([])
  const [categorias, setCategorias] = useState<Opcion[]>([])
  const [usuarios, setUsuarios] = useState<Opcion[]>([])
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [editId, setEditId] = useState<number | null>(null)
  const [err, setErr] = useState('')

  const cargar = useCallback(async () => {
    try {
      setFilas(await bitacoraApi.admin.lista(cat.id) as Fila[])
      setErr('')
    } catch (e) { setErr((e as Error).message) }
  }, [cat.id])

  useEffect(() => { cargar(); setForm({}); setEditId(null) }, [cargar])
  useEffect(() => {
    bitacoraApi.admin.lista('sedes')
      .then(r => setSedes((r as unknown as { id: number; codigo: string }[]).map(s => ({ id: s.id, nombre: s.codigo })))).catch(() => {})
    bitacoraApi.admin.lista('categorias').then(r => setCategorias(r as unknown as Opcion[])).catch(() => {})
    fetch('/api/usuarios', { credentials: 'include' }).then(r => r.ok ? r.json() : [])
      .then((u: { id: number; username: string; nombre?: string }[]) =>
        setUsuarios(u.map(x => ({ id: x.id, nombre: x.nombre ? `${x.nombre} (${x.username})` : x.username })))).catch(() => {})
  }, [])

  const opciones = (c: Campo) => c.tipo === 'sede' ? sedes : c.tipo === 'categoria' ? categorias : usuarios
  const celda = (c: Campo, f: Fila) => {
    const v = f[c.key]
    if (c.tipo === 'bool') return v == null ? '—' : v ? 'Sí' : 'No'
    if (c.tipo === 'sede' || c.tipo === 'categoria' || c.tipo === 'usuario')
      return v == null ? '—' : opciones(c).find(o => o.id === v)?.nombre ?? String(v)
    return (v as string | null) ?? ''
  }

  const guardar = async () => {
    try {
      if (editId == null) await bitacoraApi.admin.crear(cat.id, form)
      else await bitacoraApi.admin.editar(cat.id, editId, form)
      setForm({}); setEditId(null); setErr(''); await cargar(); onCambio()
    } catch (e) { setErr((e as Error).message) }
  }
  const editar = (f: Fila) => { setEditId(f.id); setForm({ ...f }) }
  const toggleActivo = async (f: Fila) => {
    try {
      if (f.activo) await bitacoraApi.admin.desactivar(cat.id, f.id)
      else await bitacoraApi.admin.editar(cat.id, f.id, { ...f, activo: true })
      await cargar(); onCambio()
    } catch (e) { setErr((e as Error).message) }
  }

  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  return (
    <section className="bit-card" aria-labelledby="bit-cat-titulo">
      <h2 id="bit-cat-titulo" className="bit-title mb-1">Catálogos</h2>
      <p className="bit-note mb-3">Nada se borra: desactivar un elemento lo oculta del formulario pero conserva los registros viejos.</p>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist">
        {CATALOGOS.map(c => (
          <button key={c.id} role="tab" className="bit-chip" aria-pressed={cat.id === c.id} onClick={() => setCat(c)}>{c.titulo}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        {cat.campos.map(c => (
          <div key={c.key} className="min-w-[9rem] flex-1">
            <label className="bit-label" htmlFor={`cf-${c.key}`}>{c.label}</label>
            {c.tipo === 'select' ? (
              <select id={`cf-${c.key}`} className="bit-select w-full" value={(form[c.key] as string) ?? ''}
                onChange={e => set(c.key, e.target.value || undefined)}>
                <option value="">—</option>{c.opciones!.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : c.tipo === 'bool' ? (
              <select id={`cf-${c.key}`} className="bit-select w-full" value={form[c.key] == null ? '' : form[c.key] ? '1' : '0'}
                onChange={e => set(c.key, e.target.value === '' ? null : e.target.value === '1')}>
                <option value="">Sin definir</option><option value="1">Sí</option><option value="0">No</option>
              </select>
            ) : c.tipo ? (
              <select id={`cf-${c.key}`} className="bit-select w-full" value={(form[c.key] as number) ?? ''}
                onChange={e => set(c.key, e.target.value ? +e.target.value : null)}>
                <option value="">—</option>{opciones(c).map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            ) : (
              <input id={`cf-${c.key}`} className="bit-input w-full" value={(form[c.key] as string) ?? ''}
                onChange={e => set(c.key, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
            )}
          </div>
        ))}
        <button className="sigma-btn rounded-xl py-2 px-6 font-bold tracking-[0.12em]" onClick={guardar}>
          {editId == null ? 'AGREGAR' : 'GUARDAR'}
        </button>
        {editId != null && <button className="bit-btn-sec" onClick={() => { setEditId(null); setForm({}) }}>Cancelar</button>}
      </div>
      {err && <div role="alert" className="bit-error mb-2">{err}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {cat.campos.map(c => <th key={c.key} className="bit-th">{c.label}</th>)}
              <th className="bit-th">Estado</th><th />
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id} style={{ borderTop: '1px solid var(--line)', opacity: f.activo ? 1 : 0.5 }}>
                {cat.campos.map(c => <td key={c.key} className="px-2 py-2" style={{ color: 'var(--tx)' }}>{celda(c, f)}</td>)}
                <td className="px-2 py-2 bit-note">{f.activo ? 'Activo' : 'Inactivo'}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <button className="bit-btn-sec mr-1" onClick={() => editar(f)}>Editar</button>
                  <button className={`bit-btn-sec ${f.activo ? 'bit-btn-danger' : ''}`} onClick={() => toggleActivo(f)}>
                    {f.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <div className="bit-note py-4 text-center">Sin elementos</div>}
      </div>
    </section>
  )
}
