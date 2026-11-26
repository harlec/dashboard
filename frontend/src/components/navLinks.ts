import {
  BookOpenIcon, ChartBarIcon, Cog6ToothIcon, DocumentTextIcon, ExclamationTriangleIcon, GlobeAltIcon,
  MapIcon, ScaleIcon, Squares2X2Icon, TruckIcon, ViewfinderCircleIcon,
} from '@heroicons/react/24/outline'

// Única lista de navegación de Sigma: la usan la barra principal, la de Bitácora y el Muro NOC.
// Oficios: oculto del menú mientras se termina de probar.
const NAV_LINKS = [
  { to: '/',              label: 'Panel de control', Icon: Squares2X2Icon },
  { to: '/vias',          label: 'Vías',             Icon: MapIcon },
  { to: '/incidentes',    label: 'Incidentes',       Icon: ExclamationTriangleIcon },
  { to: '/bitacora',      label: 'Bitácora',         Icon: BookOpenIcon, soloTi: true },
  { to: '/reporte',       label: 'Reporte SLA',      Icon: ChartBarIcon },
  { to: '/reportes',      label: 'Reportes',         Icon: DocumentTextIcon },
  { to: '/transitos',     label: 'Tránsitos',        Icon: TruckIcon },
  { to: '/discrepancias', label: 'Discrepancias',    Icon: ScaleIcon },
  { to: '/ocr',           label: 'OCR Placas',       Icon: ViewfinderCircleIcon },
  { to: '/red',           label: 'Red',              Icon: GlobeAltIcon },
  { to: '/admin',         label: 'Admin',            Icon: Cog6ToothIcon },
]

export const linksPara = (rol?: string) =>
  NAV_LINKS.filter(l => !l.soloTi || rol === 'admin' || rol === 'ti')
