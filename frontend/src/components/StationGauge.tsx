interface Props { pct: number; up: number; down: number }

const R      = 42
const CX     = 52
const CY     = 56
const ARC    = Math.PI * R   // longitud del semicírculo ≈ 131.9

function arcColor(pct: number) {
  if (pct >= 99) return '#72BF44'
  if (pct >= 95) return '#F99B1C'
  return '#F04545'
}

export function StationGauge({ pct, up, down }: Props) {
  const filled = Math.max((pct / 100) * ARC, 0)
  const color  = arcColor(pct)

  const d = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 104 60" width="104" height="60">
        {/* Filtro glow */}
        <defs>
          <filter id="sg-glow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Track gris */}
        <path d={d} fill="none" stroke="#252220" strokeWidth="11" strokeLinecap="round" />

        {/* Arco coloreado */}
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${ARC}`}
          filter="url(#sg-glow)"
        />

        {/* Porcentaje */}
        <text x={CX} y={CY - 10} textAnchor="middle"
          fill={color} fontSize="17" fontWeight="800"
          fontFamily="Segoe UI, Arial, sans-serif">
          {pct}%
        </text>
      </svg>

      {/* UP / DN debajo del gauge */}
      <div className="flex gap-3 text-center -mt-1">
        <div>
          <div className="text-brand font-bold text-sm leading-none">{up}</div>
          <div className="text-[0.55rem] text-muted uppercase">UP</div>
        </div>
        <div>
          <div className="text-danger font-bold text-sm leading-none">{down}</div>
          <div className="text-[0.55rem] text-muted uppercase">DN</div>
        </div>
      </div>
    </div>
  )
}
