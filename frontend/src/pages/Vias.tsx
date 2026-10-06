import { useEffect, useState } from 'react'
import { api, type EquipoLive, type Mantenimiento } from '../api/client'
import { useLiveDashboard } from '../hooks/useLiveDashboard'
import { useAlertSound } from '../hooks/useAlertSound'
import { DonutChart } from '../components/DonutChart'
import { MatrizEquipos } from '../components/MatrizEquipos'
import { EquipoModal } from '../components/EquipoModal'
import { computarIncidentesAgrupados, type ExclusionMantenimiento } from '../lib/incidentesAgrupados'

// Vías: misma matriz "Equipos en campo" del Muro NOC (con el switch "Resaltar
// solo fallas"), más los avisos de mantenimiento e incidentes de vía/peaje.
// Vive dentro del lienzo escalado (ScaledPage) con el header común (WallTopbar).
export function Vias() {
  const { playDown, playUp, toggleMute } = useAlertSound()
  const { data, lastUpdate } = useLiveDashboard(estado => (estado === 'DOWN' ? playDown() : playUp()))
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([])
  const [selected, setSelected] = useState<EquipoLive | null>(null)
  const [muted, setMuted] = useState(false)

  // Mantenimientos activos — se refresca cada minuto, no necesita tiempo real
  useEffect(() => {
    const loadMtto = () => api.mantenimientos(true).then(setMantenimientos).catch(() => {})
    loadMtto()
    const id = setInterval(loadMtto, 60_000)
    return () => clearInterval(id)
  }, [])

  if (!data) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'oklch(0.60 0.015 265)' }}>
      Cargando…
    </div>
  )

  const { kpis, estaciones } = data
  const exclusionMtto: ExclusionMantenimiento = {
    estaciones: new Set(mantenimientos.filter(m => m.estacionId).map(m => m.estacionId!)),
    vias:       new Set(mantenimientos.filter(m => m.viaId).map(m => m.viaId!)),
  }
  const grupos = computarIncidentesAgrupados(estaciones, undefined, exclusionMtto)
  const sinD = Math.max(kpis.total - kpis.ups - kpis.downs - kpis.incActivos, 0)
  const card: React.CSSProperties = {
    boxSizing: 'border-box', borderRadius: 24, padding: '18px 26px',
    background: 'linear-gradient(180deg, oklch(0.225 0.018 262 / 0.92) 0%, oklch(0.185 0.016 262 / 0.92) 100%)',
    boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.32)',
  }
  const titulo: React.CSSProperties = { fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'oklch(0.58 0.015 265)' }
  const leyenda = [
    { color: '#72BF44', val: kpis.ups,       label: 'Operativos' },
    { color: '#F04545', val: kpis.downs,      label: 'Caídos' },
    { color: '#F99B1C', val: kpis.incActivos, label: 'Incidentes' },
    { color: '#4b5263', val: sinD,            label: 'Sin datos' },
  ]

  const banner = (key: string | number, rojo: boolean, titulo: string, texto: React.ReactNode) => (
    <div key={key} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderRadius: 14, fontSize: 17,
      background: rojo ? 'linear-gradient(100deg, oklch(0.34 0.085 15 / 0.42), oklch(0.26 0.04 15 / 0.22))'
                       : 'linear-gradient(100deg, oklch(0.34 0.07 250 / 0.40), oklch(0.26 0.04 250 / 0.20))',
      boxShadow: rojo ? 'inset 0 0 0 1px oklch(0.60 0.12 15 / 0.25)' : 'inset 0 0 0 1px oklch(0.62 0.10 250 / 0.25)',
    }}>
      <span style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 15, color: rojo ? 'oklch(0.80 0.12 15)' : 'oklch(0.80 0.10 250)' }}>{titulo}</span>
      <span style={{ fontWeight: 500 }}>{texto}</span>
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.015em' }}>Vías</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'oklch(0.56 0.015 265)' }}>
            estado en tiempo real · actualizado {lastUpdate.toLocaleTimeString('es-PE', { hour12: false })} · {estaciones.length} estaciones · {kpis.ups}/{kpis.total} equipos operativos
          </div>
        </div>
        <div onClick={() => setMuted(toggleMute())} style={{
          cursor: 'pointer', fontSize: 15, fontWeight: 500, padding: '7px 16px', borderRadius: 999, color: 'oklch(0.72 0.015 265)',
          background: 'oklch(0.24 0.018 262 / 0.80)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.06)',
        }}>
          {muted ? '🔇 Silenciado' : '🔔 Sonido activo'}
        </div>
      </div>

      {mantenimientos.map(m => banner(`m${m.id}`, false, '🔧 Mantenimiento',
        `${m.estacion ?? m.via ?? m.equipo} — ${m.motivo} (hasta ${new Date(m.hasta).toLocaleTimeString('es-PE', { hour12: false })})`))}

      {grupos.map((g, i) => banner(`g${i}`, true, g.tipo === 'peaje' ? 'Incidente de peaje' : 'Incidente de vía',
        g.tipo === 'peaje'
          ? <>{g.estacion} — {g.pct}% caído ({g.caidos}/{g.total} equipos)</>
          : <>Vía {g.via} ({g.estacion}) sin conexión — {g.caidos}/{g.total} equipos</>))}

      {/* ── Resumen ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.5fr 0.8fr', gap: 18 }}>
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 34 }}>
          <div style={{ transform: 'scale(1.25)', transformOrigin: 'center', margin: '14px 14px' }}>
            <DonutChart ups={kpis.ups} downs={kpis.downs} incActivos={kpis.incActivos} total={kpis.total} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 30px' }}>
            {leyenda.map(l => (
              <div key={l.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500, color: 'oklch(0.64 0.015 265)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, boxShadow: `0 0 10px ${l.color}88` }} />{l.label}
                </div>
                <div style={{ fontSize: 34, fontWeight: 300, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: l.color === '#4b5263' ? 'oklch(0.66 0.015 265)' : l.color }}>{l.val}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 9, justifyContent: 'center' }}>
          <div style={titulo}>Disponibilidad por estación</div>
          {[...estaciones].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(e => {
            const pct = e.total > 0 ? Math.round(e.up / e.total * 100) : 0
            const ok = e.up === e.total
            return (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>{e.nombre.toUpperCase()}</span>
                <div style={{ height: 9, borderRadius: 999, background: 'oklch(1 0 0 / 0.07)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 999,
                    background: ok ? 'linear-gradient(90deg, oklch(0.68 0.10 200), oklch(0.84 0.12 175))' : 'linear-gradient(90deg, oklch(0.70 0.10 90), oklch(0.84 0.13 62))',
                  }} />
                </div>
                <span style={{ fontSize: 16, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ok ? 'oklch(0.84 0.11 175)' : 'oklch(0.86 0.12 62)' }}>{e.up}/{e.total}</span>
              </div>
            )
          })}
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, background: 'linear-gradient(160deg, #72BF4438 0%, oklch(0.21 0.022 265 / 0.55) 100%)' }}>
          <div style={{ ...titulo, color: '#72BF44' }}>Uptime red</div>
          <div style={{ fontSize: 64, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: '#B6EA94' }}>
            {kpis.uptimePct}<span style={{ fontSize: 32 }}>%</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.62 0.03 145)' }}>{kpis.ups} de {kpis.total} equipos en línea</div>
        </div>
      </div>

      <MatrizEquipos estaciones={estaciones} onEquipoClick={setSelected} />

      <EquipoModal equipo={selected} onClose={() => setSelected(null)} />
    </>
  )
}
