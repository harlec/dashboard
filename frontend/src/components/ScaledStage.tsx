import { useEffect, useRef, useState, type ReactNode } from 'react'

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
    // Anclado ARRIBA y con scroll vertical: si la ventana no está maximizada
    // (alto < 1080·escala) el topbar/menú sigue visible y el resto se desplaza,
    // en vez de centrarse y recortar arriba y abajo.
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', background: '#0a0d13', overflowX: 'hidden' }}>
     <div style={{ width: 1920 * escala, height: 1080 * escala, flex: '0 0 auto', margin: '0 auto', overflow: 'hidden' }}>
      <div style={{
        width: 1920, height: 1080, flex: '0 0 auto', transform: `scale(${escala})`, transformOrigin: 'top left',
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
    </div>
  )
}

// Variante para páginas de contenido largo (Vías, NOC, Admin): mismo lienzo de
// 1920 de ancho y mismo estilo que ScaledStage, pero el alto crece con el
// contenido (mínimo 1080) y la página hace scroll — así heredan el aspecto
// "grueso" de OCR/Discrepancias sin recortar nada.
export function ScaledPage({ children }: { children: ReactNode }) {
  const [escala, setEscala] = useState(() => window.innerWidth / 1920)
  const [alto, setAlto] = useState(1080)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const calcular = () => setEscala(window.innerWidth / 1920)
    calcular()
    window.addEventListener('resize', calcular)
    return () => window.removeEventListener('resize', calcular)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setAlto(el.offsetHeight))
    ro.observe(el)
    setAlto(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', background: '#0a0d13', overflowX: 'hidden' }}>
      <div style={{ width: 1920 * escala, height: alto * escala, flex: '0 0 auto', margin: '0 auto', overflow: 'hidden' }}>
        <div ref={ref} style={{
          width: 1920, minHeight: 1080, transform: `scale(${escala})`, transformOrigin: 'top left',
          boxSizing: 'border-box', padding: '22px 30px 24px', display: 'flex', flexDirection: 'column', gap: 14,
          fontFamily: 'var(--app-font)', color: 'oklch(0.96 0.004 265)',
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
    </div>
  )
}
