import { useEffect, useState } from 'react'
import { api } from '../../api/client'

export function AdminDashboard() {
  const [kpis, setKpis] = useState<any>(null)

  useEffect(() => {
    api.liveDashboard().then(d => setKpis(d.kpis)).catch(console.error)
  }, [])

  const cards = kpis ? [
    { label: 'Total equipos',  value: kpis.total,       color: 'text-[#eae7e4]' },
    { label: 'Operativos',     value: kpis.ups,         color: 'text-brand'     },
    { label: 'Caídos',         value: kpis.downs,       color: 'text-danger'    },
    { label: 'Inc. activos',   value: kpis.incActivos,  color: 'text-warn'      },
    { label: 'Uptime global',  value: `${kpis.uptimePct}%`, color: 'text-brand' },
  ] : []

  return (
    <div>
      <h1 className="text-xl font-extrabold text-[#eae7e4] mb-6">Resumen del sistema</h1>

      <div className="grid grid-cols-5 gap-3 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-surface rounded-xl p-4 border border-border">
            <div className={`text-3xl font-extrabold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-muted mt-1 uppercase font-bold">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-muted">
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="font-bold text-[#eae7e4] mb-2">Accesos rápidos</div>
          <ul className="flex flex-col gap-1.5">
            {[
              { href: '/admin/estaciones', label: 'Gestionar estaciones' },
              { href: '/admin/equipos',    label: 'Gestionar equipos' },
              { href: '/admin/usuarios',   label: 'Gestionar usuarios' },
              { href: '/admin/config',     label: 'Configuración SMTP y pings' },
            ].map(l => (
              <li key={l.href}>
                <a href={l.href} className="text-brand hover:underline">{l.label}</a>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="font-bold text-[#eae7e4] mb-2">Info</div>
          <p className="text-xs leading-relaxed">
            Desde este panel puedes gestionar la estructura del sistema: estaciones, vías, equipos y usuarios.
            Los cambios se reflejan en el dashboard en tiempo real.
          </p>
        </div>
      </div>
    </div>
  )
}
