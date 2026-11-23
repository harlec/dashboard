import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type RedEnlace, type RedEstadoEnlace, type RedPunto, type RedRango } from '../api/client'
import { Panel } from './Panel'
import { SEMAFORO, TEXTO } from '../lib/theme'

const COLOR: Record<RedEstadoEnlace, string> = {
  ok: SEMAFORO.ok, warn: SEMAFORO.warn, critico: SEMAFORO.critico, info: SEMAFORO.info, sin_datos: 'var(--tx-dim)',
}
const ETIQUETA: Record<RedEstadoEnlace, string> = {
  ok: 'Normal', warn: 'Atención', critico: 'Saturado', info: 'Informativo', sin_datos: 'Sin datos',
}
const COLOR_IN  = 'light-dark(oklch(0.78 0.11 205), oklch(0.521 0.121 205))'
const COLOR_OUT = 'light-dark(oklch(0.82 0.13 62), oklch(0.499 0.143 62))'

const fmtPct  = (v: number | null) => v == null ? '—' : `${v.toFixed(v < 10 ? 1 : 0)}%`
const fmtMbps = (v: number | null) => v == null ? '—' : v.toFixed(v < 10 ? 2 : 1)

function fmtHora(ts: string, rango: RedRango) {
  const d = new Date(ts)
  return rango === '7d'
    ? d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit' })
    : d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function Medidor({ etiqueta, pct, mbps, contratado, color }: {
  etiqueta: string; pct: number | null; mbps: number | null; contratado: number | null; color: string
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 13, color: TEXTO.secundario }}>{etiqueta}</span>
        <span style={{ fontSize: 26, fontWeight: 700, color: TEXTO.primario }}>{fmtPct(pct)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgb(var(--ov) / 0.07)', margin: '4px 0' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${Math.min(pct ?? 0, 100)}%` }} />
      </div>
      <div style={{ fontSize: 13, color: TEXTO.secundario }}>
        {fmtMbps(mbps)} Mbps{contratado != null ? ` de ${contratado}` : ''}
      </div>
    </div>
  )
}

export function EnlaceCard({ enlace, rango }: { enlace: RedEnlace; rango: RedRango }) {
  const [serie, setSerie] = useState<RedPunto[]>([])

  useEffect(() => {
    let vivo = true
    const cargar = () => api.redSerie(enlace.id, rango).then(d => vivo && setSerie(d)).catch(() => {})
    cargar()
    const id = setInterval(cargar, 60_000)
    return () => { vivo = false; clearInterval(id) }
  }, [enlace.id, rango])

  const color = COLOR[enlace.estado]
  const titulo = `${enlace.rol === 'INTERNET' ? 'Internet' : enlace.rol === 'MPLS' ? 'MPLS Entel' : 'LAN (total)'}`

  return (
    <Panel style={{ gap: 12 }}>
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXTO.primario }}>{titulo}</div>
          <div style={{ fontSize: 12, color: TEXTO.terciario }}>
            {enlace.sitio} · {enlace.interfaz}{enlace.zona ? ` · ${enlace.zona}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ width: 12, height: 12, borderRadius: 6, background: color, boxShadow: `0 0 10px ${color}` }} />
          <span style={{ fontSize: 14, fontWeight: 600, color }}>{ETIQUETA[enlace.estado]}</span>
        </div>
      </div>

      <div className="flex gap-5">
        <Medidor etiqueta="Entrada" pct={enlace.utilInPct}  mbps={enlace.inMbps}  contratado={enlace.mbpsContratadoIn}  color={COLOR_IN} />
        <Medidor etiqueta="Salida"  pct={enlace.utilOutPct} mbps={enlace.outMbps} contratado={enlace.mbpsContratadoOut} color={COLOR_OUT} />
      </div>

      {enlace.alertaSaturacion && (
        <div style={{ fontSize: 13, color: SEMAFORO.critico }}>
          Saturación activa desde {new Date(enlace.alertaSaturacion.inicio).toLocaleString('es-PE')} · pico {fmtPct(enlace.alertaSaturacion.pico)}
        </div>
      )}
      {enlace.alertaSinDatos && (
        <div style={{ fontSize: 13, color: TEXTO.secundario }}>
          El firewall no responde — no se puede medir este enlace (no implica saturación).
        </div>
      )}

      <div style={{ height: 180 }}>
        {serie.length === 0 ? (
          <div className="h-full flex items-center justify-center" style={{ color: TEXTO.terciario, fontSize: 13 }}>
            Sin muestras en este rango
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="rgb(var(--ov) / 0.06)" vertical={false} />
              <XAxis dataKey="ts" tickFormatter={t => fmtHora(t, rango)} stroke={TEXTO.terciario} fontSize={11} minTickGap={40} />
              <YAxis stroke={TEXTO.terciario} fontSize={11} unit=" M" />
              <Tooltip
                labelFormatter={t => new Date(t as string).toLocaleString('es-PE')}
                formatter={(v, n) => [`${Number(v).toFixed(1)} Mbps`, n]}
                contentStyle={{ background: 'rgb(var(--s0))', border: 'none', borderRadius: 8, fontSize: 12 }} />
              {enlace.mbpsContratadoIn != null && enlace.medirAlerta && (
                <ReferenceLine y={enlace.mbpsContratadoIn * enlace.umbralCritPct / 100}
                  stroke={SEMAFORO.critico} strokeDasharray="4 4" />
              )}
              <Area type="monotone" dataKey="inMbps"  name="Entrada" stroke={COLOR_IN}  fill={COLOR_IN}  fillOpacity={0.18} dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="outMbps" name="Salida"  stroke={COLOR_OUT} fill={COLOR_OUT} fillOpacity={0.18} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  )
}
