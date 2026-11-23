/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa ALEATICA — misma que usa el muro NOC (NocMuro.tsx),
        // migrada acá para que todo el sistema comparta una sola identidad visual.
        // Colores neutros: variables en src/styles/theme.css (tema oscuro/claro).
        brand:        '#72BF44',
        'brand-light': '#72BF44',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--c-surface-3) / <alpha-value>)',
        border:  'rgb(var(--c-border) / <alpha-value>)',
        // Semáforo — sistema-visual.md del rediseño "monitoreo funcional". Único
        // set de estado para toda la app (no reasignar por pantalla).
        ok:      'oklch(0.78 0.13 160)',
        warn:    'oklch(0.82 0.13 62)',
        danger:  'oklch(0.70 0.17 22)',
        info:    'oklch(0.78 0.11 205)',
        // Texto — primario/secundario/terciario del mismo sistema.
        ink:   'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        dim:   'rgb(var(--c-dim) / <alpha-value>)',
      },
      fontFamily: {
        // --app-font la fija useFontScale.ts en runtime según Admin → Configuración
        // (Segoe UI o Manrope) — si no está definida, cae al resto de la lista.
        sans: ['var(--app-font)', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      keyframes: {
        'flow-dash': { to: { strokeDashoffset: '-48' } },
        'ping-pulse': {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%':     { opacity: '0.5', transform: 'scale(1.4)' },
        },
        'blink-down': {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.6' },
        },
      },
      animation: {
        'ping-pulse': 'ping-pulse 0.6s ease-in-out infinite',
        'blink-down': 'blink-down 2s infinite',
        'flow-dash':  'flow-dash 1.2s linear infinite',
      },
    },
  },
  plugins: [],
}
