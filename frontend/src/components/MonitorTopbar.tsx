import { Bars3Icon } from '@heroicons/react/24/outline'
import { WallTopbar } from './WallTopbar'
import { linksPara } from './navLinks'
import { ThemeToggle } from './ThemeToggle'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface Props { activo: string; signalStatus?: 'idle' | 'ok' | 'error' }

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// Barra para las pantallas fluidas (Bitácora, reporte diario), que no usan el lienzo
// de 1920. En escritorio dibuja la misma WallTopbar a escala, para que el menú se vea
// igual que en el resto de Sigma; en pantallas angostas, una versión compacta.
function useAncho() {
  const [ancho, setAncho] = useState(() => document.documentElement.clientWidth)
  useEffect(() => {
    const medir = () => setAncho(document.documentElement.clientWidth)
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  return ancho
}

export function MonitorTopbar({ activo, signalStatus = 'ok' }: Props) {
  const ancho = useAncho()
  const { user, logout } = useAuth()
  const linksVisibles = linksPara(user?.rol)
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

  if (ancho >= 1024) return (
    <div style={{ zoom: ancho / 1920, width: 1920, boxSizing: 'border-box', padding: '22px 30px 8px', position: 'relative', zIndex: 50, fontFamily: 'var(--app-font)', color: 'var(--tx)' }}>
      <style>{`@keyframes breathe { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
      <WallTopbar activo={activo} signalStatus={signalStatus} />
    </div>
  )

  const dotColor = {
    idle:  'bg-[color:var(--tx-muted)]',
    ok:    'bg-ok animate-ping-pulse',
    error: 'bg-danger',
  }[signalStatus]
  const dotLabel = { idle: 'En espera', ok: 'En vivo', error: 'Sin conexión' }[signalStatus]

  return (
    <nav className="flex items-center justify-between px-4 sm:px-6 h-[60px] sticky top-0 z-50 gap-4"
      style={{ background: 'linear-gradient(180deg, var(--pg-top) 0%, var(--pg-bot) 100%)', boxShadow: 'inset 0 -1px 0 rgb(var(--ov) / 0.06)' }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex-shrink-0 md:hidden" ref={menuRef}>
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Menú de navegación"
            aria-expanded={open}
            className="w-10 h-10 rounded-[13px] flex items-center justify-center
              bg-ink/[0.06] hover:bg-ink/[0.10] transition-colors"
          >
            <Bars3Icon className="w-[22px] h-[22px]" style={{ color: 'light-dark(oklch(0.488 0.066 200), oklch(0.84 0.06 200))' }} />
          </button>

          {open && (
            <div className="absolute left-0 top-[calc(100%+8px)] w-56 bg-surface-2 border border-border
              rounded-xl p-1.5 shadow-2xl z-50">
              {linksVisibles.map(({ to, label, Icon }) => (
                <Link key={to} to={to} onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[0.85rem] transition-colors ${
                    pathname === to
                      ? 'bg-ink/10 text-ink font-semibold'
                      : 'text-ink/60 hover:bg-ink/10 hover:text-ink'}`}>
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {label}
                </Link>
              ))}
              <div className="border-t border-border my-1.5" />
              <button onClick={logout}
                className="w-full text-left px-3 py-2 rounded-lg text-[0.85rem] text-ink/50
                  hover:bg-ink/10 hover:text-ink transition-colors">
                Salir
              </button>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-[1.4rem] font-bold tracking-[0.2em]" style={{ color: 'light-dark(oklch(0.488 0.121 195), oklch(0.84 0.11 195))' }}>SIGMA</div>

        <div className="hidden md:flex gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]">
          {linksVisibles.map(({ to, label }) => (
            <Link key={to} to={to}
              className={`px-3 xl:px-3.5 py-1.5 rounded-[11px] text-[0.84rem] xl:text-[0.95rem] font-medium transition-all whitespace-nowrap ${
                pathname === to ? 'text-ink' : 'text-ink/60 hover:bg-ink/10 hover:text-ink'}`}
              style={pathname === to
                ? { background: 'light-dark(oklch(0.916 0.032 210 / 0.75), oklch(0.34 0.045 210 / .75))', boxShadow: 'inset 0 0 0 1px light-dark(oklch(0.565 0.099 200 / 0.35), oklch(0.70 0.09 200 / .35))' }
                : undefined}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-[0.75rem] text-ink/70
          bg-ink/[0.06] px-2.5 py-1 rounded-full border border-ink/10">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          <span className="hidden sm:inline">{dotLabel}</span>
        </div>

        <span className="hidden md:inline text-[0.78rem] text-ink/50">
          {user?.nombre ?? user?.username}
        </span>

        <span className="hidden lg:inline text-[1.5rem] font-light tabular-nums text-ink/90">
          {now.toLocaleTimeString('es-PE', { hour12: false })}
        </span>

        <ThemeToggle />

        <button onClick={logout} className="text-[0.78rem] text-ink/40 hover:text-ink transition-colors">
          Salir
        </button>
      </div>
    </nav>
  )
}
