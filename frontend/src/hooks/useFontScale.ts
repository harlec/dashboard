import { useEffect } from 'react'

const CLAVE_ESCALA = 'escala_fuente'
const CLAVE_FUENTE = 'fuente_sistema'

const FUENTES: Record<string, string> = {
  segoe: "'Segoe UI', Arial, sans-serif",
  manrope: "'Manrope', 'Segoe UI', Arial, sans-serif",
}

// Todos los tamaños de la app están en rem (relativos al font-size de <html>),
// así que cambiar la raíz reescala el sistema entero sin tocar cada componente.
// La tipografía se aplica igual: una variable CSS en :root que Tailwind usa como
// primer nombre en `font-sans` (ver tailwind.config.js) — cambiarla acá cambia
// toda la app sin tocar cada componente tampoco.
export function useFontScale() {
  useEffect(() => {
    fetch('/api/config', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: { clave: string; valor: string }[]) => {
        const pct = parseInt(rows.find(r => r.clave === CLAVE_ESCALA)?.valor ?? '100', 10) || 100
        document.documentElement.style.fontSize = `${pct / 100 * 16}px`

        const fuente = rows.find(r => r.clave === CLAVE_FUENTE)?.valor ?? 'manrope'
        document.documentElement.style.setProperty('--app-font', FUENTES[fuente] ?? FUENTES.manrope)
      })
      .catch(() => {})
  }, [])
}
