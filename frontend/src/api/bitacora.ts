// Cliente de la API de Bitácora (/api/bitacora). Los errores del backend traen { error } con el mensaje en español.
const BASE = '/api/bitacora'

export interface Sede { id: number; codigo: string; nombre: string; tipo: string }
export interface Categoria { id: number; nombre: string; segmento: string; aplicaSla: boolean | null }
export interface Proveedor { id: number; nombre: string }
export interface Persona { id: number; nombre: string; sedeBase: string | null }
export interface PalabraClaveDto { id: number; palabra: string; sedeId: number | null; categoriaId: number | null }
export interface Catalogos {
  sedes: Sede[]; categorias: Categoria[]; proveedores: Proveedor[]; personal: Persona[]
  palabrasClave: PalabraClaveDto[]; miPersonalId: number | null
}
export interface Registro {
  id: number; fecha: string; descripcion: string
  categoriaId: number; categoria: string; responsableId: number; responsable: string
  proveedorId: number | null; proveedor: string | null; solicitante: string | null
  duracionMin: number | null; estado: number; equipoRef: string | null
  sedes: { id: number; codigo: string }[]; puedeEditar: boolean
}
export interface Pagina { total: number; page: number; pageSize: number; items: Registro[] }
export interface Resumen {
  hoy: number; semana: number; minutosSemana: number; horasSemana: number
  porSede: { nombre: string; total: number }[]; porCategoria: { nombre: string; total: number }[]; porResponsable: { nombre: string; total: number }[]
}
export interface Reciente { descripcion: string; categoriaId: number; categoria: string; duracionMin: number | null; sedeIds: number[] }
export interface RegistroInput {
  descripcion: string; sedeIds: number[]; fecha?: string | null; categoriaId?: number | null; responsableId?: number | null
  proveedorId?: number | null; solicitante?: string | null; duracionMin?: number | null; estado?: number | null; equipoRef?: string | null
}
export interface Filtros {
  desde?: string; hasta?: string; sedeId?: number | ''; categoriaId?: number | ''; responsableId?: number | ''; q?: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized') }
  if (!res.ok) {
    const txt = await res.text()
    let msg = txt
    try { msg = JSON.parse(txt).error ?? txt } catch { /* texto plano */ }
    throw new Error(msg || `Error ${res.status}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export function qs(f: Filtros & { page?: number; pageSize?: number }): string {
  const p = new URLSearchParams()
  Object.entries(f).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)) })
  return p.toString()
}

export const bitacoraApi = {
  catalogos: () => req<Catalogos>('/catalogos'),
  resumen:   () => req<Resumen>('/resumen'),
  recientes: () => req<Reciente[]>('/recientes'),
  lista:     (f: Filtros & { page: number; pageSize: number }) => req<Pagina>(`?${qs(f)}`),
  exportarUrl: (f: Filtros) => `${BASE}/exportar?${qs(f)}`,
  crear:     (r: RegistroInput) => req<{ id: number; hoy: number }>('', { method: 'POST', body: JSON.stringify(r) }),
  editar:    (id: number, r: RegistroInput) => req<{ id: number }>(`/${id}`, { method: 'PUT', body: JSON.stringify(r) }),
  eliminar:  (id: number) => req<void>(`/${id}`, { method: 'DELETE' }),
  admin: {
    lista:     (cat: string) => req<Record<string, unknown>[]>(`/admin/${cat}`),
    crear:     (cat: string, body: object) => req<unknown>(`/admin/${cat}`, { method: 'POST', body: JSON.stringify(body) }),
    editar:    (cat: string, id: number, body: object) => req<unknown>(`/admin/${cat}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    desactivar: (cat: string, id: number) => req<void>(`/admin/${cat}/${id}`, { method: 'DELETE' }),
  },
}
