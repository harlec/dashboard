import { MoonIcon, SunIcon } from '@heroicons/react/24/outline'
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
      {claro ? <MoonIcon className="w-[18px] h-[18px]" /> : <SunIcon className="w-[18px] h-[18px]" />}
    </button>
  )
}
