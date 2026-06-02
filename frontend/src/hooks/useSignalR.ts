import { useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'

export type SignalRHandlers = {
  onEquipoStatusChanged?: (equipoId: number, estado: string, latenciaMs: number | null, timestamp: string) => void
  onKpiUpdated?: (ups: number, downs: number, total: number, incActivos: number) => void
  onIncidenteAbierto?: (equipoId: number, inicio: string) => void
  onIncidenteCerrado?: (equipoId: number, fin: string, duracionMin: number) => void
  onCamaraUpdated?: (camara: number, ultimoEmail: string, minDesde: number, online: boolean) => void
}

export function useSignalR(handlers: SignalRHandlers) {
  const connRef = useRef<signalR.HubConnection | null>(null)

  useEffect(() => {
    const conn = new signalR.HubConnectionBuilder()
      .withUrl('/hub/monitor', { withCredentials: true })
      .withAutomaticReconnect()
      .build()

    if (handlers.onEquipoStatusChanged)
      conn.on('EquipoStatusChanged', handlers.onEquipoStatusChanged)
    if (handlers.onKpiUpdated)
      conn.on('KpiUpdated', handlers.onKpiUpdated)
    if (handlers.onIncidenteAbierto)
      conn.on('IncidenteAbierto', handlers.onIncidenteAbierto)
    if (handlers.onIncidenteCerrado)
      conn.on('IncidenteCerrado', handlers.onIncidenteCerrado)
    if (handlers.onCamaraUpdated)
      conn.on('CamaraUpdated', handlers.onCamaraUpdated)

    conn.start().catch(console.error)
    connRef.current = conn

    return () => { conn.stop() }
  }, [])

  return connRef
}
