import { useState } from 'react'
import { haptic } from '../audio/haptics'
import { sound } from '../audio/sound'
import { SKINS, TIER_RU, TIERS, type Loot, type Tier } from '../rewards/chest'
import { cardById } from '../lib/cards'
import { xpForLevel } from '../rewards/levels'
import type { SessionEnd } from '../rewards/service'
import { Ru } from './Md'
import { Bar, Button, Card, CountUp, Icon } from './ui'

const TIER_COLOR: Record<Tier, string> = { common: '#8a6a3a', rare: '#2f6db3', epic: '#7b3fa6', legendary: '#d3a21c' }

function lootText(l: Loot): string {
  switch (l.kind) {
    case 'xp':
      return `+${l.amount} XP`
    case 'freeze':
      return 'Streak freeze ❄'
    case 'boost':
      return `×${l.mult} XP for ${l.minutes} minutes`
    case 'skin': {
      const s = SKINS.find((x) => x.id === l.skin)
      return `New theme: ${s?.en ?? l.skin}`
    }
    case 'card':
      return `New card: ${cardById(l.card)?.card.name.en ?? l.card} 🃏`
  }
}

export function Chest({ tier, loot }: { tier: Tier; loot: Loot[] }) {
  const [open, setOpen] = useState(false)
  const color = TIER_COLOR[tier]
  const doOpen = () => {
    if (open) return
    setOpen(true)
    sound.chest(TIERS.indexOf(tier))
    if (tier === 'epic' || tier === 'legendary') haptic.big()
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={doOpen} className={open ? '' : 'anim-wobble'} aria-label={open ? 'Chest opened' : 'Open the chest'}>
        <svg viewBox="0 0 120 100" className="h-32 w-36" aria-hidden="true">
          <g style={{ transformOrigin: '10px 40px', transform: open ? 'rotate(-28deg) translateY(-6px)' : 'none', transition: 'transform 0.4s' }}>
            <path d="M10 40 Q60 0 110 40 Z" fill={color} stroke="#2a1d0f" strokeWidth="3" />
            <rect x="52" y="22" width="16" height="18" fill="#e8c766" stroke="#2a1d0f" strokeWidth="2" />
          </g>
          {open && <circle cx="60" cy="45" r="30" fill="#f6d77a" opacity="0.55" className="anim-pop" />}
          <rect x="10" y="40" width="100" height="52" rx="4" fill={color} stroke="#2a1d0f" strokeWidth="3" />
          <rect x="10" y="58" width="100" height="6" fill="#2a1d0f" opacity="0.35" />
          <rect x="52" y="44" width="16" height="16" rx="2" fill="#e8c766" stroke="#2a1d0f" strokeWidth="2" />
        </svg>
      </button>
      <p className="font-bold" style={{ color }}>
        <Ru>{`${TIER_RU[tier]} сунду́к`}</Ru> <span className="text-sm font-normal text-ink-soft">· {tier}</span>
      </p>
      {open ? (
        <ul className="space-y-1 text-center">
          {loot.map((l, i) => (
            <li key={i} className="anim-pop font-bold" style={{ animationDelay: `${i * 120}ms` }}>
              {lootText(l)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">Tap to open</p>
      )}
    </div>
  )
}

export function SessionSummary({ end, onDone, onAgain }: { end: SessionEnd; onDone: () => void; onAgain?: () => void }) {
  const { levelBefore: lb, levelAfter: la } = end
  const toNext = xpForLevel(la.level + 1) - xpForLevel(la.level) - la.into
  const teaser = la.nextRank
    ? `Level ${la.nextRank.minLevel} makes you ${la.nextRank.ru} (${la.nextRank.en}). ${toNext.toLocaleString('en')} XP to level ${la.level + 1}.`
    : `${toNext.toLocaleString('en')} XP to level ${la.level + 1}.`
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-center font-serif text-3xl">
        <Ru>Гото́во!</Ru> <span className="text-ink-soft">Session complete</span>
      </h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['XP', <CountUp key="x" value={end.xp} />],
          ['Accuracy', <CountUp key="a" value={Math.round(end.accuracy * 100)} format={(n) => `${n}%`} />],
          ['Best combo', <CountUp key="c" value={end.bestCombo} />],
          ['Answered', <CountUp key="n" value={end.answered} />],
        ].map(([label, v]) => (
          <Card key={label as string} className="anim-rise text-center">
            <div className="text-2xl font-bold text-red">{v}</div>
            <div className="text-xs text-ink-soft">{label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <span>
            Level <b>{la.level}</b> · <Ru>{la.rank.ru}</Ru>
          </span>
          {la.level > lb.level && <span className="anim-pop font-bold text-gold">Level up!</span>}
        </div>
        <Bar value={la.progress} className="mt-2" />
        <p className="mt-2 text-sm text-ink-soft">{teaser}</p>
      </Card>

      <Card className="flex items-center gap-3">
        <Icon name="flame" filled className="h-8 w-8 text-red" />
        <div>
          <div className="font-bold">{end.streak.current}-day streak{end.streak.extended ? ' (+1)' : ''}</div>
          <div className="text-sm text-ink-soft">
            {end.streak.usedFreezes ? `A streak freeze covered ${end.streak.usedFreezes} missed day(s). ` : ''}
            {end.streak.earnedFreeze ? 'You earned a streak freeze for a full week. ' : ''}
            {!end.streak.extended && end.answered < 5 ? 'Answer at least 5 items in a session to count for the streak.' : ''}
          </div>
        </div>
      </Card>

      {end.chest ? (
        <Card className="py-6">
          <Chest tier={end.chest.tier} loot={end.chest.loot} />
        </Card>
      ) : (
        <p className="text-center text-sm text-ink-soft">Answer 8 or more items in a session to earn a chest.</p>
      )}

      {end.sets?.map((t) => (
        <Card key={t} className="anim-pop border-gold text-center font-bold">
          Card set complete: {t}! Bonus XP added.
        </Card>
      ))}

      {(end.achievements.length > 0 || end.quests.length > 0) && (
        <Card className="space-y-2">
          {end.achievements.map((a) => (
            <div key={a.id} className="anim-rise flex items-center gap-2">
              <Icon name="trophy" className="h-5 w-5 text-gold" />
              <Ru className="font-bold">{a.ru}</Ru>
              <span className="text-sm text-ink-soft">{a.en} · +{a.xp} XP</span>
            </div>
          ))}
          {end.quests.map((q) => (
            <div key={q.id} className="anim-rise flex items-center gap-2">
              <Icon name="check" className="h-5 w-5 text-good" />
              <span>{q.text}</span>
              <span className="text-sm text-ink-soft">+{q.xp} XP</span>
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onDone}>
          Home
        </Button>
        {onAgain && <Button onClick={onAgain}>Another session</Button>}
      </div>
    </div>
  )
}
