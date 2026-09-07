import { useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'

export type SignalRHandlers = {
  onEquipoStatusChanged?: (equipoId: number, estado: string, latenciaMs: number | null, timestamp: string, alerta: boolean) => void
  onKpiUpdated?: (ups: number, downs: number, total: number, incActivos: number) => void
  onIncidenteAbierto?: (equipoId: number, inicio: string) => void
  onIncidenteCerrado?: (equipoId: number, fin: string, duracionMin: number) => void
  onCamaraUpdated?: (camara: number, ultimoEmail: string, minDesde: number, online: boolean) => void
  onEnlaceChanged?: (estacionId: number, enlace: string, hop: string) => void
  // Se dispara cuando la conexión se recupera después de un corte (wifi, VPN, laptop
  // en suspensión, etc.) — mientras estuvo caída, cualquier EquipoStatusChanged real
  // se perdió sin más aviso, así que el estado en pantalla puede quedar "pegado" en
  // el último valor recibido hasta que llegue otro evento para ese mismo equipo. Un
  // consumidor típico usa esto para volver a pedir el snapshot completo por REST.
  onReconnected?: () => void
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
    if (handlers.onEnlaceChanged)
      conn.on('EnlaceChanged', handlers.onEnlaceChanged)

    if (handlers.onReconnected)
      conn.onreconnected(() => handlers.onReconnected?.())

    conn.start().catch(console.error)
    connRef.current = conn

    return () => { conn.stop() }
  }, [])

  return connRef
}
