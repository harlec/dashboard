import type { ViaConteo } from '../api/client'

// % de discrepancia sobre el que una vía se considera degradada
export const UMBRAL_DAC = 20
// A partir de aquí queda "en vigilancia" (todavía no degradada)
export const UMBRAL_DAC_VIGILANCIA = 12

export type SeveridadDac = 'ok' | 'warn' | 'critico'

// Severidad de una vía según `pctWilson`: el límite inferior del intervalo de Wilson
// (95%) de su % de discrepancia, calculado en el backend. Es el % "confirmado": una vía
// con 2 tránsitos y 1 discrepancia marca 50% a secas pero solo ~9% confirmado, así que
// no alarma; una con 100 tránsitos y 40 discrepancias sí (~31%). Con mucho volumen el
// valor converge al % normal. Reemplaza el viejo criterio de "% + mínimo de tránsitos".
export function severidadDac(v: Pick<ViaConteo, 'pctWilson'>): SeveridadDac {
  if (v.pctWilson > UMBRAL_DAC) return 'critico'
  if (v.pctWilson > UMBRAL_DAC_VIGILANCIA) return 'warn'
  return 'ok'
}
