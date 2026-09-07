import type { CamaraStatus } from '../api/client'

interface Props { camaras: CamaraStatus[] }

export function CamarasSection({ camaras }: Props) {
  const up   = camaras.filter(c => c.online).length
  const down = camaras.length - up

  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="text-[1rem] font-extrabold text-[#eae7e4] flex items-center gap-2">
          📷 Cámaras Dahua
        </div>
        <div className="flex gap-2">
          <Badge label={`${up} Online`}  cls="bg-[#1D2A15] text-brand" />
          <Badge label={`${down} Offline`} cls="bg-[#2D1212] text-danger" />
        </div>
      </div>

      {/* Barra uptime */}
      <div className="flex items-center gap-3 px-5 py-2">
        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-700"
            style={{ width: `${camaras.length ? Math.round(up / camaras.length * 100) : 0}%` }}
          />
        </div>
        <span className="text-[0.8rem] font-bold text-[#eae7e4] min-w-[38px] text-right">
          {camaras.length ? Math.round(up / camaras.length * 100) : 0}%
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pb-4">
        {camaras.map(c => (
          <button
            key={c.id}
            title={`CAM ${c.camara} — ${c.online ? 'Online' : 'Offline'} · ${c.minDesdeEmail ?? '?'} min`}
            className={`w-12 h-[47px] rounded-lg flex flex-col items-center justify-end pb-1
              text-[0.68rem] font-extrabold text-white border-none cursor-pointer
              transition-transform duration-150 hover:scale-110 hover:brightness-110
              ${c.online ? 'bg-[#2d7a2d]' : 'bg-[#8B1A1A] animate-blink-down'}`}
          >
            {c.camara}
          </button>
        ))}
      </div>
    </div>
  )
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.72rem] font-bold ${cls}`}>
      {label}
    </span>
  )
}
