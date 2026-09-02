import type { IncidenteTipo } from '../api/client'

export const TIPO_LABELS: Record<IncidenteTipo, string> = {
  Real: 'Real', Mantenimiento: 'Mantenimiento',
  ReinicioForzado: 'Reinicio forzado', Otro: 'Otro',
}

export const TIPO_COLORS: Record<IncidenteTipo, string> = {
  Real: 'text-danger', Mantenimiento: 'text-brand',
  ReinicioForzado: 'text-warn', Otro: 'text-muted',
}
