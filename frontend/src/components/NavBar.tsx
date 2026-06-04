import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface Props { signalStatus: 'idle' | 'ok' | 'error' }

export function NavBar({ signalStatus }: Props) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()

  const dotColor = {
    idle:  'bg-[#a09890]',
    ok:    'bg-brand animate-ping-pulse',
    error: 'bg-danger',
  }[signalStatus]

  const dotLabel = { idle: 'En espera', ok: 'En vivo', error: 'Sin conexión' }[signalStatus]

  return (
    <nav className="bg-[#0a0908] flex items-center justify-between px-6 h-[50px] sticky top-0 z-50 border-b border-border">
      <div className="font-extrabold text-sm text-brand flex items-center gap-2 tracking-wide">
        📡 Dashboard de Monitoreo
      </div>

      <div className="flex gap-1">
        {[
          { to: '/',                label: 'Dashboard' },
          { to: '/incidentes',      label: 'Incidentes' },
          { to: '/reporte',         label: 'Reporte SLA' },
          { to: '/discrepancias',   label: 'Discrepancias' },
          { to: '/admin',           label: '⚙ Admin' },
        ].map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`px-3.5 py-1.5 rounded-md text-[0.84rem] transition-all
              ${pathname === to
                ? 'bg-white/10 text-[#eae7e4]'
                : 'text-white/60 hover:bg-white/10 hover:text-[#eae7e4]'}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-[0.75rem] text-white/70 bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          <span>{dotLabel}</span>
        </div>

        <span className="text-[0.78rem] text-white/50">
          👤 {user?.nombre ?? user?.username} ·{' '}
          <button onClick={logout} className="text-white/40 hover:text-[#eae7e4] transition-colors">
            Salir
          </button>
        </span>
      </div>
    </nav>
  )
}
