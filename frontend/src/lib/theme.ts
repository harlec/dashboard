// Sistema visual compartido — design_handoff_monitoreo_funcional/sistema-visual.md
// Color por estación: constante única para toda la app. Nunca reasignar por
// pantalla — la estación se reconoce por color en las mismas 5-6 vistas.
export const ESTACION_COLOR: Record<string, string> = {
  '402':       'light-dark(oklch(0.521 0.121 205), oklch(0.78 0.11 205))',
  KM402:       'light-dark(oklch(0.521 0.121 205), oklch(0.78 0.11 205))',
  'KM 402':    'light-dark(oklch(0.521 0.121 205), oklch(0.78 0.11 205))',
  VIRU:        'light-dark(oklch(0.488 0.132 95), oklch(0.84 0.12 95))',
  FORTALEZA:   'light-dark(oklch(0.521 0.143 160), oklch(0.78 0.13 160))',
  HUARMEY:     'light-dark(oklch(0.521 0.143 45), oklch(0.78 0.13 45))',
  SANTA:       'light-dark(oklch(0.532 0.110 300), oklch(0.76 0.10 300))',
}

export function estacionColor(nombre: string): string {
  return ESTACION_COLOR[nombre.toUpperCase()] ?? 'var(--tx-muted)'
}

// Semáforo — mismos 5 estados en todas las pantallas de monitoreo.
export const SEMAFORO = {
  ok:      'light-dark(oklch(0.521 0.143 160), oklch(0.78 0.13 160))',
  warn:    'light-dark(oklch(0.499 0.143 62), oklch(0.82 0.13 62))',
  critico: 'light-dark(oklch(0.565 0.170 22), oklch(0.70 0.17 22))',
  info:    'light-dark(oklch(0.521 0.121 205), oklch(0.78 0.11 205))',
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
