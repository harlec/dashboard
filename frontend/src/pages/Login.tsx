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
    } catch {
      setError('Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0d0c] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">📡</div>
          <h1 className="text-xl font-extrabold text-[#eae7e4]">Dashboard de Monitoreo</h1>
          <p className="text-sm text-muted mt-1">AUNOR — Red de Peajes</p>
        </div>

        <form onSubmit={submit} className="bg-surface-2 rounded-2xl p-6 border border-border flex flex-col gap-4">
          <div>
            <label className="text-[0.78rem] text-muted font-bold uppercase block mb-1">Usuario</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2.5
                text-[#eae7e4] text-sm outline-none focus:border-brand transition-colors"
              required
            />
          </div>

          <div>
            <label className="text-[0.78rem] text-muted font-bold uppercase block mb-1">Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2.5
                text-[#eae7e4] text-sm outline-none focus:border-brand transition-colors"
              required
            />
          </div>

          {error && (
            <div className="text-danger text-sm bg-[#2D1212] rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:brightness-110 text-white font-bold py-2.5 rounded-lg
              transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
