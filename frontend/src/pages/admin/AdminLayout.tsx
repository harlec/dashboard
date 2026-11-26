import { BuildingOffice2Icon, ChartPieIcon, Cog6ToothIcon, ComputerDesktopIcon, GlobeAltIcon, MagnifyingGlassIcon, MapIcon, ServerStackIcon, TagIcon, UsersIcon, VideoCameraIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const links = [
  { to: '/admin',           Icon: ChartPieIcon, label: 'Resumen',     end: true },
  { to: '/admin/estaciones', Icon: BuildingOffice2Icon, label: 'Estaciones'  },
  { to: '/admin/vias',       Icon: MapIcon, label: 'Vías'         },
  { to: '/admin/equipos',    Icon: ComputerDesktopIcon, label: 'Equipos'      },
  { to: '/admin/tipos-equipo', Icon: TagIcon, label: 'Tipos de equipo' },
  { to: '/admin/mantenimiento', Icon: WrenchScrewdriverIcon, label: 'Mantenimiento' },
  { to: '/admin/servicios',     Icon: ServerStackIcon, label: 'Servicios' },
  { to: '/admin/servicio-checks', Icon: MagnifyingGlassIcon, label: 'Chequeos de servicio' },
  { to: '/admin/nvr',        Icon: VideoCameraIcon, label: 'NVR y canales' },
  { to: '/admin/red',        Icon: GlobeAltIcon, label: 'Red (firewalls)' },
  { to: '/admin/usuarios',   Icon: UsersIcon, label: 'Usuarios'     },
  { to: '/admin/config',     Icon: Cog6ToothIcon, label: 'Configuración' },
]

export function AdminLayout() {
  const { user } = useAuth()
  if (user?.rol !== 'admin') return (
    <div className="flex items-center justify-center min-h-[60vh] text-danger font-bold">
      Acceso denegado — solo administradores
    </div>
  )

  return (
    <div className="flex flex-1 min-h-[900px]">
      {/* Sidebar */}
      <aside className="w-52 bg-surface border-r border-border flex-shrink-0 pt-4">
        <div className="px-4 pb-3 text-[0.7rem] text-muted font-bold uppercase tracking-widest">
          Panel Admin
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {links.map(({ to, label, end, Icon }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand/20 text-brand font-bold'
                    : 'text-muted hover:bg-surface-3 hover:text-[color:var(--tx)]'
                }`}>
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
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
