/** Medidor semicircular 0-100 % del Índice de Presión en la Bolsa. */
export default function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const color = v >= 66 ? '#ef4444' : v >= 33 ? '#eab308' : '#22c55e'
  const cx = 100, cy = 100, r = 80
  const pt = (pct: number) => {
    const a = Math.PI * (1 - pct / 100)
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)]
  }
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from), [x2, y2] = pt(to)
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }
  return (
    <svg viewBox="0 0 200 120" className="w-full" role="img" aria-label={`Presión ${v.toFixed(0)} por ciento`}>
      <path d={arc(0, 33)} stroke="#14391f" strokeWidth={18} fill="none" />
      <path d={arc(33, 66)} stroke="#4a3d10" strokeWidth={18} fill="none" />
      <path d={arc(66, 100)} stroke="#4a1414" strokeWidth={18} fill="none" />
      {v > 0 && <path d={arc(0, Math.max(v, 0.5))} stroke={color} strokeWidth={10} fill="none" />}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={34} fontWeight={700} fill="#fff">{v.toFixed(0)}%</text>
      <text x={cx - r} y={cy + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">0</text>
      <text x={cx + r} y={cy + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">100</text>
    </svg>
  )
}
