import { useEffect, useState, useCallback } from 'react'
import { api, type LiveDashboard } from '../api/client'
import { useSignalR } from './useSignalR'

export function useLiveDashboard(onAlert?: (estado: 'UP' | 'DOWN') => void) {
  const [data,         setData]       = useState<LiveDashboard | null>(null)
  const [signalStatus, setSignal]     = useState<'idle' | 'ok' | 'error'>('idle')
  const [lastUpdate,   setLastUpdate] = useState<Date>(new Date())

  const load = useCallback(async () => {
    try {
      setData(await api.liveDashboard())
      setLastUpdate(new Date())
      setSignal('ok')
    } catch {
      setSignal('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  useSignalR({
    onEquipoStatusChanged: (equipoId, estado, latenciaMs, timestamp, alerta) => {
      setSignal('ok')
      if (alerta && (estado === 'UP' || estado === 'DOWN')) onAlert?.(estado)
      setData(prev => {
        if (!prev) return prev
        const estaciones = prev.estaciones.map(est => {
          const vias = est.vias.map(via => ({
            ...via,
            equipos: via.equipos.map(eq =>
              eq.id === equipoId
                ? { ...eq, ultimoEstado: estado, latenciaMs: latenciaMs ?? undefined, ultimoPing: timestamp }
                : eq)
          }))
          // Recalcular contadores UP/DN/sin para que el gauge se actualice
          const monitoreados = vias.flatMap(v => v.equipos).filter(e => e.monitorear)
          const up   = monitoreados.filter(e => e.ultimoEstado === 'UP').length
          const down = monitoreados.filter(e => e.ultimoEstado === 'DOWN').length
          const sin  = monitoreados.filter(e => !e.ultimoEstado).length
          return { ...est, vias, up, down, sin }
        })
        return { ...prev, estaciones }
      })
      setLastUpdate(new Date())
    },
    onEnlaceChanged: (estacionId, enlace) => {
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          estaciones: prev.estaciones.map(est =>
            est.id === estacionId ? { ...est, enlace } : est)
        }
      })
    },
    onKpiUpdated: (ups, downs, total, incActivos) => {
      setData(prev => {
        if (!prev) return prev
        const sinDatos  = total - ups - downs
        const uptimePct = total > 0 ? Math.round(ups / total * 100) : 0
        return { ...prev, kpis: { ...prev.kpis, ups, downs, total, sinDatos, incActivos, uptimePct } }
      })
    },
  })

  return { data, signalStatus, lastUpdate }
}
