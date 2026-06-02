/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta de AUNOR — misma que el diseño actual
        brand:   '#72BF44',
        danger:  '#F04545',
        warn:    '#F99B1C',
        surface: '#141210',
        'surface-2': '#1e1c1a',
        'surface-3': '#242120',
        border:  '#252220',
        muted:   '#a09890',
        dim:     '#7a7470',
      },
      fontFamily: {
        sans: ['Segoe UI', 'Arial', 'sans-serif'],
      },
      keyframes: {
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
      },
    },
  },
  plugins: [],
}
