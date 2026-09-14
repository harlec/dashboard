import { useEffect, useState, type ReactNode } from 'react'

// Mismo mecanismo que el Muro NOC (NocMuro.tsx): el contenido siempre se
// dibuja a 1920×1080 fijo — layout determinista, igual que el mockup — y se
// escala con transform:scale() según el ancho real de ventana. El zoom del
// navegador (Ctrl +/-) cambia window.innerWidth, dispara el resize y se
// recalcula solo, así que la proporción visual no cambia con el zoom.
export function ScaledStage({ children }: { children: ReactNode }) {
  const [escala, setEscala] = useState(() => window.innerWidth / 1920)

  useEffect(() => {
    const calcular = () => setEscala(window.innerWidth / 1920)
    calcular()
    window.addEventListener('resize', calcular)
    return () => window.removeEventListener('resize', calcular)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d13', overflow: 'hidden' }}>
      <div style={{
        width: 1920, height: 1080, flex: '0 0 auto', transform: `scale(${escala})`,
        boxSizing: 'border-box', padding: '22px 30px 24px', display: 'flex', flexDirection: 'column', gap: 14,
        fontFamily: 'var(--app-font)', color: 'oklch(0.96 0.004 265)', overflow: 'hidden',
        backgroundColor: '#0a0d13',
        backgroundImage: [
          'radial-gradient(1100px 620px at 12% -12%, oklch(0.30 0.055 250 / 0.55), transparent 65%)',
          'radial-gradient(900px 560px at 92% 8%, oklch(0.28 0.05 190 / 0.34), transparent 62%)',
          'linear-gradient(180deg, oklch(0.165 0.018 262) 0%, oklch(0.112 0.014 262) 100%)',
        ].join(', '),
      }}>
        {children}
      </div>
    </div>
  )
}
