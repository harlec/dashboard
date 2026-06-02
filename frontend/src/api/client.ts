const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (res.status === 401) {
    // Solo redirigir si NO estamos ya en /login — evita el loop infinito
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  login:          (u: string, p: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }),
  logout:         () => request('/auth/logout', { method: 'POST' }),
  me:             () => request<{ id: number; username: string; nombre: string; rol: string }>('/auth/me'),
  liveDashboard:  () => request<LiveDashboard>('/dashboard/live'),
  equipoDetail:   (id: number) => request<EquipoDetail>(`/dashboard/equipo/${id}`),
  incidentes:     (p: IncidentesParams) =>
    request<IncidentesPage>(`/incidentes?${new URLSearchParams(p as any)}`),
  camaras:        () => request<CamaraStatus[]>('/camaras'),
  sla:            (p: SlaParams) =>
    request<SlaEquipo[]>(`/reporte/sla?${new URLSearchParams(p as any)}`),
}

// ── Tipos ─────────────────────────────────────────────────────
export interface KpiData {
  total: number; ups: number; downs: number
  sinDatos: number; incActivos: number; uptimePct: number
}

export interface EquipoLive {
  id: number; nombre: string; ip: string
  tipoNombre: string; icono?: string
  ultimoEstado?: string; latenciaMs?: number; ultimoPing?: string
  monitorear: boolean
  incInicio?: string; incMin?: number
}

export interface ViaLive {
  id: number; numero: string; nombre?: string
  equipos: EquipoLive[]
}

export interface EstacionLive {
  id: number; nombre: string; codigo: string
  total: number; up: number; down: number; sin: number
  vias: ViaLive[]
}

export interface LiveDashboard { kpis: KpiData; estaciones: EstacionLive[] }

export interface PingHist { timestamp: string; estado: string; latenciaMs?: number }
export interface EquipoDetail {
  id: number; nombre: string; ip: string; tipoNombre: string
  ultimoEstado?: string; latenciaMs?: number; ultimoPing?: string
  incInicio?: string; incMin?: number
  historial: PingHist[]
}

export interface IncidenteItem {
  id: number; equipoId: number; equipoNombre: string
  estacion: string; via: string
  inicio: string; fin?: string; duracionMin?: number
}
export interface IncidentesPage { total: number; page: number; pageSize: number; items: IncidenteItem[] }
export interface IncidentesParams { page?: number; pageSize?: number; soloAbiertos?: boolean; desde?: string; hasta?: string }

export interface CamaraStatus { id: number; camara: number; ultimoEmail?: string; minDesdeEmail?: number; online: boolean }

export interface SlaEquipo { equipoId: number; nombre: string; tipoNombre: string; via: string; uptimePct: number; totalMin: number; downMin: number }
export interface SlaParams { estacionId?: number; desde?: string; hasta?: string }
