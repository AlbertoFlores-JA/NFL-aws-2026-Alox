import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Field from './components/Field'
import Gauge from './components/Gauge'
import type { GameInfo, PlayData, PlayItem } from './types'

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

const SPEEDS = [0.25, 0.5, 1, 2]

export default function App() {
  const [game, setGame] = useState<GameInfo | null>(null)
  const [plays, setPlays] = useState<PlayItem[]>([])
  const [playId, setPlayId] = useState<number | null>(null)
  const [play, setPlay] = useState<PlayData | null>(null)
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [hovered, setHovered] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showWelcome, setShowWelcome] = useState(() => {
    try { return localStorage.getItem('copilot-welcome') !== 'off' } catch { return true }
  })

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => {
    getJson<GameInfo>('api/game').then(setGame).catch(fail)
    getJson<PlayItem[]>('api/plays').then((p) => {
      setPlays(p)
      const q = Number(new URLSearchParams(window.location.search).get('playId')) // enlace directo ?playId=2279
      setPlayId(p.some((x) => x.playId === q) ? q : p.length ? p[0].playId : null)
    }).catch(fail)
  }, [])

  useEffect(() => {
    if (playId == null) return
    let cancel = false
    setLoading(true); setPlaying(false)
    getJson<PlayData>(`api/plays/${playId}`)
      .then((d) => { if (!cancel) { setPlay(d); setI(0); setError(null) } })
      .catch((e) => !cancel && fail(e))
      .finally(() => !cancel && setLoading(false))
    return () => { cancel = true }
  }, [playId])

  const n = play?.frames.length ?? 0
  const fps = play?.fps ?? 10

  useEffect(() => {
    if (!playing || n === 0) return
    const t = setInterval(() => {
      setI((x) => { if (x >= n - 1) { setPlaying(false); return x } return x + 1 })
    }, 1000 / (fps * speed))
    return () => clearInterval(t)
  }, [playing, speed, n, fps])

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

  const series = useMemo(() => {
    if (!play) return []
    return play.frames
      .filter((f) => f.pressure != null && f.f >= play.snapFrame)
      .map((f) => ({ t: +((f.f - play.snapFrame) / play.fps).toFixed(1), score: f.pressure }))
  }, [play])

  const h = play?.header
  const nowT = play && frame ? (frame.f - play.snapFrame) / play.fps : 0
  const card = 'rounded-xl border border-slate-800 bg-slate-900/70 shadow-lg shadow-black/30'

  const Team = ({ abbr, score, right }: { abbr: string; score: number; right?: boolean }) => {
    const att = h?.offense === abbr
    const badge = (
      <div className={`flex h-14 w-20 items-center justify-center rounded-lg text-2xl font-black tracking-widest ${att ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-orange-500 text-white'}`}>{abbr}</div>
    )
    const pts = <div className="flex h-14 w-16 items-center justify-center rounded-lg bg-black text-4xl font-black tabular-nums text-white">{score}</div>
    return (
      <div className={`flex items-center gap-3 ${right ? 'flex-row-reverse' : ''}`}>
        {badge}{pts}
        <span className="hidden text-xs font-semibold uppercase tracking-wider text-slate-400 sm:block">{att ? '🏈 Ataca' : 'Defiende'}</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#090d16] px-4 py-5 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        {error && <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm">Error: {error}</div>}

        {/* marcador TV */}
        {h && (
          <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-900 to-[#0b1220] px-6 py-4 shadow-xl shadow-black/40">
            <Team abbr={h.visitor} score={h.visitorScore} />
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-1.5 text-lg font-black text-slate-900">
                <span>Q{h.quarter}</span><span className="opacity-40">|</span><span>{h.downLabel} &amp; {h.yardsToGo}</span>
              </div>
              <div className="mt-1.5 text-sm font-medium text-slate-300">⏱ {h.clock} · Formación {h.formation ?? '—'}</div>
            </div>
            <Team abbr={h.home} score={h.homeScore} right />
          </header>
        )}

        {/* barra de selección */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-extrabold tracking-tight">🏈 NFL Broadcast Co-Pilot</h1>
            {game && <p className="text-xs text-slate-500">Partido {game.gameId} · Semana {game.week} · {game.date}</p>}
          </div>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Jugada destacada
            <select className="mt-1 block max-w-[34rem] rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-sm normal-case text-white" value={playId ?? ''} onChange={(e) => setPlayId(Number(e.target.value))}>
              {plays.map((p) => <option key={p.playId} value={p.playId}>{p.label}</option>)}
            </select>
          </label>
        </div>

        {/* banner de bienvenida */}
        {showWelcome && (
          <div className="flex items-start gap-4 rounded-xl border border-sky-800 bg-gradient-to-r from-sky-950 to-slate-900 p-4 shadow-lg shadow-black/30">
            <div className="text-3xl">👋</div>
            <div className="flex-1">
              <div className="mb-1 font-bold text-sky-200">¿Qué hace esta herramienta?</div>
              <p className="text-sm leading-relaxed text-slate-200">
                Bienvenido a <b>NFL Broadcast Co-Pilot</b>: traducimos los datos del campo en tiempo real para que entiendas qué pasa en cada jugada.
                Observa cómo se cierra la presión sobre el mariscal (medidor), quién logra desmarcarse (halos verdes) y lee la explicación lista para narrar.
              </p>
            </div>
            <button className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Cerrar bienvenida"
              onClick={() => { setShowWelcome(false); try { localStorage.setItem('copilot-welcome', 'off') } catch { /* sin almacenamiento */ } }}>✕</button>
          </div>
        )}

        {play && frame ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <main className={`space-y-5 ${loading ? 'opacity-60' : ''}`}>
              <div className={`${card} p-3`}>
                <Field play={play} frame={frame} hovered={hovered} onHover={setHovered} />
                <p className="mt-3 px-1 text-xs leading-relaxed text-slate-400">
                  <span className="text-blue-400">●</span> Ofensiva · <span className="text-orange-400">●</span> Defensiva · <span className="text-yellow-400">●</span> Balón ·
                  <span className="text-green-400"> ◎ halo verde = receptor ABIERTO</span> (≥ {play.thresholds.open} yardas del defensor más cercano). El número bajo cada receptor es su espacio en yardas. Pasa el cursor sobre un jugador para ver su nombre y velocidad.
                </p>
              </div>

              <div className={`${card} p-4`}>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="rounded-lg bg-slate-800 px-3 py-2 hover:bg-slate-700" onClick={() => { setPlaying(false); setI(0) }} aria-label="Inicio">⏮</button>
                  <button className="rounded-lg bg-slate-800 px-3 py-2 hover:bg-slate-700" onClick={() => { setPlaying(false); setI((x) => Math.max(0, x - 1)) }} aria-label="Frame anterior">◀</button>
                  <button className="whitespace-nowrap rounded-lg bg-sky-600 px-4 py-2 font-bold hover:bg-sky-500" onClick={toggle}>{playing ? '⏸ Pausa' : '▶ Reproducir'}</button>
                  <button className="rounded-lg bg-slate-800 px-3 py-2 hover:bg-slate-700" onClick={() => { setPlaying(false); setI((x) => Math.min(n - 1, x + 1)) }} aria-label="Frame siguiente">▶</button>
                  <select className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Velocidad">
                    {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                  </select>
                  <span className="ml-auto text-sm tabular-nums text-slate-400">
                    frame {frame.f} · {nowT.toFixed(1)} s desde el snap
                    {frame.events.length > 0 && <b className="ml-2 text-sky-300">{frame.events.join(', ')}</b>}
                  </span>
                </div>
                <input type="range" className="mt-4 w-full accent-sky-500" min={0} max={n - 1} value={i}
                  onChange={(e) => { setPlaying(false); setI(Number(e.target.value)) }} aria-label="Línea de tiempo" />
                <p className="mt-1 text-xs text-slate-600">Atajos: espacio = reproducir/pausa · ← → = frame a frame</p>
              </div>

              <div className={`${card} p-4`}>
                <div className="mb-2 font-semibold">Presión sobre el mariscal durante la jugada</div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} stroke="#64748b" unit=" s" />
                      <YAxis domain={[0, 100]} stroke="#64748b" unit="%" />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #475569' }} formatter={(v) => [`${v}%`, 'Presión']} labelFormatter={(l) => `${l} s desde el snap`} />
                      <Area type="monotone" dataKey="score" stroke="#ef4444" fill="rgba(239,68,68,0.3)" isAnimationActive={false} />
                      {play.releaseFrame != null && <ReferenceLine x={+((play.releaseFrame - play.snapFrame) / play.fps).toFixed(1)} stroke="#fff" strokeDasharray="4 3" label={{ value: 'pase', fill: '#fff', fontSize: 11, position: 'top' }} />}
                      <ReferenceLine x={+nowT.toFixed(1)} stroke="#38bdf8" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <section className={`${card} p-5`}>
                <h3 className="mb-3 text-lg font-bold">🎬 Análisis sencillo de la repetición</h3>
                <ul className="space-y-2.5">
                  {play.replay.map((r) => (
                    <li key={r} className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-[15px] leading-snug text-slate-200">{r}</li>
                  ))}
                </ul>
              </section>
            </main>

            <aside className="space-y-4 text-sm">
              <h2 className="text-lg font-bold">🎙️ Panel del Comentarista</h2>
              <section className={`${card} p-4`}>
                <div className="mb-1 font-semibold">Índice de Presión en la Bolsa</div>
                <Gauge value={play.gauge.value} />
                <p className="text-xs text-slate-400">
                  Valor {play.gauge.when}. Ahora mismo: <b className="text-white">{frame.pressure != null ? `${frame.pressure.toFixed(0)}%` : '—'}</b>
                </p>
              </section>

              <div className="rounded-xl border border-sky-900 border-l-4 border-l-sky-400 bg-[#0f2a4a] p-4 leading-snug text-white shadow-lg shadow-black/30">
                🛡️ <b>{play.coverage.name ?? 'Sin cobertura'}</b>: {play.coverage.text}
              </div>

              {play.alerts.map((a) => (
                <div key={a} role="alert" className="rounded-xl border border-red-900 border-l-4 border-l-red-500 bg-[#4a0f0f] p-4 font-medium leading-snug text-white shadow-lg shadow-black/30">{a}</div>
              ))}

              <div className="pt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Puntos clave para narrar al público</div>
              {play.keyPoints.map((k) => (
                <div key={k} className="rounded-xl border border-green-900 border-l-4 border-l-green-500 bg-[#10301f] p-4 leading-snug text-white shadow-lg shadow-black/30">{k}</div>
              ))}

              <section className="rounded-xl border-2 border-amber-400/80 bg-black p-4 shadow-[0_0_18px_rgba(251,191,36,0.25)]">
                <div className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-300">🎙️ Narración sugerida para el comentarista</div>
                <p className="font-serif text-lg leading-relaxed text-amber-50">{play.narration}</p>
              </section>

              <details className={`${card} p-4 text-xs text-slate-300`}>
                <summary className="cursor-pointer font-semibold">Narración oficial</summary>
                <p className="mt-2">{play.description}</p>
              </details>

              <details className={`${card} p-4 text-xs text-slate-400`}>
                <summary className="cursor-pointer font-semibold text-slate-300">ℹ️ ¿Cómo se calculan estas métricas?</summary>
                <p className="mt-2"><b>Índice de Presión en la Bolsa:</b> en cada frame se mide la distancia del QB al pass rusher más cercano; ≤ {play.thresholds.pressureFull} yd = 100% y ≥ {play.thresholds.pressureZero} yd = 0%, con escala lineal entre ambos.</p>
                <p className="mt-1"><b>Ventana de Separación:</b> distancia de cada receptor al defensor de cobertura más cercano; con {play.thresholds.open} yd o más se marca ABIERTO (halo verde).</p>
              </details>
            </aside>
          </div>
        ) : (
          <p className="text-slate-400">{loading ? 'Cargando jugada…' : 'Selecciona una jugada.'}</p>
        )}
      </div>
    </div>
  )
}
