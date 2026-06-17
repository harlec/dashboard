import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const links = [
  { to: '/admin',           label: '📊 Resumen',     end: true },
  { to: '/admin/estaciones', label: '🏢 Estaciones'  },
  { to: '/admin/vias',       label: '🛣 Vías'         },
  { to: '/admin/equipos',    label: '🖥 Equipos'      },
  { to: '/admin/usuarios',   label: '👤 Usuarios'     },
  { to: '/admin/config',     label: '⚙ Configuración' },
]

export function AdminLayout() {
  const { user } = useAuth()
  if (user?.rol !== 'admin') return (
    <div className="flex items-center justify-center min-h-[60vh] text-danger font-bold">
      Acceso denegado — solo administradores
    </div>
  )

  return (
    <div className="flex min-h-[calc(100vh-60px)]">
      {/* Sidebar */}
      <aside className="w-52 bg-surface border-r border-border flex-shrink-0 pt-4">
        <div className="px-4 pb-3 text-[0.7rem] text-muted font-bold uppercase tracking-widest">
          Panel Admin
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {links.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand/20 text-brand font-bold'
                    : 'text-muted hover:bg-surface-3 hover:text-[#eae7e4]'
                }`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Contenido */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
