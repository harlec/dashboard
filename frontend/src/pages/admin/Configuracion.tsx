import { useEffect, useState } from 'react'
import { Field, Input } from '../../components/admin/FormModal'
import { useAlertSound } from '../../hooks/useAlertSound'

interface Config { clave: string; valor: string }

const LABELS: Record<string, { label: string; desc: string; type?: string }> = {
  alertas_activas:  { label: 'Alertas activas',   desc: '1 = activado, 0 = desactivado' },
  email_alertas:    { label: 'Email de alertas',   desc: 'Destinatario de alertas DOWN/UP' },
  email_reporte_semanal: { label: 'Email reporte semanal', desc: 'Destinatarios del reporte de disponibilidad de equipos críticos (separados por coma) — se envía lunes 8am' },
  intervalo_min:    { label: 'Intervalo ping (min)', desc: 'Cada cuántos minutos se hace ping' },
  pings_por_ciclo:  { label: 'Pings por host',     desc: 'Cantidad de pings por equipo por ciclo' },
  timeout_ping_s:   { label: 'Timeout ping (seg)', desc: 'Segundos antes de considerar timeout' },
  smtp_host:        { label: 'SMTP Host',          desc: 'Servidor SMTP para alertas' },
  smtp_puerto:      { label: 'SMTP Puerto',        desc: 'Puerto SMTP (587 para TLS)' },
  smtp_usuario:     { label: 'SMTP Usuario',       desc: 'Email de envío' },
  smtp_password:    { label: 'SMTP Contraseña',    desc: 'Contraseña del email', type: 'password' },
  telegram_bot_token: { label: 'Telegram Bot Token', desc: 'Token del bot de Telegram para alertas', type: 'password' },
  telegram_chat_id:   { label: 'Telegram Chat ID',   desc: 'ID del grupo/chat de Telegram donde se envían las alertas' },
  agente_servicios_permitidos: { label: 'Servicios reiniciables', desc: 'Nombres de servicio Windows separados por coma, permitidos para reinicio remoto' },
  agente_puerto:      { label: 'Puerto del agente',  desc: 'Puerto TCP donde escucha PulsovialAgent en cada vía' },
  consolidado_conn:  { label: 'Consolidado (OCR/Discrepancias) — Cadena de conexión', desc: 'Cadena de conexión SQL Server a la base externa "Consolidado" usada por OCR Placas y Discrepancias. Ej: Server=host,1433;Database=nombre;User Id=usuario;Password=clave;TrustServerCertificate=True', type: 'password' },
}

const TONOS: { tipo: 'desconexion' | 'reconexion'; label: string; desc: string }[] = [
  { tipo: 'desconexion', label: 'Tono de desconexión', desc: 'Suena cuando un equipo pasa a estado caído (DOWN). Máx. 15 MB — se reproducen solo los primeros 5 segundos del archivo.' },
  { tipo: 'reconexion',  label: 'Tono de reconexión',  desc: 'Suena cuando un equipo se recupera (UP). Máx. 15 MB — se reproducen solo los primeros 5 segundos del archivo.' },
]

export function AdminConfiguracion() {
  const [rows,    setRows]    = useState<Config[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [values,  setValues]  = useState<Record<string, string>>({})
  const [saved,   setSaved]   = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testingReporte, setTestingReporte] = useState(false)
  const [testReporteResult, setTestReporteResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [tonoFiles,   setTonoFiles]   = useState<Record<string, File | null>>({})
  const [tonoBusy,    setTonoBusy]    = useState<string | null>(null)
  const [tonoError,   setTonoError]   = useState<Record<string, string>>({})
  const { playDown: probarDefaultDown, playUp: probarDefaultUp } = useAlertSound()

  const reloadConfig = () => {
    fetch('/api/config', { credentials: 'include' })
      .then(r => r.json())
      .then((data: Config[]) => {
        setRows(data)
        setValues(Object.fromEntries(data.map(r => [r.clave, r.valor])))
      })
  }

  useEffect(() => {
    reloadConfig()
    setLoading(false)
  }, [])

  const subirTono = async (tipo: string) => {
    const archivo = tonoFiles[tipo]
    if (!archivo) return
    setTonoBusy(tipo)
    setTonoError(p => ({ ...p, [tipo]: '' }))
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      const r = await fetch(`/api/config/tono/${tipo}`, { method: 'POST', credentials: 'include', body: form })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Error al subir el archivo')
      setTonoFiles(p => ({ ...p, [tipo]: null }))
      reloadConfig()
    } catch (e) {
      setTonoError(p => ({ ...p, [tipo]: e instanceof Error ? e.message : 'Error al subir el archivo' }))
    } finally {
      setTonoBusy(null)
    }
  }

  const restaurarTono = async (tipo: string) => {
    setTonoBusy(tipo)
    try {
      await fetch(`/api/config/tono/${tipo}`, { method: 'DELETE', credentials: 'include' })
      reloadConfig()
    } finally {
      setTonoBusy(null)
    }
  }

  const probarTono = (tipo: 'desconexion' | 'reconexion') => {
    const archivo = values[`tono_${tipo}_archivo`]
    if (archivo) {
      // Mismo tope de 5s que se aplica en vivo (ver useAlertSound.ts) — la prueba
      // debe sonar igual que una alerta real, no el mp3 completo si dura más.
      const audio = new Audio(`/api/audio/${archivo}`)
      audio.play().catch(() => {})
      window.setTimeout(() => { audio.pause(); audio.currentTime = 0 }, 5000)
    } else {
      // Sin archivo personalizado: reproduce el tono sintetizado por defecto
      tipo === 'desconexion' ? probarDefaultDown() : probarDefaultUp()
    }
  }

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

  const testTelegram = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await fetch('/api/config/telegram/test', { method: 'POST', credentials: 'include' })
      const data = await r.json()
      setTestResult({ ok: r.ok, message: data.message ?? (r.ok ? 'Enviado.' : 'Error al enviar.') })
    } catch {
      setTestResult({ ok: false, message: 'No se pudo contactar al servidor.' })
    } finally {
      setTesting(false)
    }
  }

  const testReporteSemanal = async () => {
    setTestingReporte(true)
    setTestReporteResult(null)
    try {
      const r = await fetch('/api/reporte/semanal-critico/test', { method: 'POST', credentials: 'include' })
      const data = await r.json()
      setTestReporteResult({ ok: r.ok, message: data.message ?? (r.ok ? 'Enviado.' : 'Error al enviar.') })
    } catch {
      setTestReporteResult({ ok: false, message: 'No se pudo contactar al servidor.' })
    } finally {
      setTestingReporte(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-muted">Cargando…</div>

  return (
    <div>
      <h1 className="text-xl font-extrabold text-[#eae7e4] mb-2">Configuración</h1>
      <p className="text-sm text-muted mb-6">
        Los cambios de intervalo/pings se aplican en el próximo ciclo del worker.
        Los cambios de SMTP y Telegram se aplican inmediatamente a la siguiente alerta.
      </p>

      <div className="flex flex-col gap-3 max-w-xl">
        {rows.filter(r => !r.clave.startsWith('tono_')).map(r => {
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

        {rows.some(r => r.clave === 'telegram_bot_token') && (
          <div className="bg-surface rounded-xl p-4 border border-border">
            <div className="font-bold text-sm text-[#eae7e4] mb-0.5">Probar Telegram</div>
            <div className="text-xs text-muted mb-2">
              Guarda el token y el chat ID primero, luego envía un mensaje de prueba al grupo.
            </div>
            <button
              onClick={testTelegram}
              disabled={testing}
              className="px-3 py-2 rounded-lg text-sm font-bold transition-all
                bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
            >
              {testing ? 'Enviando…' : 'Enviar mensaje de prueba'}
            </button>
            {testResult && (
              <div className={`text-xs mt-2 ${testResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
              </div>
            )}
          </div>
        )}

        {rows.some(r => r.clave === 'email_reporte_semanal') && (
          <div className="bg-surface rounded-xl p-4 border border-border">
            <div className="font-bold text-sm text-[#eae7e4] mb-0.5">Probar reporte semanal</div>
            <div className="text-xs text-muted mb-2">
              Guarda los destinatarios primero, luego envía ahora mismo el reporte de disponibilidad
              de los últimos 7 días para los equipos marcados como críticos (se envía automático todos los lunes 8am).
            </div>
            <button
              onClick={testReporteSemanal}
              disabled={testingReporte}
              className="px-3 py-2 rounded-lg text-sm font-bold transition-all
                bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
            >
              {testingReporte ? 'Enviando…' : 'Enviar reporte ahora'}
            </button>
            {testReporteResult && (
              <div className={`text-xs mt-2 ${testReporteResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                {testReporteResult.ok ? '✓ ' : '✗ '}{testReporteResult.message}
              </div>
            )}
          </div>
        )}

        {TONOS.map(({ tipo, label, desc }) => {
          const archivo = values[`tono_${tipo}_archivo`]
          const busy    = tonoBusy === tipo
          return (
            <div key={tipo} className="bg-surface rounded-xl p-4 border border-border">
              <div className="font-bold text-sm text-[#eae7e4] mb-0.5">{label}</div>
              <div className="text-xs text-muted mb-2">{desc}</div>
              <div className="text-xs mb-2">
                {archivo
                  ? <span className="text-[#eae7e4]">Personalizado: <span className="text-muted">{archivo}</span></span>
                  : <span className="text-muted">Usando tono por defecto</span>}
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  type="file"
                  accept=".mp3,audio/mpeg"
                  onChange={e => setTonoFiles(p => ({ ...p, [tipo]: e.target.files?.[0] ?? null }))}
                  className="text-xs text-muted flex-1 min-w-[180px]"
                />
                <button
                  onClick={() => subirTono(tipo)}
                  disabled={busy || !tonoFiles[tipo]}
                  className="px-3 py-2 rounded-lg text-sm font-bold transition-all
                    bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
                >
                  {busy ? '…' : 'Subir'}
                </button>
                <button
                  onClick={() => probarTono(tipo)}
                  className="px-3 py-2 rounded-lg text-sm font-bold transition-all
                    bg-surface-3 text-[#eae7e4] hover:brightness-110 whitespace-nowrap"
                >
                  ▶ Probar
                </button>
                {archivo && (
                  <button
                    onClick={() => restaurarTono(tipo)}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg text-sm font-bold transition-all
                      bg-surface-3 text-muted hover:text-[#eae7e4] disabled:opacity-50 whitespace-nowrap"
                  >
                    Restaurar por defecto
                  </button>
                )}
              </div>
              {tonoError[tipo] && (
                <div className="text-xs mt-2 text-red-500">✗ {tonoError[tipo]}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
