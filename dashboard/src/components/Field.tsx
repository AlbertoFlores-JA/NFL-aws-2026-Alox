import type { Frame, PlayData } from '../types'

const W = 120
const H = 160 / 3

interface Props {
  play: PlayData
  frame: Frame
  hovered: number | null
  onHover: (i: number | null) => void
}

export default function Field({ play, frame, hovered, onHover }: Props) {
  const { players, header } = play
  const openIds = new Set(frame.open)
  const hp = hovered != null ? frame.p[hovered] : null
  const hpl = hovered != null ? players[hovered] : null

  return (
    <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} className="w-full select-none rounded-lg bg-[#090d16]">
      <rect x={0} y={0} width={W} height={H} fill="#14532d" />
      <rect x={0} y={0} width={10} height={H} fill="#1e3a8a" />
      <rect x={110} y={0} width={10} height={H} fill="#7c2d12" />
      {Array.from({ length: 11 }, (_, i) => 10 + i * 10).map((x) => (
        <line key={x} x1={x} y1={0} x2={x} y2={H} stroke="#fff" strokeOpacity={0.55} strokeWidth={0.2} />
      ))}
      {Array.from({ length: 10 }, (_, i) => 15 + i * 10).map((x) => (
        <line key={x} x1={x} y1={0} x2={x} y2={H} stroke="#fff" strokeOpacity={0.2} strokeWidth={0.15} strokeDasharray="0.6 0.9" />
      ))}
      {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((x) => (
        <text key={x} x={x} y={H - 4} fill="#fff" fillOpacity={0.4} fontSize={3} textAnchor="middle" fontWeight={700}>
          {x <= 60 ? x - 10 : 110 - x}
        </text>
      ))}
      <text x={5} y={H / 2} fill="#fff" fillOpacity={0.7} fontSize={3.4} fontWeight={700} textAnchor="middle" transform={`rotate(-90 5 ${H / 2})`}>{header.offense}</text>
      <text x={115} y={H / 2} fill="#fff" fillOpacity={0.7} fontSize={3.4} fontWeight={700} textAnchor="middle" transform={`rotate(90 115 ${H / 2})`}>{header.defense}</text>

      {/* halos: receptores ABIERTOS (separación >= 3 yd) */}
      {players.map((p, i) => {
        const c = frame.p[i]
        if (!c || !openIds.has(p.id)) return null
        return <circle key={`h${p.id}`} cx={c[0]} cy={c[1]} r={2.3} fill="rgba(57,255,20,0.35)" stroke="#39ff14" strokeWidth={0.4} />
      })}

      {players.map((p, i) => {
        const c = frame.p[i]
        if (!c) return null
        const sep = frame.sep[String(p.id)]
        return (
          <g key={p.id} transform={`translate(${c[0]} ${c[1]})`} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)} style={{ cursor: 'pointer' }}>
            <circle r={1.15} fill={p.side === 'off' ? '#3b82f6' : '#f97316'} stroke="#fff" strokeWidth={0.15} />
            <text y={0.45} fontSize={1.2} fill="#fff" textAnchor="middle" fontWeight={700} pointerEvents="none">{p.jersey}</text>
            {sep !== undefined && (
              <text y={3} fontSize={1.3} textAnchor="middle" fontWeight={700} pointerEvents="none" fill={sep >= play.thresholds.open ? '#86efac' : '#fff'}
                stroke="#000" strokeWidth={0.15} paintOrder="stroke">{sep.toFixed(1)}</text>
            )}
          </g>
        )
      })}

      {/* balón: ovoide dorado con borde blanco, halo pulsante y etiqueta */}
      {frame.ball && (
        <g transform={`translate(${frame.ball[0]} ${frame.ball[1]})`} pointerEvents="none">
          <circle r={2.6} fill="#facc15" fillOpacity={0.35}>
            <animate attributeName="r" values="2.2;4;2.2" dur="1s" repeatCount="indefinite" />
            <animate attributeName="fill-opacity" values="0.5;0.05;0.5" dur="1s" repeatCount="indefinite" />
          </circle>
          <ellipse rx={1.9} ry={1.2} fill="#facc15" stroke="#ffffff" strokeWidth={0.5} />
          <line x1={-0.7} y1={0} x2={0.7} y2={0} stroke="#92400e" strokeWidth={0.2} />
          <text y={-3.2} fontSize={2.1} textAnchor="middle" fontWeight={800} fill="#facc15" stroke="#000" strokeWidth={0.35} paintOrder="stroke">🏈 BALÓN</text>
        </g>
      )}

      {/* hover: nombre, número, posición, velocidad */}
      {hp && hpl && hovered != null && (
        <g transform={`translate(${Math.min(hp[0] + 2, W - 30)} ${Math.max(hp[1] - 9, 1)})`} pointerEvents="none">
          <rect width={28} height={7.5} rx={0.8} fill="#0f172a" fillOpacity={0.95} stroke="#94a3b8" strokeWidth={0.15} />
          <text x={1} y={2.4} fontSize={1.9} fill="#fff" fontWeight={700}>{hpl.name} #{hpl.jersey ?? ''}</text>
          <text x={1} y={4.6} fontSize={1.6} fill="#cbd5e1">{hpl.pos} · {hpl.role ?? 'sin rol'}</text>
          <text x={1} y={6.7} fontSize={1.6} fill="#cbd5e1">
            Velocidad {frame.s[hovered] != null ? `${frame.s[hovered]} yd/s` : '—'}
            {frame.sep[String(hpl.id)] !== undefined ? ` · Sep ${frame.sep[String(hpl.id)].toFixed(1)} yd` : ''}
          </text>
        </g>
      )}
    </svg>
  )
}
