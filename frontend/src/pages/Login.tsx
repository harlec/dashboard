import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const navigate   = useNavigate()
  const { loginUser } = useAuth()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // loginUser actualiza auth.user ANTES de navegar — sin parpadeo
      await loginUser(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      // 423 = cuenta bloqueada, 429 = demasiados intentos: el backend manda el motivo
      let msg = 'Usuario o contraseña incorrectos'
      try {
        const body = JSON.parse((err as Error).message)
        if (body?.error && body.error !== 'Credenciales incorrectas') msg = body.error
      } catch { /* respuesta sin JSON: se queda el mensaje genérico */ }
      if ((err as Error).message?.includes('Too Many Requests')) msg = 'Demasiados intentos. Espere un minuto.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const teal = 'light-dark(oklch(0.488 0.121 195), oklch(0.84 0.11 195))'
  const esquina = (pos: React.CSSProperties) => (
    <div style={{ position: 'absolute', width: 22, height: 22, pointerEvents: 'none', filter: 'drop-shadow(0 0 6px light-dark(oklch(0.510 0.132 195 / 0.7), oklch(0.80 0.12 195 / 0.7)))', ...pos }} />
  )
  const brd = `2px solid ${teal}`

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{
      backgroundColor: '#07100f',
      backgroundImage: [
        'radial-gradient(900px 560px at 50% 38%, light-dark(oklch(0.930 0.042 192 / 0.4), oklch(0.30 0.06 192 / 0.40)), transparent 70%)',
        'linear-gradient(light-dark(oklch(0.510 0.110 192 / 0.05), oklch(0.80 0.10 192 / 0.05)) 1px, transparent 1px)',
        'linear-gradient(90deg, light-dark(oklch(0.510 0.110 192 / 0.05), oklch(0.80 0.10 192 / 0.05)) 1px, transparent 1px)',
      ].join(', '),
      backgroundSize: 'auto, 44px 44px, 44px 44px',
    }}>
      <style>{`
        .sigma-input { background: light-dark(oklch(0.966 0.017 192 / 0.7), oklch(0.20 0.025 192 / 0.7)); border: 1px solid light-dark(oklch(0.700 0.050 192 / 0.55), oklch(0.45 0.05 192 / 0.55)); transition: border-color .15s, box-shadow .15s; }
        .sigma-input:hover { border-color: light-dark(oklch(0.609 0.088 192 / 0.8), oklch(0.62 0.08 192 / 0.8)); }
        .sigma-input:focus { border-color: light-dark(oklch(0.488 0.121 195), oklch(0.84 0.11 195)); box-shadow: 0 0 0 3px light-dark(oklch(0.488 0.121 195 / 0.18), oklch(0.84 0.11 195 / 0.18)), 0 0 18px light-dark(oklch(0.488 0.121 195 / 0.25), oklch(0.84 0.11 195 / 0.25)); }
        .sigma-btn { background: linear-gradient(180deg, light-dark(oklch(0.510 0.121 195), oklch(0.80 0.11 195)), light-dark(oklch(0.587 0.121 195), oklch(0.66 0.11 195))); color: light-dark(oklch(0.981 0.021 195), oklch(0.16 0.03 195));
          box-shadow: 0 0 22px light-dark(oklch(0.510 0.121 195 / 0.35), oklch(0.80 0.11 195 / 0.35)), inset 0 1px 0 rgb(var(--ov) / 0.35); transition: filter .15s, transform .1s, box-shadow .15s; }
        .sigma-btn:hover:not(:disabled) { filter: brightness(1.1); box-shadow: 0 0 30px light-dark(oklch(0.510 0.121 195 / 0.55), oklch(0.80 0.11 195 / 0.55)), inset 0 1px 0 rgb(var(--ov) / 0.35); }
        .sigma-btn:active:not(:disabled) { transform: translateY(1px); }
      `}</style>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 text-5xl font-bold tracking-[0.25em]" style={{ color: teal, textShadow: '0 0 28px light-dark(oklch(0.488 0.121 195 / 0.45), oklch(0.84 0.11 195 / 0.45))' }}>SIGMA</div>
          <div className="mx-auto mb-3 h-px w-24" style={{ background: `linear-gradient(90deg, transparent, ${teal}, transparent)` }} />
          <p className="text-sm text-muted mt-1">Sistema Integral de Gestión y Monitoreo Avanzado</p>
        </div>

        <form onSubmit={submit} className="relative rounded-xl p-6 flex flex-col gap-4" style={{
          background: 'linear-gradient(170deg, light-dark(oklch(0.948 0.021 190 / 0.62), oklch(0.25 0.03 190 / 0.62)), light-dark(oklch(0.977 0.017 190 / 0.55), oklch(0.17 0.024 190 / 0.55)))',
          backdropFilter: 'blur(14px)',
          boxShadow: 'inset 0 0 0 1px light-dark(oklch(0.565 0.088 195 / 0.3), oklch(0.70 0.08 195 / 0.30)), inset 0 1px 0 rgb(var(--ov) / 0.08), 0 24px 60px light-dark(oklch(0.400 0.030 190 / 0.15), oklch(0.04 0.02 190 / 0.6))',
        }}>
          {esquina({ top: 0, left: 0, borderTop: brd, borderLeft: brd, borderTopLeftRadius: 12 })}
          {esquina({ bottom: 0, right: 0, borderBottom: brd, borderRight: brd, borderBottomRightRadius: 12 })}

          <div>
            <label className="text-[0.78rem] font-bold uppercase tracking-wider block mb-1" style={{ color: 'light-dark(oklch(0.543 0.066 192), oklch(0.74 0.06 192))' }}>Usuario</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="sigma-input w-full rounded-lg px-3 py-2.5 text-[color:var(--tx)] text-sm outline-none"
              required
            />
          </div>

          <div>
            <label className="text-[0.78rem] font-bold uppercase tracking-wider block mb-1" style={{ color: 'light-dark(oklch(0.543 0.066 192), oklch(0.74 0.06 192))' }}>Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="sigma-input w-full rounded-lg px-3 py-2.5 text-[color:var(--tx)] text-sm outline-none"
              required
            />
          </div>

          {error && (
            <div className="text-danger text-sm bg-[color:light-dark(oklch(0.958 0.031 21), #2D1212)] rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="sigma-btn w-full font-bold py-2.5 rounded-lg tracking-wider uppercase text-sm
              disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
