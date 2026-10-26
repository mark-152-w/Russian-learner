// Moment-to-moment feedback: particle bursts, floating XP, combo meter, screen-edge pulse,
// toasts and skippable celebrations. All of it degrades to static output under reduced motion.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { comboToNext } from '../rewards/xp'

interface Burst {
  id: number
  x: number
  y: number
  color: string
  count: number
}
interface Toast {
  id: number
  title: string
  body?: string
  tone: 'gold' | 'red'
}

interface JuiceApi {
  burst: (el: Element | null, opts?: { color?: string; count?: number }) => void
  toast: (t: Omit<Toast, 'id'>) => void
}
const JuiceCtx = createContext<JuiceApi>({ burst: () => {}, toast: () => {} })
export const useJuice = () => useContext(JuiceCtx)

let seq = 0

export function JuiceLayer({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<Burst[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])

  const burst = useCallback<JuiceApi['burst']>((el, opts = {}) => {
    if (!el || document.documentElement.dataset.motion === 'reduce') return
    const r = el.getBoundingClientRect()
    const b = { id: ++seq, x: r.left + r.width / 2, y: r.top + r.height / 2, color: opts.color ?? 'var(--red)', count: opts.count ?? 14 }
    setBursts((xs) => [...xs, b])
    setTimeout(() => setBursts((xs) => xs.filter((x) => x.id !== b.id)), 800)
  }, [])

  const toast = useCallback<JuiceApi['toast']>((t) => {
    const item = { ...t, id: ++seq }
    setToasts((xs) => [...xs.slice(-2), item])
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== item.id)), 3200)
  }, [])

  return (
    <JuiceCtx.Provider value={{ burst, toast }}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-50" aria-hidden="true">
        {bursts.map((b) =>
          Array.from({ length: b.count }, (_, i) => {
            const angle = (i / b.count) * Math.PI * 2 + (b.id % 7)
            const dist = 40 + ((i * 37) % 50)
            return (
              <span
                key={`${b.id}-${i}`}
                className="absolute h-2 w-2 rounded-full"
                style={{
                  left: b.x, top: b.y, background: i % 3 ? b.color : 'var(--gold)',
                  ['--dx' as string]: `${Math.cos(angle) * dist}px`, ['--dy' as string]: `${Math.sin(angle) * dist}px`,
                  animation: 'particle 0.7s ease-out forwards',
                }}
              />
            )
          }),
        )}
      </div>
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`anim-rise pointer-events-auto max-w-sm rounded-xl border-2 bg-paper px-4 py-2 shadow-lg ${t.tone === 'gold' ? 'border-gold' : 'border-red'}`}>
            <div className="font-bold">{t.title}</div>
            {t.body && <div className="text-sm text-ink-soft">{t.body}</div>}
          </div>
        ))}
      </div>
    </JuiceCtx.Provider>
  )
}

/** Combo counter: colour shifts and glows as the multiplier climbs. */
export function ComboMeter({ combo, multiplier }: { combo: number; multiplier: number }) {
  const tone = multiplier >= 5 ? 'text-gold anim-glow' : multiplier >= 3 ? 'text-red' : multiplier >= 2 ? 'text-red-soft' : 'text-ink-soft'
  const next = comboToNext(combo)
  return (
    <div className={`flex items-baseline gap-1.5 ${tone}`} aria-label={`Combo ${combo}, multiplier ${multiplier}`}>
      <span key={multiplier} className="anim-pop text-xl font-bold">×{multiplier}</span>
      <span className="text-xs tabular-nums">
        {combo > 0 ? `${combo} in a row` : 'combo'}
        {next > 0 && combo > 0 ? ` · ${next} to ×${multiplier >= 3 ? 5 : multiplier >= 2 ? 3 : 2}` : ''}
      </span>
    </div>
  )
}

/** Gentle glow around the screen edge while the ×5 multiplier is active. */
export function EdgePulse({ active }: { active: boolean }) {
  if (!active) return null
  return <div className="edge-pulse pointer-events-none fixed inset-0 z-40" aria-hidden="true" />
}

/** "+12 XP" floating up from the answer. */
export function XpFloat({ amount, golden }: { amount: number; golden?: boolean }) {
  if (amount <= 0) return null
  return (
    <span className={`anim-float pointer-events-none absolute -top-2 right-3 font-bold ${golden ? 'text-gold' : 'text-red'}`} aria-live="polite">
      +{amount} XP
    </span>
  )
}

/**
 * Skippable overlay. Auto-dismisses after `ms` (≤ 2000 for ordinary rewards);
 * level-ups pass ms = 0 and wait for a tap.
 */
export function Celebration({ children, onDone, ms = 1800 }: { children: ReactNode; onDone: () => void; ms?: number }) {
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (!ms) return
    const t = setTimeout(() => done.current(), ms)
    return () => clearTimeout(t)
  }, [ms])
  useEffect(() => {
    const k = (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') && done.current()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return (
    <button
      type="button"
      onClick={() => done.current()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
      aria-label="Continue"
    >
      <div className="anim-pop max-w-sm rounded-2xl border-2 border-gold bg-paper p-6 text-center shadow-2xl">{children}</div>
    </button>
  )
}
