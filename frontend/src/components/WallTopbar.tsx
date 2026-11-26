import { ArrowRightStartOnRectangleIcon, Bars3Icon } from '@heroicons/react/24/outline'
import { linksPara } from './navLinks'
import { ThemeToggle } from './ThemeToggle'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Topbar de 52px dentro del lienzo de 1920 — hamburger + wordmark + nav inline
// + EN VIVO + usuario + reloj. Mismo componente en todas las pantallas
// (sistema-visual.md). Vive DENTRO de ScaledStage, no es una barra aparte —
// por eso no lleva su propio fondo ni position:sticky.

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

interface Props { activo: string; signalStatus?: 'idle' | 'ok' | 'error' }

export function WallTopbar({ activo, signalStatus = 'ok' }: Props) {
  const { user, logout } = useAuth()
  const linksVisibles = linksPara(user?.rol)
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

  const dotColor = { idle: 'var(--tx-dim)', ok: 'light-dark(oklch(0.499 0.143 168), oklch(0.82 0.13 168))', error: 'light-dark(oklch(0.565 0.170 22), oklch(0.70 0.17 22))' }[signalStatus]
  const dotLabel = { idle: 'En espera', ok: 'EN VIVO', error: 'Sin conexión' }[signalStatus]

  return (
    <div style={{ height: 52, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <div onClick={() => setOpen(o => !o)} role="button" aria-label="Menú de navegación" style={{
            width: 40, height: 40, borderRadius: 13, display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer',
            background: open ? 'rgb(var(--s3) / 0.75)' : 'rgb(var(--s2) / 0.60)',
            boxShadow: 'inset 0 0 0 1px rgb(var(--ov) / 0.07)',
          }}>
            <Bars3Icon style={{ width: 22, height: 22, color: 'light-dark(oklch(0.488 0.066 200), oklch(0.84 0.06 200))' }} />
          </div>
          {open && (
            <div style={{
              position: 'absolute', left: 0, top: 48, zIndex: 50, minWidth: 230, borderRadius: 12, padding: 6,
              background: 'rgb(var(--s0) / 0.98)', boxShadow: 'inset 0 1px 0 rgb(var(--ov) / 0.07), 0 14px 40px rgb(var(--shadow) / 0.45)',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {linksVisibles.map(l => (
                <Link key={l.to} to={l.to} onClick={() => setOpen(false)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 15, fontWeight: 500,
                  color: l.label === activo ? 'var(--tx)' : 'light-dark(oklch(0.370 0.012 265), oklch(0.78 0.006 265))',
                  background: l.label === activo ? 'rgb(var(--ov) / 0.08)' : 'transparent',
                }}><l.Icon style={{ width: 18, height: 18, flex: '0 0 auto' }} />{l.label}</Link>
              ))}
              <div style={{ borderTop: '1px solid rgb(var(--ov) / 0.08)', margin: '4px 0' }} />
              <div onClick={logout} role="button" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, fontSize: 15, fontWeight: 500, color: 'var(--tx-muted)', cursor: 'pointer' }}>
                <ArrowRightStartOnRectangleIcon style={{ width: 18, height: 18 }} />Salir
              </div>
            </div>
          )}
        </div>

        <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '0.2em', color: 'light-dark(oklch(0.488 0.121 195), oklch(0.84 0.11 195))' }}>
          SIGMA
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 10 }}>
          {linksVisibles.map(l => (
            <Link key={l.to} to={l.to} style={{
              padding: '8px 15px', borderRadius: 11, fontSize: 16, fontWeight: l.label === activo ? 600 : 500,
              letterSpacing: '0.01em', textDecoration: 'none', whiteSpace: 'nowrap',
              color: l.label === activo ? 'var(--tx)' : 'var(--tx-muted)',
              background: l.label === activo ? 'light-dark(oklch(0.916 0.032 210 / 0.75), oklch(0.34 0.045 210 / 0.75))' : 'transparent',
              boxShadow: l.label === activo ? 'inset 0 0 0 1px light-dark(oklch(0.565 0.099 200 / 0.35), oklch(0.70 0.09 200 / 0.35))' : 'none',
            }}>{l.label}</Link>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 15px 7px 12px', borderRadius: 999, background: 'light-dark(oklch(0.702 0.099 168 / 0.16), oklch(0.45 0.09 168 / 0.16))', boxShadow: 'inset 0 0 0 1px light-dark(oklch(0.620 0.110 168 / 0.28), oklch(0.60 0.10 168 / 0.28))' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, animation: signalStatus === 'ok' ? 'breathe 2.6s ease-in-out infinite' : undefined }} />
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.04em', color: 'light-dark(oklch(0.488 0.110 168), oklch(0.84 0.10 168))' }}>{dotLabel}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--tx-muted)' }}>{user?.nombre ?? user?.username ?? 'Administrador'}</div>
        <div style={{ fontSize: 32, fontWeight: 300, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--tx)' }}>
          {now.toLocaleTimeString('es-PE', { hour12: false })}
        </div>
        <ThemeToggle />
        <div onClick={logout} role="button" aria-label="Cerrar sesión" title="Cerrar sesión" style={{
          padding: '8px 16px', borderRadius: 11, fontSize: 15, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          color: 'light-dark(oklch(0.510 0.088 20), oklch(0.80 0.08 20))', background: 'light-dark(oklch(0.930 0.035 20 / 0.35), oklch(0.30 0.05 20 / 0.35))', boxShadow: 'inset 0 0 0 1px light-dark(oklch(0.620 0.132 20 / 0.4), oklch(0.60 0.12 20 / 0.40))',
        }}>
          Salir
        </div>
      </div>
    </div>
  )
}
