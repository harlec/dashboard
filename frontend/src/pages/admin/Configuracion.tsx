import { useEffect, useState } from 'react'
import { Field, Input } from '../../components/admin/FormModal'
import { useAlertSound } from '../../hooks/useAlertSound'

interface Config { clave: string; valor: string }

const LABELS: Record<string, { label: string; desc: string; type?: string }> = {
  alertas_activas:  { label: 'Alertas activas',   desc: '1 = activado, 0 = desactivado' },
  email_alertas:    { label: 'Email de alertas',   desc: 'Destinatario de alertas DOWN/UP' },
  email_reporte_semanal: { label: 'Email reporte semanal', desc: 'Destinatarios del reporte de disponibilidad de equipos críticos (separados por coma) — se envía lunes 8am' },
  email_reporte_discrepancias: { label: 'Email reporte diario de discrepancias', desc: 'Destinatarios del reporte diario de discrepancias por vía (separados por coma), ordenado de mayor a menor % — se envía a la hora configurada abajo' },
  hora_reporte_discrepancias:  { label: 'Hora reporte diario de discrepancias', desc: 'Hora del día en formato HH:mm (ej. 08:00) en que se envía el reporte' },
  email_alerta_discrepancias:  { label: 'Email alerta de discrepancias', desc: 'Destinatarios de la alerta cuando una vía supera el umbral (separados por coma) — se revisa cada hora en punto' },
  umbral_alerta_discrepancias: { label: 'Umbral de alerta de discrepancias (%)', desc: 'Si alguna vía supera este % de discrepancia en la última hora, se envía una alerta' },
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

const ESCALAS = [100, 125, 150, 200]

const FUENTES_OPS: { value: string; label: string; family: string }[] = [
  { value: 'manrope', label: 'Manrope (predeterminada)', family: "'Manrope', 'Segoe UI', Arial, sans-serif" },
  { value: 'segoe',   label: 'Segoe UI (clásica)', family: "'Segoe UI', Arial, sans-serif" },
]

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
  const [testingReporteDisc, setTestingReporteDisc] = useState(false)
  const [testReporteDiscResult, setTestReporteDiscResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testingAlertaDisc, setTestingAlertaDisc] = useState(false)
  const [testAlertaDiscResult, setTestAlertaDiscResult] = useState<{ ok: boolean; message: string } | null>(null)
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

  const [fondoFile, setFondoFile] = useState<File | null>(null)
  const [fondoBusy, setFondoBusy] = useState(false)
  const [fondoError, setFondoError] = useState('')
  const hudActivo = values['dashboard_estilo'] === 'hud'
  const toggleHud = async () => {
    const nuevo = hudActivo ? '' : 'hud'
    setValues(p => ({ ...p, dashboard_estilo: nuevo }))
    await fetch('/api/config/dashboard_estilo', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: nuevo }),
    })
  }
  const oscuridad = Math.max(0, Math.min(90, parseInt(values['fondo_oscuridad'] ?? '62', 10) || 0))
  const guardarOscuridad = (v: number) =>
    fetch('/api/config/fondo_oscuridad', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: String(v) }),
    })
  const fondoActual = values['fondo_imagen'] ?? ''

  const subirFondo = async () => {
    if (!fondoFile) return
    setFondoBusy(true); setFondoError('')
    try {
      const form = new FormData()
      form.append('archivo', fondoFile)
      const r = await fetch('/api/config/fondo', { method: 'POST', credentials: 'include', body: form })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error ?? 'Error al subir la imagen')
      setFondoFile(null)
      reloadConfig()
    } catch (e) {
      setFondoError(e instanceof Error ? e.message : 'Error al subir la imagen')
    } finally { setFondoBusy(false) }
  }

  const quitarFondo = async () => {
    setFondoBusy(true)
    try { await fetch('/api/config/fondo', { method: 'DELETE', credentials: 'include' }); reloadConfig() }
    finally { setFondoBusy(false) }
  }

  const escalaActual = parseInt(values['escala_fuente'] ?? '100', 10) || 100

  const setEscala = async (pct: number) => {
    document.documentElement.style.fontSize = `${pct / 100 * 16}px`
    setValues(p => ({ ...p, escala_fuente: String(pct) }))
    setSaving('escala_fuente')
    await fetch('/api/config/escala_fuente', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: String(pct) })
    })
    setSaving(null)
    setSaved(p => ({ ...p, escala_fuente: true }))
    setTimeout(() => setSaved(p => ({ ...p, escala_fuente: false })), 2000)
  }

  const fuenteActual = values['fuente_sistema'] ?? 'manrope'

  const setFuente = async (valor: string) => {
    const familia = FUENTES_OPS.find(f => f.value === valor)?.family ?? FUENTES_OPS[0].family
    document.documentElement.style.setProperty('--app-font', familia)
    setValues(p => ({ ...p, fuente_sistema: valor }))
    setSaving('fuente_sistema')
    await fetch('/api/config/fuente_sistema', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor })
    })
    setSaving(null)
    setSaved(p => ({ ...p, fuente_sistema: true }))
    setTimeout(() => setSaved(p => ({ ...p, fuente_sistema: false })), 2000)
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

  const testReporteDiscrepancias = async () => {
    setTestingReporteDisc(true)
    setTestReporteDiscResult(null)
    try {
      const r = await fetch('/api/discrepancias/reporte-diario/test', { method: 'POST', credentials: 'include' })
      const data = await r.json()
      setTestReporteDiscResult({ ok: r.ok, message: data.message ?? (r.ok ? 'Enviado.' : 'Error al enviar.') })
    } catch {
      setTestReporteDiscResult({ ok: false, message: 'No se pudo contactar al servidor.' })
    } finally {
      setTestingReporteDisc(false)
    }
  }

  const testAlertaDiscrepancias = async () => {
    setTestingAlertaDisc(true)
    setTestAlertaDiscResult(null)
    try {
      const r = await fetch('/api/discrepancias/alerta-umbral/test', { method: 'POST', credentials: 'include' })
      const data = await r.json()
      setTestAlertaDiscResult({ ok: r.ok, message: data.message ?? (r.ok ? 'Enviado.' : 'Error al enviar.') })
    } catch {
      setTestAlertaDiscResult({ ok: false, message: 'No se pudo contactar al servidor.' })
    } finally {
      setTestingAlertaDisc(false)
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
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-[#eae7e4] mb-0.5">Estilo HUD del Panel de control</div>
              <div className="text-xs text-muted">
                Variante de un solo color (verde azulado SIGMA) con cuadrícula y marcos tipo HUD; el rojo queda solo para fallas. Afecta a todos los usuarios.
              </div>
            </div>
            <button onClick={toggleHud} role="switch" aria-checked={hudActivo}
              className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors ${hudActivo ? 'bg-brand' : 'bg-surface-3'}`}>
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${hudActivo ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="font-bold text-sm text-[#eae7e4] mb-0.5">Imagen de fondo del Panel de control</div>
          <div className="text-xs text-muted mb-3">
            Foto detrás del Panel de control (SIGMA): las tarjetas pasan a verse como vidrio sobre la imagen.
            .jpg / .png / .webp, máx. 10 MB — mejor una foto oscura y de 1920 px o más. Sin imagen se usa el fondo normal.
          </div>
          {fondoActual && (
            <img src={`/api/audio/${fondoActual}`} alt="Fondo actual"
              className="w-full max-h-40 object-cover rounded-lg border border-border mb-3" />
          )}
          {fondoActual && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>Oscuridad del fondo (velo sobre la imagen)</span>
                <span className="font-bold text-[#eae7e4]">{oscuridad}%</span>
              </div>
              <input type="range" min={0} max={90} step={2} value={oscuridad}
                onChange={e => setValues(p => ({ ...p, fondo_oscuridad: e.target.value }))}
                onPointerUp={() => guardarOscuridad(oscuridad)} onKeyUp={() => guardarOscuridad(oscuridad)}
                className="w-full accent-[#72BF44]" />
              <div className="flex justify-between text-[0.65rem] text-dim"><span>más claro</span><span>más oscuro</span></div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={e => setFondoFile(e.target.files?.[0] ?? null)}
              className="text-xs text-muted file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-surface-3 file:text-[#eae7e4] file:font-bold" />
            <button onClick={subirFondo} disabled={!fondoFile || fondoBusy}
              className="px-3 py-2 rounded-lg text-sm font-bold bg-brand text-white disabled:opacity-40">
              {fondoBusy ? 'Subiendo…' : 'Subir imagen'}
            </button>
            {fondoActual && (
              <button onClick={quitarFondo} disabled={fondoBusy}
                className="px-3 py-2 rounded-lg text-sm font-bold bg-surface-3 text-[#eae7e4] disabled:opacity-40">
                Quitar imagen
              </button>
            )}
          </div>
          {fondoError && <div className="text-xs mt-2 text-red-400">{fondoError}</div>}
        </div>

        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="font-bold text-sm text-[#eae7e4] mb-0.5">Tamaño de letra del sistema</div>
          <div className="text-xs text-muted mb-3">
            Escala todo el texto de la aplicación — útil para pantallas grandes del NOC. Afecta a todos los usuarios.
          </div>
          <div className="flex gap-2">
            {ESCALAS.map(pct => (
              <button key={pct} onClick={() => setEscala(pct)}
                className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                  escalaActual === pct
                    ? 'bg-brand text-white'
                    : 'bg-surface-3 text-[#eae7e4] hover:brightness-110'
                }`}>
                {pct}%
              </button>
            ))}
          </div>
          {saved['escala_fuente'] && <div className="text-xs mt-2 text-green-500">✓ Guardado</div>}
        </div>

        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="font-bold text-sm text-[#eae7e4] mb-0.5">Tipo de letra del sistema</div>
          <div className="text-xs text-muted mb-3">
            Tipografía de toda la aplicación. Afecta a todos los usuarios.
          </div>
          <div className="flex gap-2">
            {FUENTES_OPS.map(f => (
              <button key={f.value} onClick={() => setFuente(f.value)}
                style={{ fontFamily: f.family }}
                className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                  fuenteActual === f.value
                    ? 'bg-brand text-white'
                    : 'bg-surface-3 text-[#eae7e4] hover:brightness-110'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          {saved['fuente_sistema'] && <div className="text-xs mt-2 text-green-500">✓ Guardado</div>}
        </div>

        {rows.filter(r => !r.clave.startsWith('tono_') && r.clave !== 'escala_fuente' && r.clave !== 'fondo_imagen' && r.clave !== 'dashboard_estilo' && r.clave !== 'fondo_oscuridad' && r.clave !== 'fuente_sistema').map(r => {
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

        {rows.some(r => r.clave === 'email_reporte_discrepancias') && (
          <div className="bg-surface rounded-xl p-4 border border-border">
            <div className="font-bold text-sm text-[#eae7e4] mb-0.5">Probar reporte diario de discrepancias</div>
            <div className="text-xs text-muted mb-2">
              Guarda los destinatarios primero, luego envía ahora mismo el reporte de discrepancias
              de las últimas 24 horas, ordenado por % de mayor a menor (se envía automático a la hora configurada arriba).
            </div>
            <button
              onClick={testReporteDiscrepancias}
              disabled={testingReporteDisc}
              className="px-3 py-2 rounded-lg text-sm font-bold transition-all
                bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
            >
              {testingReporteDisc ? 'Enviando…' : 'Enviar reporte ahora'}
            </button>
            {testReporteDiscResult && (
              <div className={`text-xs mt-2 ${testReporteDiscResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                {testReporteDiscResult.ok ? '✓ ' : '✗ '}{testReporteDiscResult.message}
              </div>
            )}
          </div>
        )}

        {rows.some(r => r.clave === 'email_alerta_discrepancias') && (
          <div className="bg-surface rounded-xl p-4 border border-border">
            <div className="font-bold text-sm text-[#eae7e4] mb-0.5">Probar alerta de umbral de discrepancias</div>
            <div className="text-xs text-muted mb-2">
              Guarda destinatarios y umbral primero, luego revisa ahora mismo si alguna vía superó el umbral
              en la última hora y envía el correo si corresponde (se revisa automático cada hora en punto).
            </div>
            <button
              onClick={testAlertaDiscrepancias}
              disabled={testingAlertaDisc}
              className="px-3 py-2 rounded-lg text-sm font-bold transition-all
                bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
            >
              {testingAlertaDisc ? 'Revisando…' : 'Revisar y enviar ahora'}
            </button>
            {testAlertaDiscResult && (
              <div className={`text-xs mt-2 ${testAlertaDiscResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                {testAlertaDiscResult.ok ? '✓ ' : '✗ '}{testAlertaDiscResult.message}
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
