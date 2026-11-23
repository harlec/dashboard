import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const CLAVE = 'tema'

function leer(): Theme {
  try { return localStorage.getItem(CLAVE) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

function aplicar(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
}

// El tema vive en <html data-theme>; los colores están en styles/theme.css.
// index.html lo aplica antes de pintar para evitar el parpadeo.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(leer)

  useEffect(() => { aplicar(theme) }, [theme])

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(CLAVE, next) } catch { /* sin storage */ }
      return next
    })
  }, [])

  return { theme, toggle }
}
