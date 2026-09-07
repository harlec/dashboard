import type { EstacionLive } from '../api/client'

export interface GrupoIncidente {
  tipo: 'via' | 'peaje'
  estacionId: number
  estacion: string
  via?: string
  caidos: number
  total: number
  pct: number
}

// Peaje se considera "incidente de sede" desde este % de equipos caídos.
// Por debajo de esto (ej. 2 vías apagadas a propósito para mantenimiento en
// un peaje de 8 vías = 25%) no se considera un incidente de peaje.
export const UMBRAL_PEAJE_PCT = 50

// Agrupa caídas individuales en "incidente de vía" (todos los equipos
// monitoreados de una vía sin conexión) e "incidente de peaje" (% del
// peaje caído por encima del umbral) — evita que 4-8 alertas individuales
// se vean como eventos sueltos cuando en realidad es un enlace o corte único.
export interface ExclusionMantenimiento {
  estaciones: Set<number>  // toda la estación en mantenimiento
  vias: Set<number>        // vía puntual en mantenimiento (por id de vía)
}

export function computarIncidentesAgrupados(
  estaciones: EstacionLive[],
  umbralPeajePct = UMBRAL_PEAJE_PCT,
  exclusion?: ExclusionMantenimiento,
): GrupoIncidente[] {
  const grupos: GrupoIncidente[] = []

  for (const est of estaciones) {
    if (exclusion?.estaciones.has(est.id)) continue // peaje completo en mantenimiento — no alarmar

    for (const via of est.vias) {
      if (exclusion?.vias.has(via.id)) continue // vía puntual en mantenimiento

      const monitoreados = via.equipos.filter(e => e.monitorear)
      // Requiere al menos 2 equipos en la vía — si solo hay 1, es una caída
      // individual normal, no un patrón de "vía sin conexión".
      if (monitoreados.length >= 2 && monitoreados.every(e => e.ultimoEstado === 'DOWN')) {
        grupos.push({
          tipo: 'via', estacionId: est.id, estacion: est.nombre, via: via.numero,
          caidos: monitoreados.length, total: monitoreados.length, pct: 100,
        })
      }
    }

    if (est.total > 0) {
      const pct = (est.down / est.total) * 100
      if (pct >= umbralPeajePct) {
        grupos.push({
          tipo: 'peaje', estacionId: est.id, estacion: est.nombre,
          caidos: est.down, total: est.total, pct: Math.round(pct),
        })
      }
    }
  }

  return grupos
}
