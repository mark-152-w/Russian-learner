import { useState } from 'react'
import { recallAt, type CurveReport } from '../srs/memory'

const W = 320
const H = 170
const PAD = { l: 34, r: 56, t: 10, b: 24 }
const pct = (r: number) => `${Math.round(r * 100)}%`

/**
 * The learner's forgetting curve (red) against FSRS's average learner (grey context line), for a typical learned
 * card, with their actual recall as dots. Emphasis, not two categorical series: both lines are labelled at their
 * ends and in the legend, so neither is told apart by colour alone. Hover or tap reads both curves at a day.
 */
export function ForgettingCurve({ report }: { report: CurveReport }) {
  const { k, sRef, days, bins } = report
  const [hover, setHover] = useState<number | null>(null)
  // the floor fits the data (lines encode position, so it needn't be 0), rounded down to a 10% step
  const low = Math.min(recallAt(days, sRef), recallAt(days, k * sRef), ...bins.map((b) => b[1]))
  const Y0 = Math.min(0.8, Math.max(0, Math.floor((low - 0.03) * 10) / 10))
  const grid = Array.from({ length: Math.round((1 - Y0) / 0.1) }, (_, i) => Math.round((Y0 + 0.1 * i) * 10) / 10)
  const x = (t: number) => PAD.l + (t / days) * (W - PAD.l - PAD.r)
  const y = (r: number) => PAD.t + ((1 - r) / (1 - Y0)) * (H - PAD.t - PAD.b)
  const path = (s: number) =>
    Array.from({ length: 61 }, (_, i) => (i / 60) * days)
      .map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(Math.max(Y0, recallAt(t, s))).toFixed(1)}`)
      .join('')
  const day = hover ?? Math.round(sRef * Math.max(1, k))
  const you = recallAt(day, k * sRef)
  const avg = recallAt(day, sRef)
  const pick = (clientX: number, el: SVGSVGElement) => {
    const box = el.getBoundingClientRect()
    const t = (((clientX - box.left) / box.width) * W - PAD.l) / (W - PAD.l - PAD.r)
    setHover(Math.max(0, Math.min(days, Math.round(t * days))))
  }
  const ticks = [0, days / 2, days]
  // end labels: kept at least a line apart when the two curves end close together
  let [labelYou, labelAvg] = [y(recallAt(days, k * sRef)) + 3, y(recallAt(days, sRef)) + 3]
  if (Math.abs(labelYou - labelAvg) < 11) {
    if (labelYou <= labelAvg) labelAvg = labelYou + 11
    else labelYou = labelAvg + 11
  }
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 text-sm" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-red" /> You
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-ink-soft" /> Average learner (FSRS default)
        </span>
        {bins.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red" /> Your actual recall
          </span>
        )}
      </div>
      <p className="h-5 text-sm text-ink-soft" aria-live="polite">
        After {day} day{day === 1 ? '' : 's'}: <b className="text-ink">you {pct(you)}</b> · average {pct(avg)}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full touch-none select-none"
        role="img"
        aria-label={`Chance of recalling a typical learned word over ${days} days: yours and the average learner's`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
      >
        {grid.map((r) => (
          <g key={r}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(r)} y2={y(r)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 4} y={y(r) + 3} textAnchor="end" fontSize="9" fill="var(--ink-soft)">
              {pct(r)}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--line)" strokeWidth="1" />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - PAD.b + 13} textAnchor={t === 0 ? 'start' : t === days ? 'end' : 'middle'} fontSize="9" fill="var(--ink-soft)">
            {t === 0 ? 'day 0' : t === days ? `${days} days` : `${Math.round(t)}`}
          </text>
        ))}
        <path d={path(sRef)} fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" />
        <path d={path(k * sRef)} fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" />
        <text x={W - PAD.r + 4} y={labelYou} fontSize="9" fill="var(--ink)">
          You
        </text>
        <text x={W - PAD.r + 4} y={labelAvg} fontSize="9" fill="var(--ink-soft)">
          Average
        </text>
        {bins.map(([t, share, n]) => (
          <circle key={t} cx={x(t)} cy={y(Math.max(Y0, share))} r="4" fill="var(--red)" stroke="var(--paper-2)" strokeWidth="2">
            <title>{`About day ${Math.round(t)}: ${pct(share)} of ${n} reviews recalled`}</title>
          </circle>
        ))}
        <line x1={x(day)} x2={x(day)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-soft)" strokeWidth="1" opacity="0.6" />
        <circle cx={x(day)} cy={y(Math.max(Y0, you))} r="3.5" fill="var(--red)" />
        <circle cx={x(day)} cy={y(Math.max(Y0, avg))} r="3" fill="var(--ink-soft)" />
      </svg>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-ink-soft">As a table</summary>
        <table className="mt-1 w-full tabular-nums">
          <thead>
            <tr className="text-left text-ink-soft">
              <th scope="col" className="font-normal">After</th>
              <th scope="col" className="font-normal">You</th>
              <th scope="col" className="font-normal">Average learner</th>
            </tr>
          </thead>
          <tbody>
            {[1, 7, 30, 90].filter((d) => d <= days).map((d) => (
              <tr key={d}>
                <th scope="row" className="text-left font-normal">
                  {d} day{d === 1 ? '' : 's'}
                </th>
                <td>{pct(recallAt(d, k * sRef))}</td>
                <td>{pct(recallAt(d, sRef))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
