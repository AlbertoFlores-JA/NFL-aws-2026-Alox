import type { Duel, Frame, Play, Player } from '../types'

const W = 120
const H = 160 / 3
const OFF = '#3b82f6'
const DEF = '#f97316'
const EDGE_COLOR = { g: '#22c55e', y: '#eab308', r: '#ef4444' } as const

function Shape({ role, r }: { role: string | null; r: number }) {
  switch (role) {
    case 'Pass': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const rad = i % 2 === 0 ? r * 1.5 : r * 0.65
        const a = (Math.PI / 5) * i - Math.PI / 2
        return `${rad * Math.cos(a)},${rad * Math.sin(a)}`
      }).join(' ')
      return <polygon points={pts} />
    }
    case 'Pass Route':
      return <polygon points={`0,${-r * 1.2} ${r * 1.1},${r * 0.9} ${-r * 1.1},${r * 0.9}`} />
    case 'Pass Block':
      return <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={0.15} />
    case 'Pass Rush':
      return <polygon points={`0,${-r * 1.25} ${r * 1.25},0 0,${r * 1.25} ${-r * 1.25},0`} />
    case 'Coverage':
      return <circle r={r} />
    default:
      return <circle r={r * 0.7} />
  }
}

interface Props {
  play: Play
  frame: Frame
  showAllBlocks: boolean
  hovered: number | null
  onHover: (i: number | null) => void
}

export default function Field({ play, frame, showAllBlocks, hovered, onHover }: Props) {
  const { players } = play
  const focus = frame.key
  const keyDuels = frame.duels.filter((d) => d.key)
  const involved = new Set<number>()
  keyDuels.forEach((d) => { involved.add(d.a); involved.add(d.b) })
  const labelled = new Set<number>(involved)
  if (play.qbIndex != null) labelled.add(play.qbIndex)
  frame.edges.forEach((e) => labelled.add(e.to))
  if (hovered != null) labelled.add(hovered)

  const snapBall = play.frames.find((f) => f.f === play.snapFrame)?.ball
  const pos = (i: number) => frame.p[i]

  const lastName = (p: Player) => p.name.split(' ').slice(-1)[0]
  const edgeOpacity = focus ? 0.18 : 1

  const duelLine = (d: Duel, k: string) => {
    const a = pos(d.a), b = pos(d.b)
    if (!a || !b) return null
    const color = d.red ? '#ef4444' : '#fde047'
    return (
      <g key={k}>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={0.55} strokeLinecap="round" />
        {[a, b].map((c, j) => (
          <circle key={j} cx={c[0]} cy={c[1]} r={2} fill="none" stroke={color} strokeWidth={0.3}>
            <animate attributeName="r" values="1.7;2.6;1.7" dur="1s" repeatCount="indefinite" />
          </circle>
        ))}
        <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 1.8} fontSize={1.4} fill={color} textAnchor="middle" fontWeight={700}
          stroke="#000" strokeWidth={0.12} paintOrder="stroke">
          {d.kind === 'sack' ? 'SACK' : d.red ? 'DERROTADO' : 'CHOQUE'} · {d.d.toFixed(1)} yd
        </text>
      </g>
    )
  }

  return (
    <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} className="w-full rounded-lg bg-emerald-900 shadow-lg select-none">
      {/* campo */}
      <rect x={0} y={0} width={W} height={H} fill="#166534" />
      <rect x={0} y={0} width={10} height={H} fill="#1e3a8a" opacity={0.75} />
      <rect x={110} y={0} width={10} height={H} fill="#7c2d12" opacity={0.75} />
      {Array.from({ length: 21 }, (_, i) => 10 + i * 5).map((x) => (
        <line key={x} x1={x} y1={0} x2={x} y2={H} stroke="#fff" strokeOpacity={x % 10 === 0 ? 0.55 : 0.25} strokeWidth={0.18} />
      ))}
      {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((x) => {
        const n = x <= 60 ? x - 10 : 110 - x
        return (
          <g key={x} fill="#fff" fillOpacity={0.35} fontSize={3} textAnchor="middle" fontWeight={700}>
            <text x={x} y={H - 6}>{n}</text>
            <text x={x} y={9} transform={`rotate(180 ${x} 7.2)`}>{n}</text>
          </g>
        )
      })}
      <text x={5} y={H / 2} fill="#fff" fillOpacity={0.5} fontSize={3.2} textAnchor="middle" fontWeight={700}
        transform={`rotate(-90 5 ${H / 2})`}>{play.offense}</text>
      <text x={115} y={H / 2} fill="#fff" fillOpacity={0.5} fontSize={3.2} textAnchor="middle" fontWeight={700}
        transform={`rotate(90 115 ${H / 2})`}>{play.defense}</text>
      {snapBall && (
        <line x1={snapBall[0]} y1={0} x2={snapBall[0]} y2={H} stroke="#38bdf8" strokeWidth={0.25} strokeDasharray="1 0.8" opacity={0.8} />
      )}

      {/* bloqueos no clave (opcional) */}
      {showAllBlocks &&
        frame.duels.filter((d) => !d.key).map((d, i) => {
          const a = pos(d.a), b = pos(d.b)
          return a && b ? <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#e5e7eb" strokeOpacity={focus ? 0.2 : 0.7} strokeWidth={0.25} /> : null
        })}

      {/* aristas QB -> receptores */}
      {play.qbIndex != null && pos(play.qbIndex) && frame.edges.map((e) => {
        const q = pos(play.qbIndex!), t = pos(e.to), n = pos(e.nd)
        if (!q || !t) return null
        const c = EDGE_COLOR[e.c]
        return (
          <g key={e.to} opacity={edgeOpacity}>
            {n && <line x1={t[0]} y1={t[1]} x2={n[0]} y2={n[1]} stroke="#fff" strokeWidth={0.15} strokeDasharray="0.5 0.5" opacity={0.8} />}
            <line x1={q[0]} y1={q[1]} x2={t[0]} y2={t[1]} stroke={c} strokeWidth={0.4} strokeLinecap="round" />
            <text x={(q[0] + t[0]) / 2} y={(q[1] + t[1]) / 2 - 0.6} fontSize={1.3} fill={c} textAnchor="middle" fontWeight={700}
              stroke="#000" strokeWidth={0.12} paintOrder="stroke">{e.sep.toFixed(1)}</text>
          </g>
        )
      })}

      {/* pares clave */}
      {keyDuels.map((d, i) => duelLine(d, `k${i}`))}

      {/* balón */}
      {frame.ball && (
        <ellipse cx={frame.ball[0]} cy={frame.ball[1]} rx={0.9} ry={0.55} fill="#92400e" stroke="#fff" strokeWidth={0.15} />
      )}

      {/* jugadores */}
      {players.map((p, i) => {
        const c = pos(i)
        if (!c) return null
        const dim = focus && !involved.has(i) && i !== play.qbIndex
        const isKey = involved.has(i)
        return (
          <g key={p.id} transform={`translate(${c[0]} ${c[1]})`} opacity={dim ? 0.45 : 1}
            onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)} style={{ cursor: 'pointer' }}>
            <g fill={p.side === 'off' ? OFF : DEF} stroke={isKey ? '#fde047' : '#fff'} strokeWidth={isKey ? 0.3 : 0.15}>
              <Shape role={p.role} r={1.05} />
            </g>
            <text y={0.45} fontSize={1.2} fill="#fff" textAnchor="middle" fontWeight={700} pointerEvents="none">{p.jersey}</text>
            {labelled.has(i) && (
              <text y={-2.3} fontSize={1.3} fill="#fff" textAnchor="middle" fontWeight={600} pointerEvents="none"
                stroke="#000" strokeWidth={0.15} paintOrder="stroke">{lastName(p)}</text>
            )}
            <title>{`${p.name} · ${p.pos ?? ''} · ${p.role ?? 'sin rol PFF'}`}</title>
          </g>
        )
      })}
    </svg>
  )
}

export function Legend({ play }: { play: Play }) {
  const sw = (shape: string, label: string) => (
    <span className="inline-flex items-center gap-1">
      <svg width="16" height="16" viewBox="-2 -2 4 4" fill="#9ca3af" stroke="#fff" strokeWidth={0.2}>
        <Shape role={shape} r={1.2} />
      </svg>
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
      <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full" style={{ background: OFF }} />Ataque ({play.offense})</span>
      <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full" style={{ background: DEF }} />Defensa ({play.defense})</span>
      {sw('Pass', 'QB')}{sw('Pass Route', 'Receptor')}{sw('Pass Block', 'Bloqueador')}{sw('Pass Rush', 'Rusher')}{sw('Coverage', 'Cobertura')}
    </div>
  )
}
