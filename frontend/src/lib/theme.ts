// Sistema visual compartido — design_handoff_monitoreo_funcional/sistema-visual.md
// Color por estación: constante única para toda la app. Nunca reasignar por
// pantalla — la estación se reconoce por color en las mismas 5-6 vistas.
export const ESTACION_COLOR: Record<string, string> = {
  '402':       'oklch(0.78 0.11 205)',
  KM402:       'oklch(0.78 0.11 205)',
  'KM 402':    'oklch(0.78 0.11 205)',
  VIRU:        'oklch(0.84 0.12 95)',
  FORTALEZA:   'oklch(0.78 0.13 160)',
  HUARMEY:     'oklch(0.78 0.13 45)',
  SANTA:       'oklch(0.76 0.10 300)',
}

export function estacionColor(nombre: string): string {
  return ESTACION_COLOR[nombre.toUpperCase()] ?? 'var(--tx-muted)'
}

// Semáforo — mismos 5 estados en todas las pantallas de monitoreo.
export const SEMAFORO = {
  ok:      'oklch(0.78 0.13 160)',
  warn:    'oklch(0.82 0.13 62)',
  critico: 'oklch(0.70 0.17 22)',
  info:    'oklch(0.78 0.11 205)',
  sinDato: 'transparent',
} as const

// Naranja y rojo del Panel de control (Panel SIGMA v2). Solo los usa el tablero; el resto de
// las pantallas de monitoreo conserva SEMAFORO.
export const PANEL = { acento: '#3fd6c8', naranja: '#ffb84d', rojo: '#ff6b6b' } as const

// Texto — primario / secundario / terciario.
export const TEXTO = {
  primario:   'var(--tx)',
  secundario: 'var(--tx-muted)',
  terciario:  'var(--tx-dim)',
} as const
