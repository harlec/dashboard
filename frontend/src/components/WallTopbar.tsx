import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Topbar de 52px dentro del lienzo de 1920 — hamburger + wordmark + nav inline
// + EN VIVO + usuario + reloj. Mismo componente en las 5 pantallas rediseñadas
// (sistema-visual.md). Vive DENTRO de ScaledStage, no es una barra aparte —
// por eso no lleva su propio fondo ni position:sticky.

const LINKS = [
  { to: '/',              label: 'Dashboard' },
  { to: '/noc',            label: 'NOC' },
  { to: '/incidentes',    label: 'Incidentes' },
  { to: '/reporte',       label: 'Reporte SLA' },
  { to: '/reportes',      label: 'Reportes' },
  { to: '/discrepancias', label: 'Discrepancias' },
  { to: '/ocr',            label: 'OCR Placas' },
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

interface Props { activo: string; signalStatus?: 'idle' | 'ok' | 'error' }

export function WallTopbar({ activo, signalStatus = 'ok' }: Props) {
  const { user, logout } = useAuth()
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

  const dotColor = { idle: 'oklch(0.55 0.015 265)', ok: 'oklch(0.82 0.13 168)', error: 'oklch(0.70 0.17 22)' }[signalStatus]
  const dotLabel = { idle: 'En espera', ok: 'EN VIVO', error: 'Sin conexión' }[signalStatus]

  return (
    <div style={{ height: 52, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <div onClick={() => setOpen(o => !o)} role="button" aria-label="Menú de navegación" style={{
            width: 40, height: 40, borderRadius: 13, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 5, cursor: 'pointer',
            background: open ? 'oklch(0.36 0.03 250 / 0.75)' : 'oklch(0.30 0.02 250 / 0.60)',
            boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)',
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 17, height: 2, borderRadius: 2, background: 'oklch(0.84 0.06 200)' }} />
            ))}
          </div>
          {open && (
            <div style={{
              position: 'absolute', left: 0, top: 48, zIndex: 50, minWidth: 200, borderRadius: 12, padding: 6,
              background: 'oklch(0.185 0.016 262 / 0.98)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.07), 0 14px 40px oklch(0 0 0 / 0.45)',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {LINKS.map(l => (
                <Link key={l.to} to={l.to} onClick={() => setOpen(false)} style={{
                  display: 'block', padding: '9px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 15, fontWeight: 500,
                  color: l.label === activo ? 'oklch(0.95 0.01 265)' : 'oklch(0.78 0.006 265)',
                  background: l.label === activo ? 'oklch(1 0 0 / 0.08)' : 'transparent',
                }}>{l.label}</Link>
              ))}
              <div style={{ borderTop: '1px solid oklch(1 0 0 / 0.08)', margin: '4px 0' }} />
              <div onClick={logout} role="button" style={{ padding: '9px 14px', borderRadius: 8, fontSize: 15, fontWeight: 500, color: 'oklch(0.60 0.015 265)', cursor: 'pointer' }}>
                Salir
              </div>
            </div>
          )}
        </div>

        <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '0.2em', color: 'oklch(0.84 0.11 195)' }}>
          PULSO<span style={{ fontWeight: 300, color: 'oklch(0.94 0.005 265)' }}>VIAL</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 10 }}>
          {LINKS.map(l => (
            <Link key={l.to} to={l.to} style={{
              padding: '8px 15px', borderRadius: 11, fontSize: 16, fontWeight: l.label === activo ? 600 : 500,
              letterSpacing: '0.01em', textDecoration: 'none', whiteSpace: 'nowrap',
              color: l.label === activo ? 'oklch(0.95 0.01 265)' : 'oklch(0.66 0.015 265)',
              background: l.label === activo ? 'oklch(0.34 0.045 210 / 0.75)' : 'transparent',
              boxShadow: l.label === activo ? 'inset 0 0 0 1px oklch(0.70 0.09 200 / 0.35)' : 'none',
            }}>{l.label}</Link>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 15px 7px 12px', borderRadius: 999, background: 'oklch(0.45 0.09 168 / 0.16)', boxShadow: 'inset 0 0 0 1px oklch(0.60 0.10 168 / 0.28)' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, animation: signalStatus === 'ok' ? 'breathe 2.6s ease-in-out infinite' : undefined }} />
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.04em', color: 'oklch(0.84 0.10 168)' }}>{dotLabel}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'oklch(0.62 0.015 265)' }}>{user?.nombre ?? user?.username ?? 'Administrador'}</div>
        <div style={{ fontSize: 32, fontWeight: 300, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'oklch(0.95 0.004 265)' }}>
          {now.toLocaleTimeString('es-PE', { hour12: false })}
        </div>
      </div>
    </div>
  )
}
