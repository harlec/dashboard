import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface Props { signalStatus?: 'idle' | 'ok' | 'error' }

const LINKS = [
  { to: '/',              label: 'Panel de control' },
  { to: '/vias',          label: 'Vías' },
  { to: '/noc',            label: 'NOC' },
  { to: '/incidentes',    label: 'Incidentes' },
  { to: '/reporte',       label: 'Reporte SLA' },
  { to: '/reportes',      label: 'Reportes' },
  { to: '/discrepancias', label: 'Discrepancias' },
  { to: '/ocr',            label: 'OCR Placas' },
  // Oficios: oculto del menú mientras se termina de probar (ruta /oficios sigue activa)
  { to: '/admin',          label: 'Admin' },
]

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// Topbar compartido de toda la app — hamburger (drawer de navegación en
// pantallas angostas) + wordmark + nav inline (desde lg) + estado en vivo +
// usuario + reloj. Reemplaza al NavBar anterior en App.tsx.
export function MonitorTopbar({ signalStatus = 'ok' }: Props) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const now = useClock()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const dotColor = {
    idle:  'bg-[#8d94a3]',
    ok:    'bg-ok animate-ping-pulse',
    error: 'bg-danger',
  }[signalStatus]
  const dotLabel = { idle: 'En espera', ok: 'En vivo', error: 'Sin conexión' }[signalStatus]

  return (
    <nav className="flex items-center justify-between px-4 sm:px-6 h-[60px] sticky top-0 z-50 gap-4"
      style={{ background: 'linear-gradient(180deg, oklch(0.165 0.018 262) 0%, oklch(0.14 0.016 262) 100%)', boxShadow: 'inset 0 -1px 0 oklch(1 0 0 / 0.06)' }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex-shrink-0 md:hidden" ref={menuRef}>
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Menú de navegación"
            aria-expanded={open}
            className="w-10 h-10 rounded-[13px] flex flex-col items-center justify-center gap-[5px]
              bg-white/[0.06] hover:bg-white/[0.10] transition-colors"
          >
            {[0, 1, 2].map(i => (
              <span key={i} className="w-[17px] h-[2px] rounded-full" style={{ background: 'oklch(0.84 0.06 200)' }} />
            ))}
          </button>

          {open && (
            <div className="absolute left-0 top-[calc(100%+8px)] w-56 bg-surface-2 border border-border
              rounded-xl p-1.5 shadow-2xl z-50">
              {LINKS.map(({ to, label }) => (
                <Link key={to} to={to} onClick={() => setOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-[0.85rem] transition-colors ${
                    pathname === to
                      ? 'bg-white/10 text-ink font-semibold'
                      : 'text-white/60 hover:bg-white/10 hover:text-ink'}`}>
                  {label}
                </Link>
              ))}
              <div className="border-t border-border my-1.5" />
              <button onClick={logout}
                className="w-full text-left px-3 py-2 rounded-lg text-[0.85rem] text-white/50
                  hover:bg-white/10 hover:text-ink transition-colors">
                Salir
              </button>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-[1.4rem] font-bold tracking-[0.2em]" style={{ color: 'oklch(0.84 0.11 195)' }}>SIGMA</div>

        <div className="hidden md:flex gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]">
          {LINKS.map(({ to, label }) => (
            <Link key={to} to={to}
              className={`px-3 xl:px-3.5 py-1.5 rounded-[11px] text-[0.84rem] xl:text-[0.95rem] font-medium transition-all whitespace-nowrap ${
                pathname === to ? 'text-ink' : 'text-white/60 hover:bg-white/10 hover:text-ink'}`}
              style={pathname === to
                ? { background: 'oklch(0.34 0.045 210 / .75)', boxShadow: 'inset 0 0 0 1px oklch(0.70 0.09 200 / .35)' }
                : undefined}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-[0.75rem] text-white/70
          bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          <span className="hidden sm:inline">{dotLabel}</span>
        </div>

        <span className="hidden md:inline text-[0.78rem] text-white/50">
          {user?.nombre ?? user?.username}
        </span>

        <span className="hidden lg:inline text-[1.5rem] font-light tabular-nums text-white/90">
          {now.toLocaleTimeString('es-PE', { hour12: false })}
        </span>

        <button onClick={logout} className="text-[0.78rem] text-white/40 hover:text-ink transition-colors">
          Salir
        </button>
      </div>
    </nav>
  )
}
