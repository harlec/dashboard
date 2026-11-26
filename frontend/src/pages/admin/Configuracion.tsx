import { CheckIcon, PlayIcon, XMarkIcon, PaintBrushIcon, SignalIcon, BellIcon, ChartBarSquareIcon, EnvelopeIcon, SpeakerWaveIcon, PuzzlePieceIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { useEffect, useState, type ReactNode } from 'react'
import { Field, Input } from '../../components/admin/FormModal'
import { useAlertSound } from '../../hooks/useAlertSound'

interface Config { clave: string; valor: string }

const LABELS: Record<string, { label: string; desc: string; type?: string }> = {
  alertas_activas:  { label: 'Alertas activas',   desc: '1 = activado, 0 = desactivado' },
  email_alertas:    { label: 'Email de alertas',   desc: 'Destinatarios de alertas DOWN/UP (varios correos separados por coma). Vacío = el correo SMTP de envío' },
  email_reporte_semanal: { label: 'Email reporte semanal', desc: 'Destinatarios del reporte de disponibilidad de equipos críticos (separados por coma) — se envía lunes 8am' },
  email_reporte_discrepancias: { label: 'Email reporte diario de discrepancias', desc: 'Destinatarios del reporte diario de discrepancias por vía (separados por coma), ordenado de mayor a menor % — se envía a la hora configurada abajo' },
  hora_reporte_discrepancias:  { label: 'Hora reporte diario de discrepancias', desc: 'Hora del día en formato HH:mm (ej. 08:00) en que se envía el reporte' },
  email_alerta_discrepancias:  { label: 'Email alerta de discrepancias', desc: 'Destinatarios de la alerta cuando una vía supera el umbral (separados por coma) — se revisa cada hora en punto' },
  umbral_alerta_discrepancias: { label: 'Umbral de alerta de discrepancias (%)', desc: 'Si alguna vía supera este % de discrepancia en la última hora, se envía una alerta' },
  reporte_diario_activo: { label: '2. Envío automático diario', desc: '1 = se envía automático a la hora configurada, 0 = apagado (el reporte de discrepancias anterior sigue funcionando aparte)' },
  email_reporte_diario:  { label: '1. ¿A quién se envía? (destinatarios)', desc: 'Destinatarios del reporte diario Sigma (separados por coma)' },
  hora_reporte_diario:   { label: '3. Hora de envío', desc: 'HH:mm hora de Lima. También es el corte de la ventana (08:00 → 08:00)' },
  reporte_diario_url:    { label: '4. Enlace del botón «Abrir en Sigma»', desc: 'Dirección completa de la vista web, ej. http://servidor:8090/reporte-diario. Vacío = el correo no muestra el botón' },
  reporte_evento_comun_equipos:     { label: 'Evento común: equipos mínimos', desc: 'Equipos de la misma plaza que deben caer juntos para agruparse (por defecto 3)' },
  reporte_evento_comun_ventana_min: { label: 'Evento común: ventana (min)', desc: 'Minutos dentro de los cuales deben caer (por defecto 10)' },
  reporte_latencia_umbral_ms:       { label: 'Umbral de latencia (ms)', desc: 'Umbral que se dibuja en "Latencia por sitio" (por defecto 24)' },
  reporte_via_min_transitos:        { label: 'Vías críticas: tránsitos mínimos', desc: 'Una vía con menos tránsitos no entra al top de críticas (por defecto 50)' },
  reporte_incluir_mantenimiento:    { label: 'Disponibilidad: contar mantenimiento', desc: '1 = las caídas en mantenimiento restan disponibilidad; 0 = no (por defecto)' },
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
  const [tab, setTab] = useState('apariencia')
  const [saving,  setSaving]  = useState<string | null>(null)
  const [values,  setValues]  = useState<Record<string, string>>({})
  const [saved,   setSaved]   = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testingReporte, setTestingReporte] = useState(false)
  const [testReporteResult, setTestReporteResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testingReporteDisc, setTestingReporteDisc] = useState(false)
  // Reporte diario Sigma (nuevo)
  const [rdDestino, setRdDestino] = useState('')
  const [rdBusy, setRdBusy] = useState<'prueba' | 'config' | null>(null)
  const [rdResult, setRdResult] = useState<{ ok: boolean; message: string } | null>(null)
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

  const card = 'bg-surface rounded-xl p-4 border border-border'
  const titulo = 'font-bold text-sm text-[color:var(--tx)] mb-0.5'

  const fila = (clave: string) => {
    if (!rows.some(r => r.clave === clave)) return null
    const meta = LABELS[clave] ?? { label: clave, desc: '' }
    return (
      <div key={clave} className={card}>
        <div className={titulo}>{meta.label}</div>
        <div className="text-xs text-muted mb-2">{meta.desc}</div>
        <div className="flex gap-2 items-center">
          <Input
            type={meta.type ?? 'text'}
            value={values[clave] ?? ''}
            onChange={e => setValues(p => ({ ...p, [clave]: e.target.value }))}
            className="flex-1"
          />
          <button onClick={() => save(clave)} disabled={saving === clave}
            className="px-3 py-2 rounded-lg text-sm font-bold transition-all bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap">
            {saved[clave] ? <><CheckIcon className="w-4 h-4 inline-block align-[-3px]" /> Guardado</> : saving === clave ? '…' : 'Guardar'}
          </button>
        </div>
      </div>
    )
  }

  const enviarReporteDiario = async (modo: 'prueba' | 'config') => {
    setRdBusy(modo); setRdResult(null)
    try {
      const r = await fetch(modo === 'prueba' ? '/api/reporte-diario/enviar-prueba' : '/api/reporte-diario/enviar', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: modo === 'prueba' ? JSON.stringify({ destinatarios: rdDestino }) : undefined,
      })
      const data = await r.json().catch(() => ({}))
      setRdResult({ ok: r.ok, message: data.message ?? (r.ok ? 'Enviado.' : 'Error al enviar.') })
    } catch { setRdResult({ ok: false, message: 'No se pudo contactar al servidor.' }) }
    finally { setRdBusy(null) }
  }

  const prueba = (cond: string, title: string, desc: string, btn: string, busyTxt: string,
                  busy: boolean, onClick: () => void, res: { ok: boolean; message: string } | null) =>
    rows.some(r => r.clave === cond) && (
      <div className={card}>
        <div className={titulo}>{title}</div>
        <div className="text-xs text-muted mb-2">{desc}</div>
        <button onClick={onClick} disabled={busy}
          className="px-3 py-2 rounded-lg text-sm font-bold transition-all bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap">
          {busy ? busyTxt : btn}
        </button>
        {res && (
          <div className={`text-xs mt-2 ${res.ok ? 'text-green-500' : 'text-red-500'}`}>
            {res.ok ? <CheckIcon className="w-4 h-4 inline-block align-[-3px]" /> : <XMarkIcon className="w-4 h-4 inline-block align-[-3px]" />} {res.message}
          </div>
        )}
      </div>
    )

  const tabs: { id: string; label: string; Icon: typeof BellIcon; claves: string[]; contenido?: () => ReactNode }[] = [
    { id: 'apariencia', label: 'Apariencia', Icon: PaintBrushIcon, claves: [], contenido: () => (<>
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={titulo}>Estilo HUD del Panel de control</div>
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

      <div className={card}>
        <div className={titulo}>Tamaño de letra del sistema</div>
        <div className="text-xs text-muted mb-3">
          Escala todo el texto de la aplicación — útil para pantallas grandes del NOC. Afecta a todos los usuarios.
        </div>
        <div className="flex gap-2">
          {ESCALAS.map(pct => (
            <button key={pct} onClick={() => setEscala(pct)}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${escalaActual === pct ? 'bg-brand text-white' : 'bg-surface-3 text-[color:var(--tx)] hover:brightness-110'}`}>
              {pct}%
            </button>
          ))}
        </div>
        {saved['escala_fuente'] && <div className="text-xs mt-2 text-green-500"><CheckIcon className="w-4 h-4 inline-block align-[-3px]" /> Guardado</div>}
      </div>

      <div className={card}>
        <div className={titulo}>Tipo de letra del sistema</div>
        <div className="text-xs text-muted mb-3">Tipografía de toda la aplicación. Afecta a todos los usuarios.</div>
        <div className="flex gap-2 flex-wrap">
          {FUENTES_OPS.map(f => (
            <button key={f.value} onClick={() => setFuente(f.value)} style={{ fontFamily: f.family }}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${fuenteActual === f.value ? 'bg-brand text-white' : 'bg-surface-3 text-[color:var(--tx)] hover:brightness-110'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {saved['fuente_sistema'] && <div className="text-xs mt-2 text-green-500"><CheckIcon className="w-4 h-4 inline-block align-[-3px]" /> Guardado</div>}
      </div>

      <div className={card}>
        <div className={titulo}>Imagen de fondo del Panel de control</div>
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
              <span className="font-bold text-[color:var(--tx)]">{oscuridad}%</span>
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
            className="text-xs text-muted file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-surface-3 file:text-[color:var(--tx)] file:font-bold" />
          <button onClick={subirFondo} disabled={!fondoFile || fondoBusy}
            className="px-3 py-2 rounded-lg text-sm font-bold bg-brand text-white disabled:opacity-40">
            {fondoBusy ? 'Subiendo…' : 'Subir imagen'}
          </button>
          {fondoActual && (
            <button onClick={quitarFondo} disabled={fondoBusy}
              className="px-3 py-2 rounded-lg text-sm font-bold bg-surface-3 text-[color:var(--tx)] disabled:opacity-40">
              Quitar imagen
            </button>
          )}
        </div>
        {fondoError && <div className="text-xs mt-2 text-red-400">{fondoError}</div>}
      </div>
    </>) },
    { id: 'monitoreo', label: 'Monitoreo', Icon: SignalIcon,
      claves: ['intervalo_min', 'pings_por_ciclo', 'timeout_ping_s', 'agente_puerto', 'agente_servicios_permitidos'] },
    { id: 'notificaciones', label: 'Notificaciones', Icon: BellIcon,
      claves: ['alertas_activas', 'email_alertas', 'smtp_host', 'smtp_puerto', 'smtp_usuario', 'smtp_password', 'telegram_bot_token', 'telegram_chat_id'],
      contenido: () => prueba('telegram_bot_token', 'Probar Telegram',
        'Guarda el token y el chat ID primero, luego envía un mensaje de prueba al grupo.',
        'Enviar mensaje de prueba', 'Enviando…', testing, testTelegram, testResult) },
    { id: 'reporte-sigma', label: 'Reporte Sigma', Icon: ChartBarSquareIcon,
      claves: ['email_reporte_diario', 'reporte_diario_activo', 'hora_reporte_diario', 'reporte_diario_url',
        'reporte_evento_comun_equipos', 'reporte_evento_comun_ventana_min', 'reporte_latencia_umbral_ms',
        'reporte_via_min_transitos', 'reporte_incluir_mantenimiento'],
      contenido: () => (<>
        {rows.some(r => r.clave === 'email_reporte_diario') && (
          <div className={card}>
            <div className={titulo}>Reporte diario Sigma (nuevo) — probar antes de activar</div>
            <div className="text-xs text-muted mb-2">
              Es el reporte nuevo, distinto del “reporte diario de discrepancias” (pestaña Reportes). La vista previa usa las últimas 24 h reales (08:00 → 08:00); la primera vez tarda porque calcula los snapshots de 30 días.
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <a href="/api/reporte-diario/preview" target="_blank" rel="noreferrer"
                className="px-3 py-2 rounded-lg text-sm font-bold bg-surface-3 hover:brightness-110 whitespace-nowrap">Ver vista previa</a>
              <a href="/reporte-diario" target="_blank" rel="noreferrer"
                className="px-3 py-2 rounded-lg text-sm font-bold bg-surface-3 hover:brightness-110 whitespace-nowrap">Ver vista web</a>
            </div>
            <div className="flex flex-wrap gap-2 items-center mt-3">
              <input value={rdDestino} onChange={e => setRdDestino(e.target.value)} placeholder="correo para la prueba (varios con coma)"
                className="flex-1 min-w-[240px] px-3 py-2 rounded-lg text-sm bg-surface-2 border border-border" />
              <button onClick={() => enviarReporteDiario('prueba')} disabled={rdBusy !== null || !rdDestino.trim()}
                className="px-3 py-2 rounded-lg text-sm font-bold bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap">
                {rdBusy === 'prueba' ? 'Enviando…' : 'Enviar prueba solo a este correo'}
              </button>
              <button onClick={() => enviarReporteDiario('config')} disabled={rdBusy !== null}
                className="px-3 py-2 rounded-lg text-sm font-bold bg-surface-3 hover:brightness-110 disabled:opacity-50 whitespace-nowrap">
                {rdBusy === 'config' ? 'Enviando…' : 'Enviar ahora a los destinatarios configurados'}
              </button>
            </div>
            {rdResult && <div className={`text-xs mt-2 ${rdResult.ok ? 'text-green-500' : 'text-red-500'}`}>{rdResult.ok ? <CheckIcon className="w-4 h-4 inline-block align-[-3px]" /> : <XMarkIcon className="w-4 h-4 inline-block align-[-3px]" />} {rdResult.message}</div>}
          </div>
        )}
      </>) },
    { id: 'reportes', label: 'Reportes', Icon: EnvelopeIcon,
      claves: ['email_reporte_semanal', 'email_reporte_discrepancias', 'hora_reporte_discrepancias', 'email_alerta_discrepancias', 'umbral_alerta_discrepancias'],
      contenido: () => (<>
        {prueba('email_reporte_semanal', 'Probar reporte semanal',
          'Guarda los destinatarios primero, luego envía ahora mismo el reporte de disponibilidad de los últimos 7 días para los equipos marcados como críticos (se envía automático todos los lunes 8am).',
          'Enviar reporte ahora', 'Enviando…', testingReporte, testReporteSemanal, testReporteResult)}
        {prueba('email_reporte_discrepancias', 'Probar reporte diario de discrepancias',
          'Guarda los destinatarios primero, luego envía ahora mismo el reporte de discrepancias de las últimas 24 horas, ordenado por % de mayor a menor (se envía automático a la hora configurada).',
          'Enviar reporte ahora', 'Enviando…', testingReporteDisc, testReporteDiscrepancias, testReporteDiscResult)}
        {prueba('email_alerta_discrepancias', 'Probar alerta de umbral de discrepancias',
          'Guarda destinatarios y umbral primero, luego revisa ahora mismo si alguna vía superó el umbral en la última hora y envía el correo si corresponde (se revisa automático cada hora en punto).',
          'Revisar y enviar ahora', 'Revisando…', testingAlertaDisc, testAlertaDiscrepancias, testAlertaDiscResult)}
      </>) },
    { id: 'sonidos', label: 'Sonidos', Icon: SpeakerWaveIcon, claves: [], contenido: () => (<>
      {TONOS.map(({ tipo, label, desc }) => {
        const archivo = values[`tono_${tipo}_archivo`]
        const busy    = tonoBusy === tipo
        return (
          <div key={tipo} className={card}>
            <div className={titulo}>{label}</div>
            <div className="text-xs text-muted mb-2">{desc}</div>
            <div className="text-xs mb-2">
              {archivo
                ? <span className="text-[color:var(--tx)]">Personalizado: <span className="text-muted">{archivo}</span></span>
                : <span className="text-muted">Usando tono por defecto</span>}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input type="file" accept=".mp3,audio/mpeg"
                onChange={e => setTonoFiles(p => ({ ...p, [tipo]: e.target.files?.[0] ?? null }))}
                className="text-xs text-muted flex-1 min-w-[180px]" />
              <button onClick={() => subirTono(tipo)} disabled={busy || !tonoFiles[tipo]}
                className="px-3 py-2 rounded-lg text-sm font-bold transition-all bg-brand text-white hover:brightness-110 disabled:opacity-50 whitespace-nowrap">
                {busy ? '…' : 'Subir'}
              </button>
              <button onClick={() => probarTono(tipo)}
                className="px-3 py-2 rounded-lg text-sm font-bold transition-all bg-surface-3 text-[color:var(--tx)] hover:brightness-110 whitespace-nowrap">
                <PlayIcon className="w-4 h-4 inline-block align-[-3px]" /> Probar
              </button>
              {archivo && (
                <button onClick={() => restaurarTono(tipo)} disabled={busy}
                  className="px-3 py-2 rounded-lg text-sm font-bold transition-all bg-surface-3 text-muted hover:text-[color:var(--tx)] disabled:opacity-50 whitespace-nowrap">
                  Restaurar por defecto
                </button>
              )}
            </div>
            {tonoError[tipo] && <div className="text-xs mt-2 text-red-500"><XMarkIcon className="w-4 h-4 inline-block align-[-3px]" /> {tonoError[tipo]}</div>}
          </div>
        )
      })}
    </>) },
    { id: 'integraciones', label: 'Integraciones', Icon: PuzzlePieceIcon, claves: ['consolidado_conn'] },
  ]

  // Claves sin pestaña propia (y que no son de apariencia/tonos) caen en "Otros".
  const conocidas = new Set([...tabs.flatMap(t => t.claves),
    'escala_fuente', 'fondo_imagen', 'dashboard_estilo', 'fondo_oscuridad', 'fuente_sistema'])
  const otras = rows.map(r => r.clave).filter(c => !conocidas.has(c) && !c.startsWith('tono_'))
  if (otras.length) tabs.push({ id: 'otros', label: 'Otros', Icon: EllipsisHorizontalIcon, claves: otras })

  const actual = tabs.find(t => t.id === tab) ?? tabs[0]

  return (
    <div>
      <h1 className="text-xl font-extrabold text-[color:var(--tx)] mb-2">Configuración</h1>
      <p className="text-sm text-muted mb-4">
        Los cambios de intervalo/pings se aplican en el próximo ciclo del worker.
        Los cambios de SMTP y Telegram se aplican inmediatamente a la siguiente alerta.
      </p>

      <div className="flex gap-1 border-b border-border mb-5 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-bold -mb-px border-b-2 transition-colors ${
              actual.id === t.id
                ? 'border-brand text-brand'
                : 'border-transparent text-muted hover:text-[color:var(--tx)]'
            }`}>
            <t.Icon className="w-4 h-4 inline-block align-[-3px] mr-1.5" />{t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))' }}>
        {actual.claves.map(fila)}
        {actual.contenido?.()}
      </div>
    </div>
  )
}
