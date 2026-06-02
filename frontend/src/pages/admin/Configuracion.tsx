import { useEffect, useState } from 'react'
import { Field, Input } from '../../components/admin/FormModal'

interface Config { clave: string; valor: string }

const LABELS: Record<string, { label: string; desc: string; type?: string }> = {
  alertas_activas:  { label: 'Alertas activas',   desc: '1 = activado, 0 = desactivado' },
  email_alertas:    { label: 'Email de alertas',   desc: 'Destinatario de alertas DOWN/UP' },
  intervalo_min:    { label: 'Intervalo ping (min)', desc: 'Cada cuántos minutos se hace ping' },
  pings_por_ciclo:  { label: 'Pings por host',     desc: 'Cantidad de pings por equipo por ciclo' },
  timeout_ping_s:   { label: 'Timeout ping (seg)', desc: 'Segundos antes de considerar timeout' },
  smtp_host:        { label: 'SMTP Host',          desc: 'Servidor SMTP para alertas' },
  smtp_puerto:      { label: 'SMTP Puerto',        desc: 'Puerto SMTP (587 para TLS)' },
  smtp_usuario:     { label: 'SMTP Usuario',       desc: 'Email de envío' },
  smtp_password:    { label: 'SMTP Contraseña',    desc: 'Contraseña del email', type: 'password' },
}

export function AdminConfiguracion() {
  const [rows,    setRows]    = useState<Config[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [values,  setValues]  = useState<Record<string, string>>({})
  const [saved,   setSaved]   = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/config', { credentials: 'include' })
      .then(r => r.json())
      .then((data: Config[]) => {
        setRows(data)
        setValues(Object.fromEntries(data.map(r => [r.clave, r.valor])))
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async (clave: string) => {
    setSaving(clave)
    await fetch(`/api/config/${clave}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: values[clave] })
    })
    setSaving(null)
    setSaved(p => ({ ...p, [clave]: true }))
    setTimeout(() => setSaved(p => ({ ...p, [clave]: false })), 2000)
  }

  if (loading) return <div className="text-center py-12 text-muted">Cargando…</div>

  return (
    <div>
      <h1 className="text-xl font-extrabold text-[#eae7e4] mb-2">Configuración</h1>
      <p className="text-sm text-muted mb-6">
        Los cambios de intervalo/pings se aplican en el próximo ciclo del worker.
        Los cambios SMTP se aplican inmediatamente a la siguiente alerta.
      </p>

      <div className="flex flex-col gap-3 max-w-xl">
        {rows.map(r => {
          const meta = LABELS[r.clave] ?? { label: r.clave, desc: '' }
          return (
            <div key={r.clave} className="bg-surface rounded-xl p-4 border border-border">
              <div className="font-bold text-sm text-[#eae7e4] mb-0.5">{meta.label}</div>
              <div className="text-xs text-muted mb-2">{meta.desc}</div>
              <div className="flex gap-2 items-center">
                <Input
                  type={meta.type ?? 'text'}
                  value={values[r.clave] ?? ''}
                  onChange={e => setValues(p => ({ ...p, [r.clave]: e.target.value }))}
                  className="flex-1"
                />
                <button
                  onClick={() => save(r.clave)}
                  disabled={saving === r.clave}
                  className="px-3 py-2 rounded-lg text-sm font-bold transition-all
                    bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
                >
                  {saved[r.clave] ? '✓ Guardado' : saving === r.clave ? '…' : 'Guardar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
