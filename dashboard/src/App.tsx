import { useCallback, useEffect, useMemo, useState } from 'react'
import Field, { Legend } from './components/Field'
import Panel from './components/Panel'
import type { Game, Play, PlaySummary } from './types'

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

const SPEEDS = [0.25, 0.5, 1, 2]
const FPS = 10 // los datos de tracking van a 10 frames por segundo

export default function App() {
  const [games, setGames] = useState<Game[]>([])
  const [gameId, setGameId] = useState<number | null>(null)
  const [plays, setPlays] = useState<PlaySummary[]>([])
  const [playId, setPlayId] = useState<number | null>(null)
  const [play, setPlay] = useState<Play | null>(null)
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => {
    getJson<Game[]>('api/games').then((g) => { setGames(g); if (g.length) setGameId(g[0].gameId) }).catch(fail)
  }, [])

  useEffect(() => {
    if (gameId == null) return
    setPlays([]); setPlay(null); setPlayId(null)
    getJson<PlaySummary[]>(`api/games/${gameId}/plays`)
      .then((p) => { setPlays(p); if (p.length) setPlayId(p[0].playId) })
      .catch(fail)
  }, [gameId])

  useEffect(() => {
    if (gameId == null || playId == null) return
    let cancel = false
    setLoading(true); setPlaying(false)
    getJson<Play>(`api/games/${gameId}/plays/${playId}`)
      .then((p) => { if (!cancel) { setPlay(p); setI(0); setError(null) } })
      .catch((e) => !cancel && fail(e))
      .finally(() => !cancel && setLoading(false))
    return () => { cancel = true }
  }, [gameId, playId])

  const n = play?.frames.length ?? 0

  useEffect(() => {
    if (!playing || n === 0) return
    const t = setInterval(() => {
      setI((x) => {
        if (x >= n - 1) { setPlaying(false); return x }
        return x + 1
      })
    }, 1000 / (FPS * speed))
    return () => clearInterval(t)
  }, [playing, speed, n])

  const toggle = useCallback(() => {
    if (n === 0) return
    setI((x) => (x >= n - 1 ? 0 : x))
    setPlaying((p) => !p)
  }, [n])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'SELECT' || tag === 'INPUT') return
      if (e.key === ' ') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowRight') { setPlaying(false); setI((x) => Math.min(n - 1, x + 1)) }
      else if (e.key === 'ArrowLeft') { setPlaying(false); setI((x) => Math.max(0, x - 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n, toggle])

  const frame = play?.frames[Math.min(i, n - 1)]
  const markers = useMemo(() => {
    if (!play) return []
    return play.frames
      .map((f, idx) => ({ idx, ev: f.ev }))
      .filter((m) => m.ev.some((e) => ['ball_snap', 'autoevent_ballsnap', 'pass_forward', 'autoevent_passforward', 'qb_sack', 'qb_strip_sack', 'first_contact', 'tackle', 'pass_arrived'].includes(e)))
  }, [play])

  const label = (e: string) =>
    ({ ball_snap: 'snap', autoevent_ballsnap: 'snap', pass_forward: 'pase', autoevent_passforward: 'pase', qb_sack: 'sack', qb_strip_sack: 'sack', first_contact: 'contacto', tackle: 'tackle', pass_arrived: 'llega pase' } as Record<string, string>)[e] ?? e

  return (
    <div className="min-h-screen bg-slate-900 p-4 text-gray-100">
      <header className="mb-3 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-bold">Grafos dinámicos para comentaristas</h1>
        <label className="text-xs text-gray-400">Partido
          <select className="mt-1 block rounded bg-slate-800 p-2 text-sm text-white" value={gameId ?? ''} onChange={(e) => setGameId(Number(e.target.value))}>
            {games.map((g) => <option key={g.gameId} value={g.gameId}>Sem {g.week} · {g.visitor} @ {g.home}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400">Jugada
          <select className="mt-1 block max-w-[28rem] rounded bg-slate-800 p-2 text-sm text-white" value={playId ?? ''} onChange={(e) => setPlayId(Number(e.target.value))}>
            {plays.map((p) => (
              <option key={p.playId} value={p.playId}>
                Q{p.quarter} {p.clock} · {p.down}&amp;{p.yardsToGo} {p.possession} · {p.passResult ?? '-'} · {p.description.replace(/^\([^)]*\)\s*(\([^)]*\)\s*)?/, '').slice(0, 55)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && <div className="mb-3 rounded bg-red-900 p-2 text-sm">Error: {error}</div>}

      {play && frame ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <main className={loading ? 'opacity-60' : ''}>
            <Field play={play} frame={frame} showAllBlocks={showAll} hovered={hovered} onHover={setHovered} />
            <div className="mt-2"><Legend play={play} /></div>

            <div className="mt-3 rounded-lg bg-slate-800 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button className="rounded bg-slate-700 px-3 py-1" onClick={() => { setPlaying(false); setI(0) }} aria-label="Inicio">⏮</button>
                <button className="rounded bg-slate-700 px-3 py-1" onClick={() => { setPlaying(false); setI((x) => Math.max(0, x - 1)) }} aria-label="Frame anterior">◀</button>
                <button className="w-28 rounded bg-sky-600 px-3 py-1 font-semibold" onClick={toggle}>{playing ? 'Pausa' : 'Reproducir'}</button>
                <button className="rounded bg-slate-700 px-3 py-1" onClick={() => { setPlaying(false); setI((x) => Math.min(n - 1, x + 1)) }} aria-label="Frame siguiente">▶</button>
                <select className="rounded bg-slate-700 p-1 text-sm" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Velocidad">
                  {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                </select>
                <label className="ml-2 flex items-center gap-1 text-xs text-gray-300">
                  <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Ver todos los bloqueos
                </label>
                <span className="ml-auto text-sm tabular-nums text-gray-300">
                  frameId {frame.f} · {((frame.f - play.snapFrame) / FPS).toFixed(1)} s desde el snap ·{' '}
                  <b>{frame.phase === 'pre' ? 'Pre-snap' : frame.phase === 'qb' ? 'QB con balón' : 'Balón suelto / fin'}</b>
                </span>
              </div>
              <input type="range" className="mt-3 w-full" min={0} max={n - 1} value={i}
                onChange={(e) => { setPlaying(false); setI(Number(e.target.value)) }} aria-label="Línea de tiempo" />
              <div className="relative h-5 text-[10px] text-gray-400">
                {markers.map((m) => (
                  <button key={m.idx} className="absolute -translate-x-1/2 whitespace-nowrap hover:text-white"
                    style={{ left: `${n > 1 ? (m.idx / (n - 1)) * 100 : 0}%` }}
                    onClick={() => { setPlaying(false); setI(m.idx) }}>▲ {m.ev.map(label).filter((v, k, a) => a.indexOf(v) === k).join('/')}</button>
                ))}
              </div>
              <p className="text-xs text-gray-500">Atajos: espacio = reproducir/pausa, ← → = frame a frame.</p>
            </div>
          </main>
          <Panel play={play} frame={frame} />
        </div>
      ) : (
        <p className="text-gray-400">{loading ? 'Cargando jugada…' : 'Selecciona un partido y una jugada.'}</p>
      )}
    </div>
  )
}
