interface Props {
  ups: number; downs: number; incActivos: number; total: number
}

const C = 326.7  // circunferencia r=52

export function DonutChart({ ups, downs, incActivos, total }: Props) {
  const t = Math.max(total, 1)
  const arcUp   = Math.round((ups        / t) * C * 10) / 10
  const arcDown = Math.round((downs      / t) * C * 10) / 10
  const arcInc  = Math.round((incActivos / t) * C * 10) / 10

  const offUp   = C / 4
  const offDown = -(arcUp  - C / 4)
  const offInc  = -(arcUp + arcDown - C / 4)

  const uptimePct = Math.round((ups / t) * 100)

  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* track */}
      <circle cx="65" cy="65" r="52" fill="none" stroke="#252220" strokeWidth="16" />
      {/* UP */}
      <circle cx="65" cy="65" r="52" fill="none" stroke="#72BF44" strokeWidth="16"
        strokeDasharray={`${arcUp} ${C}`} strokeDashoffset={offUp}
        filter="url(#glow)" strokeLinecap="butt" transform="rotate(-90 65 65)" />
      {/* DOWN */}
      <circle cx="65" cy="65" r="52" fill="none" stroke="#F04545" strokeWidth="16"
        strokeDasharray={`${arcDown} ${C}`} strokeDashoffset={offDown}
        filter="url(#glow)" strokeLinecap="butt" transform="rotate(-90 65 65)" />
      {/* INC */}
      <circle cx="65" cy="65" r="52" fill="none" stroke="#F99B1C" strokeWidth="16"
        strokeDasharray={`${arcInc} ${C}`} strokeDashoffset={offInc}
        filter="url(#glow)" strokeLinecap="butt" transform="rotate(-90 65 65)" />
      {/* texto central */}
      <text x="65" y="61" textAnchor="middle" fill="#72BF44" fontSize="20" fontWeight="800"
        fontFamily="Segoe UI,Arial,sans-serif">{uptimePct}%</text>
      <text x="65" y="77" textAnchor="middle" fill="#a09890" fontSize="10"
        fontFamily="Segoe UI,Arial,sans-serif">UPTIME</text>
    </svg>
  )
}
