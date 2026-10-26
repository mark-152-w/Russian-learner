// Small diagrams shown with feedback and in the trainers: aspect timelines and motion-prefix paths.
// Motion is CSS only (offset-path / dash offset), so the reduced-motion setting stills it; the static
// picture always shows where the path ends.
import type { ExerciseItem } from '../types/content.gen'

type Timeline = NonNullable<NonNullable<ExerciseItem['visual']>['timeline']>
type Motion = NonNullable<NonNullable<ExerciseItem['visual']>['motion']>

const TIMELINE_CAPTION: Record<Timeline, string> = {
  process: 'in progress: the action as an ongoing process',
  result: 'completed: the action reached its result',
  repeated: 'repeated: again and again, or habitually',
  single: 'one complete action, a single point',
  sequence: 'a chain: one action finished, then the next',
  simultaneous: 'two processes running at the same time',
  duration: 'how long it went on (a span, no endpoint)',
  fact: 'did it happen at all? (a bare fact)',
  annulled: 'there and back: the result no longer holds',
  request: 'one concrete request: do it (perfective)',
  prohibition: "don't do it: negated imperfective",
  warning: "careful not to (by accident): negated perfective",
  ability: "couldn't manage it: no result",
}

const axis = <line x1="8" y1="44" x2="232" y2="44" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" markerEnd="url(#v-arrow)" />
const wave = (x1: number, x2: number, y = 30, cls = 'v-flow') => {
  let d = `M${x1} ${y}`
  for (let x = x1; x < x2; x += 16) d += ` q4 -8 8 0 t8 0`
  return <path d={d} fill="none" stroke="var(--red)" strokeWidth="3" strokeLinecap="round" className={cls} />
}
const dot = (x: number, y = 30, r = 6) => <circle cx={x} cy={y} r={r} fill="var(--red)" className="v-pop" />

function TimelineArt({ kind }: { kind: Timeline }) {
  switch (kind) {
    case 'process':
      return wave(40, 200)
    case 'duration':
      return (
        <>
          {wave(52, 188)}
          <path d="M48 16v28M192 16v28" stroke="currentColor" strokeOpacity=".6" strokeWidth="2" />
        </>
      )
    case 'result':
      return (
        <>
          <line x1="40" y1="30" x2="176" y2="30" stroke="var(--red)" strokeWidth="3" className="v-draw" />
          <circle cx="184" cy="30" r="9" fill="var(--good)" className="v-pop" />
          <path d="M179 30l4 4 7-8" fill="none" stroke="var(--paper)" strokeWidth="2.5" />
        </>
      )
    case 'single':
      return dot(120, 30, 8)
    case 'repeated':
      return <>{[50, 80, 110, 140, 170, 200].map((x) => <line key={x} x1={x} y1="20" x2={x} y2="40" stroke="var(--red)" strokeWidth="3" strokeLinecap="round" />)}</>
    case 'sequence':
      return (
        <>
          {[60, 120, 180].map((x, i) => (
            <g key={x}>
              {dot(x)}
              <text x={x} y="34" textAnchor="middle" fontSize="9" fill="var(--paper)" fontWeight="bold">
                {i + 1}
              </text>
            </g>
          ))}
          <path d="M70 30h38M130 30h38" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" markerEnd="url(#v-arrow)" />
        </>
      )
    case 'simultaneous':
      return (
        <>
          {wave(40, 200, 22)}
          {wave(40, 200, 36)}
        </>
      )
    case 'fact':
      return (
        <>
          {dot(120, 30, 9)}
          <text x="120" y="34" textAnchor="middle" fontSize="12" fill="var(--paper)" fontWeight="bold">
            ?
          </text>
        </>
      )
    case 'annulled':
      return (
        <>
          <path d="M50 34h120" stroke="var(--red)" strokeWidth="3" markerEnd="url(#v-arrow-red)" />
          <path d="M175 22H60" stroke="var(--red)" strokeOpacity=".55" strokeWidth="3" strokeDasharray="6 4" markerEnd="url(#v-arrow-red)" />
        </>
      )
    case 'request':
      return (
        <>
          {dot(120, 30, 10)}
          <text x="120" y="35" textAnchor="middle" fontSize="14" fill="var(--paper)" fontWeight="bold">
            !
          </text>
        </>
      )
    case 'prohibition':
      return (
        <>
          {wave(40, 200)}
          <line x1="70" y1="12" x2="170" y2="46" stroke="currentColor" strokeWidth="3" />
        </>
      )
    case 'warning':
      return (
        <>
          <path d="M120 14l14 26h-28z" fill="var(--gold)" className="v-pop" />
          <text x="120" y="37" textAnchor="middle" fontSize="13" fill="var(--paper)" fontWeight="bold">
            !
          </text>
        </>
      )
    case 'ability':
      return (
        <>
          <line x1="40" y1="30" x2="150" y2="30" stroke="var(--red)" strokeWidth="3" strokeDasharray="8 5" />
          <circle cx="184" cy="30" r="9" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" strokeDasharray="3 3" />
        </>
      )
  }
}

const Defs = () => (
  <defs>
    <marker id="v-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0L10 5L0 10z" fill="currentColor" fillOpacity=".5" />
    </marker>
    <marker id="v-arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0 0L10 5L0 10z" fill="var(--red)" />
    </marker>
  </defs>
)

export function TimelineVisual({ kind, caption = true }: { kind: Timeline; caption?: boolean }) {
  return (
    <figure className="text-ink">
      <svg viewBox="0 0 240 56" className="h-14 w-full max-w-xs" role="img" aria-label={TIMELINE_CAPTION[kind]}>
        <Defs />
        {axis}
        <TimelineArt kind={kind} />
      </svg>
      {caption && <figcaption className="text-xs text-ink-soft">{TIMELINE_CAPTION[kind]}</figcaption>}
    </figure>
  )
}

// ------------------------------------------------------------------ motion
interface MotionArt {
  path: string
  caption: string
  scene: 'house' | 'river' | 'post' | 'hill' | 'centre' | 'none'
  /** Several walkers (раз-: they disperse). */
  paths?: string[]
}
export const MOTION: Record<Motion, MotionArt> = {
  при: { path: 'M14 60 H150', scene: 'house', caption: 'при-: arrive, come (and be here)' },
  у: { path: 'M150 60 H232', scene: 'house', caption: 'у-: leave, go away (and be gone)' },
  в: { path: 'M70 60 H170', scene: 'house', caption: 'в(о)-: go in, enter' },
  вы: { path: 'M170 60 H70 V60 H20', scene: 'house', caption: 'вы-: go out, exit' },
  под: { path: 'M14 60 H120', scene: 'post', caption: 'под(о)-: approach, come up to' },
  от: { path: 'M128 60 H210', scene: 'post', caption: 'от(о)-: move away from' },
  до: { path: 'M14 60 H140', scene: 'post', caption: 'до-: reach, get as far as' },
  пере: { path: 'M20 60 H220', scene: 'river', caption: 'пере-: cross, go across' },
  про: { path: 'M14 70 H226', scene: 'post', caption: 'про-: go past, go through' },
  за: { path: 'M14 70 H100 C120 70 130 52 150 52 C170 52 180 70 200 70 H226', scene: 'house', caption: 'за-: drop in on the way' },
  об: { path: 'M30 60 C30 14 210 14 210 52 C210 84 40 84 40 60', scene: 'post', caption: 'об(о)-: go round' },
  с: { path: 'M70 22 L170 66', scene: 'hill', caption: 'с(о)-: come down, get off' },
  раз: { path: 'M120 46 L40 20', scene: 'centre', caption: 'раз(о)- with -ся: disperse, go separate ways', paths: ['M120 46 L40 20', 'M120 46 L200 20', 'M120 46 L40 72', 'M120 46 L200 72'] },
  uni: { path: 'M20 50 H220', scene: 'none', caption: 'идти́ / е́хать: one direction, right now or on the way' },
  multi: { path: 'M20 50 C60 10 80 90 120 50 S180 10 220 50 S170 90 120 50', scene: 'none', caption: 'ходи́ть / е́здить: back and forth, regularly, in general' },
  round: { path: 'M20 40 H210 C226 40 226 64 210 64 H20', scene: 'none', caption: 'ходи́л / е́здил: went and came back (a round trip)' },
}

function Scene({ kind }: { kind: MotionArt['scene'] }) {
  const ink = { stroke: 'currentColor', strokeOpacity: 0.55, strokeWidth: 2, fill: 'none' }
  switch (kind) {
    case 'house':
      return (
        <g {...ink}>
          <path d="M140 76V40l30-22 30 22v36z" />
          <rect x="150" y="54" width="14" height="22" fill="var(--paper-2)" />
        </g>
      )
    case 'river':
      return <rect x="90" y="30" width="60" height="50" fill="var(--line)" opacity=".7" />
    case 'post':
      return (
        <g {...ink}>
          <path d="M126 76V30" strokeWidth="3" />
          <path d="M126 30l18 6-18 6" fill="currentColor" fillOpacity=".3" />
        </g>
      )
    case 'hill':
      return <path d="M20 80 L70 30 L80 30 L200 80z" fill="var(--line)" opacity=".7" />
    case 'centre':
      return <circle cx="120" cy="46" r="10" {...ink} />
    case 'none':
      return null
  }
}

export function MotionVisual({ kind, caption = true }: { kind: Motion; caption?: boolean }) {
  const m = MOTION[kind]
  const paths = m.paths ?? [m.path]
  return (
    <figure className="text-ink">
      <svg viewBox="0 0 240 90" className="h-20 w-full max-w-xs" role="img" aria-label={m.caption}>
        <Defs />
        <Scene kind={m.scene} />
        {paths.map((p) => (
          <g key={p}>
            <path d={p} fill="none" stroke="var(--red)" strokeOpacity=".35" strokeWidth="2.5" strokeDasharray="5 5" markerEnd="url(#v-arrow-red)" />
            <circle r="7" fill="var(--red)" className="v-walk" style={{ offsetPath: `path('${p}')` }} />
          </g>
        ))}
      </svg>
      {caption && <figcaption className="text-xs text-ink-soft">{m.caption}</figcaption>}
    </figure>
  )
}

export function ItemVisual({ item }: { item: ExerciseItem }) {
  if (item.visual?.timeline) return <TimelineVisual kind={item.visual.timeline} />
  if (item.visual?.motion) return <MotionVisual kind={item.visual.motion} />
  return null
}
