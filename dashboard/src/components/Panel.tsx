import type { Frame, Play } from '../types'

const SEP_BADGE = { g: 'bg-green-500', y: 'bg-yellow-500', r: 'bg-red-500' } as const
const ORD = ['', '1ª', '2ª', '3ª', '4ª']

export default function Panel({ play, frame }: { play: Play; frame: Frame }) {
  const c = play.context
  const rows = [...frame.edges].sort((a, b) => b.sep - a.sep)
  return (
    <aside className="flex flex-col gap-3 text-sm">
      <h2 className="text-lg font-bold text-white">Apoyo al Comentarista</h2>

      <section className={`rounded-lg border p-3 ${frame.key ? 'border-red-500 bg-red-950/60' : 'border-sky-500 bg-sky-950/60'}`}>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-300">En este momento</div>
        <p className="text-base leading-snug text-white" aria-live="polite">{frame.say}</p>
      </section>

      <section className="rounded-lg bg-slate-800 p-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Item k="Down" v={c.down != null ? `${ORD[c.down] ?? c.down} y ${c.yardsToGo}` : '—'} />
          <Item k="Yardas por avanzar" v={c.yardsToGo != null ? String(c.yardsToGo) : '—'} />
          <Item k="Cuarto / reloj" v={`Q${c.quarter} · ${c.clock}`} />
          <Item k="Formación" v={c.formation ?? '—'} />
          <Item k="Cobertura (pff_passCoverage)" v={c.coverage ? `${c.coverage}${c.coverageType ? ` · ${c.coverageType}` : ''}` : '—'} />
          <Item k="Resultado (passResult)" v={c.passResult ? `${c.passResult} · ${c.passResultText.split(' (')[0]}` : '—'} />
        </div>
      </section>

      <section className="rounded-lg bg-slate-800 p-3 text-gray-200">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Para nuevos fans</div>
        <p className="mb-2">{c.downExplain}</p>
        {c.coverageExplain && <p className="mb-2"><b>{c.coverage}:</b> {c.coverageExplain}</p>}
        <p>{c.summary}</p>
      </section>

      <section className="rounded-lg bg-slate-800 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Separación de receptores (yd)</div>
        {rows.length === 0 ? (
          <p className="text-gray-400">El QB aún no tiene el balón o no hay rutas activas.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((e) => {
              const p = play.players[e.to]
              return (
                <li key={e.to} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${SEP_BADGE[e.c]}`} />
                  <span className="flex-1 truncate text-gray-200">{p.name}</span>
                  <span className="tabular-nums text-white">{e.sep.toFixed(1)}</span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Verde ≥ {play.thresholds.open} yd (libre) · Amarillo {play.thresholds.tight}–{play.thresholds.open} yd · Rojo &lt; {play.thresholds.tight} yd (cubierto).
          La línea punteada une al receptor con su defensor más cercano.
        </p>
      </section>

      <section className="rounded-lg bg-slate-800 p-3 text-xs text-gray-300">
        <div className="mb-1 font-semibold uppercase tracking-wide text-gray-400">Narración oficial</div>
        {c.description}
      </section>
    </aside>
  )
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{k}</div>
      <div className="font-semibold text-white">{v}</div>
    </div>
  )
}
