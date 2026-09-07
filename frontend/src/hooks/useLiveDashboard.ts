import { useEffect, useState, useCallback } from 'react'
import { api, type LiveDashboard } from '../api/client'
import { useSignalR } from './useSignalR'

// onIncidenteEvento: se dispara con cada apertura/cierre real de incidente (no con
// cada ping) — para que una pantalla como el muro NOC pueda refrescar de inmediato
// su lista de "Requieren atención" en vez de esperar a su próximo poll periódico.
export function useLiveDashboard(onAlert?: (estado: 'UP' | 'DOWN') => void, onIncidenteEvento?: () => void) {
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

  // Red de seguridad: si el WebSocket queda permanentemente caído (agotó los
  // reintentos automáticos de SignalR tras un corte largo — wifi, VPN, laptop en
  // suspensión), esto igual reconcilia el estado real cada par de minutos en vez
  // de dejar la pantalla "pegada" hasta un refresco manual de la página.
  useEffect(() => {
    const id = setInterval(load, 120_000)
    return () => clearInterval(id)
  }, [load])

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
    onIncidenteAbierto: () => onIncidenteEvento?.(),
    onIncidenteCerrado: () => onIncidenteEvento?.(),
    // La reconexión automática de SignalR resume el flujo de eventos NUEVOS, pero
    // no reenvía lo que se perdió durante el corte — sin esto, un equipo que cambió
    // de estado justo en ese hueco se queda mostrando el valor viejo indefinidamente
    // (o hasta su próximo cambio real). Un refresco completo por REST al reconectar
    // corrige cualquier estado desincronizado al instante.
    onReconnected: () => load(),
  })

  return { data, signalStatus, lastUpdate }
}
