import { useEffect, useState } from 'react'
import { api, type RedAlerta, type RedEnlace, type RedRango } from '../api/client'
import { EnlaceCard } from '../components/EnlaceCard'
import { Panel } from '../components/Panel'
import { RangeSegmented } from '../components/RangeSegmented'
import { SEMAFORO, TEXTO } from '../lib/theme'

const RANGOS = [
  { key: '1h',  label: '1 hora' },
  { key: '24h', label: '24 horas' },
  { key: '7d',  label: '7 días' },
] as const

function dur(inicio: string, fin: string | null) {
  const min = Math.max(0, Math.round(((fin ? new Date(fin) : new Date()).getTime() - new Date(inicio).getTime()) / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function Red() {
  const [enlaces, setEnlaces] = useState<RedEnlace[] | null>(null)
  const [alertas, setAlertas] = useState<RedAlerta[]>([])
  const [rango, setRango] = useState<RedRango>('1h')

  useEffect(() => {
    const cargar = () => {
      api.redEstado().then(setEnlaces).catch(() => {})
      api.redAlertas(30).then(setAlertas).catch(() => {})
    }
    cargar()
    const id = setInterval(cargar, 30_000)
    return () => clearInterval(id)
  }, [])

  if (!enlaces) return <div className="flex items-center justify-center min-h-[60vh] text-muted">Cargando…</div>

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: TEXTO.primario }}>Red · Saturación de enlaces</h1>
          <div style={{ fontSize: 14, color: TEXTO.secundario }}>
            Uso medido contra el ancho de banda contratado · actualiza cada 30 s
          </div>
        </div>
        <RangeSegmented options={RANGOS} value={rango} onChange={setRango} />
      </div>

      {enlaces.length === 0 ? (
        <Panel><div style={{ color: TEXTO.secundario }}>No hay enlaces configurados (net_link).</div></Panel>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))' }}>
          {enlaces.map(e => <EnlaceCard key={e.id} enlace={e} rango={rango} />)}
        </div>
      )}

      <Panel style={{ gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: TEXTO.primario }}>Alertas (últimos 30 días)</div>
        {alertas.length === 0 ? (
          <div style={{ fontSize: 14, color: TEXTO.secundario }}>Sin alertas.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 14, color: TEXTO.primario, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: TEXTO.terciario, textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>Enlace</th><th>Tipo</th><th>Inicio</th><th>Duración</th><th>Pico</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid rgb(var(--ov) / 0.06)' }}>
                  <td style={{ padding: '6px 8px' }}>{a.enlace} <span style={{ color: TEXTO.terciario }}>({a.interfaz})</span></td>
                  <td>{a.tipo === 'SATURACION' ? 'Saturación' : 'Sin datos'}</td>
                  <td>{new Date(a.inicio).toLocaleString('es-PE')}</td>
                  <td>{dur(a.inicio, a.fin)}</td>
                  <td>{a.pico != null ? `${a.pico.toFixed(0)}%` : '—'}</td>
                  <td style={{ color: a.fin ? TEXTO.secundario : (a.tipo === 'SATURACION' ? SEMAFORO.critico : SEMAFORO.warn) }}>
                    {a.fin ? 'Cerrada' : 'Activa'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
