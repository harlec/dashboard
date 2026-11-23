import { useTheme } from '../hooks/useTheme'

// Botón sol/luna para pasar de tema claro a oscuro. Colores en styles/theme.css.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const claro = theme === 'light'
  return (
    <button
      onClick={toggle}
      type="button"
      aria-label={claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      title={claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
        bg-ink/[0.06] hover:bg-ink/15 border border-ink/10 text-ink transition-colors ${className}`}
    >
      {claro ? (
        /* luna */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        /* sol */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  )
}
