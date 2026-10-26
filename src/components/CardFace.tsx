// A collectible card: rarity frame, a coloured field with the card's emblem, and its name.
import { Link } from 'react-router-dom'
import { cardById, type CardMeta } from '../lib/cards'
import { Ru } from './Md'

const FRAME: Record<string, string> = { common: '#8a6a3a', rare: '#2f6db3', epic: '#7b3fa6', legendary: '#d3a21c' }

export function CardFace({ card, owned = true, size = 'sm' }: { card: CardMeta; owned?: boolean; size?: 'sm' | 'lg' }) {
  const frame = FRAME[card.rarity]
  const big = size === 'lg'
  if (!owned)
    return (
      <div className={`flex aspect-[5/7] flex-col items-center justify-center rounded-xl border-4 border-dashed bg-paper-2 ${big ? 'w-56' : 'w-full'}`} style={{ borderColor: frame }}>
        <span className={`${big ? 'text-6xl' : 'text-3xl'} text-line`}>?</span>
        <span className="text-[0.6rem] uppercase tracking-wide text-ink-soft">{card.rarity}</span>
      </div>
    )
  return (
    <div
      className={`relative flex aspect-[5/7] flex-col overflow-hidden rounded-xl border-4 shadow-md ${big ? 'w-56' : 'w-full'} ${card.rarity === 'legendary' ? 'golden-card' : ''}`}
      style={{ borderColor: frame, background: `linear-gradient(160deg, hsl(${card.art.hue} 55% 88%), hsl(${card.art.hue} 45% 70%))` }}
    >
      <div className={`flex flex-1 items-center justify-center ${big ? 'text-7xl' : 'text-4xl'}`} aria-hidden="true">
        {card.art.icon}
      </div>
      <div className="bg-paper/85 px-1 py-1 text-center leading-tight">
        <Ru className={`block font-serif ${big ? 'text-xl' : 'text-xs'}`}>{card.name.ru}</Ru>
        {big && <span className="text-sm text-ink-soft">{card.name.en}</span>}
      </div>
      <span className="absolute right-1 top-1 rounded px-1 text-[0.55rem] font-bold uppercase text-paper" style={{ background: frame }}>
        {card.rarity}
      </span>
    </div>
  )
}

/** "You found a card" for milestone rewards. */
export function NewCard({ id }: { id: string }) {
  const found = cardById(id)
  if (!found) return null
  return (
    <Link to={`/card/${id}`} className="anim-pop mx-auto mt-3 flex max-w-xs items-center gap-3 rounded-xl border-2 border-gold bg-paper p-2 text-left">
      <div className="w-14 shrink-0">
        <CardFace card={found.card} />
      </div>
      <span>
        <span className="block text-xs font-bold uppercase text-gold">New card</span>
        <span className="block font-bold">{found.card.name.en}</span>
        <span className="text-xs text-ink-soft">Tap to read it</span>
      </span>
    </Link>
  )
}
