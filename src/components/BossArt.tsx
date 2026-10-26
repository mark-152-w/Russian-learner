// Boss portraits for the 20 A2 units, drawn from a few shared parts (body, heads, eyes, extras) so each boss
// is a line of data rather than its own drawing.
type Part =
  | 'beard' | 'horns' | 'antlers' | 'crown' | 'scarf' | 'santa' | 'ears-pointy' | 'ears-round' | 'wings'
  | 'crest' | 'leaves' | 'snow' | 'nose' | 'grin' | 'helmet' | 'pattern' | 'hair' | 'fins' | 'cap'

interface Look {
  body: string
  face: string
  shape: 'blob' | 'square' | 'bird' | 'tall'
  eyes: 1 | 2
  heads?: 3
  parts: Part[]
}

const LOOKS: Record<string, Look> = {
  'boss-01': { body: '#8b5a2b', face: '#d9a066', shape: 'blob', eyes: 2, parts: ['beard', 'cap'] },
  'boss-02': { body: '#3f6b35', face: '#8fb36b', shape: 'tall', eyes: 2, parts: ['antlers', 'leaves', 'beard'] },
  'boss-03': { body: '#56664a', face: '#9aa889', shape: 'tall', eyes: 2, parts: ['hair', 'nose'] },
  'boss-04': { body: '#2d6a7a', face: '#7fb6b0', shape: 'blob', eyes: 2, parts: ['beard', 'fins', 'crown'] },
  'boss-05': { body: '#5b4a3f', face: '#c9a27e', shape: 'tall', eyes: 2, parts: ['scarf', 'nose', 'grin'] },
  'boss-06': { body: '#6b4e2e', face: '#d1a574', shape: 'blob', eyes: 2, parts: ['cap', 'grin', 'beard'] },
  'boss-07': { body: '#3a3542', face: '#cfcbbf', shape: 'tall', eyes: 2, parts: ['crown', 'grin'] },
  'boss-08': { body: '#3c7a3a', face: '#6fae54', shape: 'blob', eyes: 2, heads: 3, parts: ['wings', 'horns'] },
  'boss-09': { body: '#55524d', face: '#a29d94', shape: 'blob', eyes: 1, parts: ['grin', 'hair'] },
  'boss-10': { body: '#b23a2e', face: '#f1e4c8', shape: 'square', eyes: 2, parts: ['pattern', 'grin'] },
  'boss-11': { body: '#9ec3dc', face: '#eef5fa', shape: 'tall', eyes: 2, parts: ['snow', 'hair'] },
  'boss-12': { body: '#b3262a', face: '#f0c9a8', shape: 'blob', eyes: 2, parts: ['santa', 'beard'] },
  'boss-13': { body: '#e0731c', face: '#f6c344', shape: 'bird', eyes: 2, parts: ['wings', 'crest'] },
  'boss-14': { body: '#4f8d3a', face: '#8cc163', shape: 'blob', eyes: 2, parts: ['crown', 'grin'] },
  'boss-15': { body: '#6d6f73', face: '#a8abae', shape: 'blob', eyes: 2, parts: ['ears-pointy', 'nose', 'grin'] },
  'boss-16': { body: '#3d2f2a', face: '#b38f6e', shape: 'tall', eyes: 2, parts: ['scarf', 'nose', 'grin'] },
  'boss-17': { body: '#2f4a2c', face: '#7d9a5c', shape: 'tall', eyes: 2, parts: ['helmet', 'horns', 'grin'] },
  'boss-18': { body: '#221d29', face: '#bdb7a8', shape: 'tall', eyes: 2, parts: ['crown', 'grin', 'wings'] },
  'boss-19': { body: '#8a2f22', face: '#c2553a', shape: 'blob', eyes: 2, heads: 3, parts: ['wings', 'horns', 'crest'] },
  'boss-20': { body: '#6b4423', face: '#a8754a', shape: 'blob', eyes: 2, parts: ['ears-round', 'crown', 'nose'] },
  // B1
  'boss-21': { body: '#3b3b4f', face: '#8a8aa6', shape: 'blob', eyes: 2, parts: ['ears-pointy', 'grin', 'crown'] },
  'boss-22': { body: '#2e7f86', face: '#b9e0dc', shape: 'tall', eyes: 2, parts: ['hair', 'fins'] },
  'boss-23': { body: '#2b2433', face: '#9fb58a', shape: 'tall', eyes: 2, parts: ['cap', 'nose', 'grin', 'hair'] },
  'boss-24': { body: '#1f5f6b', face: '#4f9a8c', shape: 'blob', eyes: 2, heads: 3, parts: ['fins', 'horns'] },
  'boss-25': { body: '#3a1f2a', face: '#d8d0cf', shape: 'tall', eyes: 2, parts: ['grin', 'wings'] },
  'boss-26': { body: '#7a5a3a', face: '#c9a27e', shape: 'blob', eyes: 2, parts: ['beard', 'hair'] },
  'boss-27': { body: '#d9c27a', face: '#f3e6b8', shape: 'tall', eyes: 2, parts: ['hair', 'leaves'] },
  'boss-28': { body: '#1d1d1d', face: '#c7432f', shape: 'bird', eyes: 2, parts: ['crest', 'wings'] },
  'boss-29': { body: '#3f7a5a', face: '#b8d8c0', shape: 'tall', eyes: 2, parts: ['crown', 'hair'] },
  'boss-30': { body: '#5a2a1a', face: '#d39b7a', shape: 'blob', eyes: 2, parts: ['beard', 'cap', 'grin'] },
  'boss-31': { body: '#a9cde6', face: '#eef6fb', shape: 'tall', eyes: 2, parts: ['crown', 'snow'] },
  'boss-32': { body: '#2b2b2b', face: '#e1c3b0', shape: 'tall', eyes: 2, parts: ['cap', 'nose', 'grin'] },
  'boss-33': { body: '#3a2f22', face: '#c58b5a', shape: 'blob', eyes: 2, parts: ['beard', 'cap', 'grin'] },
  'boss-34': { body: '#6b3d1f', face: '#a8683a', shape: 'blob', eyes: 2, parts: ['horns', 'grin'] },
  'boss-35': { body: '#e8e4dc', face: '#f7f4ee', shape: 'square', eyes: 2, parts: ['grin', 'nose'] },
  'boss-36': { body: '#1f1a2b', face: '#cfc8b8', shape: 'tall', eyes: 2, parts: ['cap', 'grin'] },
  'boss-37': { body: '#2b2b2b', face: '#4a4a4a', shape: 'blob', eyes: 2, parts: ['ears-pointy', 'grin'] },
  'boss-38': { body: '#7a3b6b', face: '#e0b98c', shape: 'tall', eyes: 2, parts: ['beard', 'cap'] },
  'boss-39': { body: '#3f6fa8', face: '#f0c9a8', shape: 'blob', eyes: 2, parts: ['hair', 'grin', 'fins'] },
  'boss-40': { body: '#5a3a1f', face: '#9a6a3a', shape: 'blob', eyes: 2, parts: ['ears-round', 'crown', 'beard'] },
}

const PARTS: Part[] = ['beard', 'horns', 'crown', 'grin', 'nose', 'hair', 'cap', 'ears-pointy', 'wings', 'crest']
/** Bosses without a hand-picked look get a stable one derived from their art id. */
function lookFor(art: string): Look {
  if (LOOKS[art]) return LOOKS[art]!
  let h = 7
  for (const ch of art) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = h % 360
  const pick = (k: number) => PARTS[(h >>> k) % PARTS.length]!
  return {
    body: `hsl(${hue} 35% 32%)`,
    face: `hsl(${(hue + 30) % 360} 40% 70%)`,
    shape: (['blob', 'tall', 'blob', 'tall', 'bird'] as const)[(h >>> 3) % 5]!,
    eyes: (h >>> 5) % 7 === 0 ? 1 : 2,
    heads: (h >>> 9) % 11 === 0 ? 3 : undefined,
    parts: [...new Set([pick(11), pick(15), pick(19)])],
  }
}

const INK = '#2a1d0f'

function Eyes({ x, y, r, n, out }: { x: number; y: number; r: number; n: 1 | 2; out: boolean }) {
  const xs = n === 1 ? [x] : [x - r * 0.38, x + r * 0.38]
  const er = n === 1 ? r * 0.3 : r * 0.17
  return (
    <g>
      {xs.map((ex) =>
        out ? (
          <g key={ex} stroke={INK} strokeWidth="3" strokeLinecap="round">
            <path d={`M${ex - er} ${y - er}L${ex + er} ${y + er}M${ex + er} ${y - er}L${ex - er} ${y + er}`} />
          </g>
        ) : (
          <g key={ex}>
            <circle cx={ex} cy={y} r={er} fill="#fffbe8" stroke={INK} strokeWidth="2" />
            <circle cx={ex + er * 0.25} cy={y + er * 0.15} r={er * 0.5} fill={INK} />
            <path d={`M${ex - er * 1.2} ${y - er * 1.5}L${ex + er * 1.1} ${y - er * (ex < x ? 0.8 : 2)}`} stroke={INK} strokeWidth="3" strokeLinecap="round" />
          </g>
        ),
      )}
    </g>
  )
}

function Head({ x, y, r, look, out }: { x: number; y: number; r: number; look: Look; out: boolean }) {
  const has = (p: Part) => look.parts.includes(p)
  return (
    <g>
      {has('ears-round') && [x - r * 0.8, x + r * 0.8].map((ex) => <circle key={ex} cx={ex} cy={y - r * 0.75} r={r * 0.32} fill={look.body} stroke={INK} strokeWidth="3" />)}
      {has('ears-pointy') && [-1, 1].map((d) => <path key={d} d={`M${x + d * r * 0.3} ${y - r * 0.8}L${x + d * r * 0.85} ${y - r * 1.45}L${x + d * r * 0.95} ${y - r * 0.4}Z`} fill={look.body} stroke={INK} strokeWidth="3" />)}
      {has('horns') && [-1, 1].map((d) => <path key={d} d={`M${x + d * r * 0.45} ${y - r * 0.75}Q${x + d * r * 1.1} ${y - r * 1.2} ${x + d * r * 0.95} ${y - r * 1.65}Q${x + d * r * 0.75} ${y - r * 1.1} ${x + d * r * 0.2} ${y - r * 0.9}Z`} fill="#efe3c2" stroke={INK} strokeWidth="2.5" />)}
      {has('antlers') && [-1, 1].map((d) => <path key={d} d={`M${x + d * r * 0.4} ${y - r * 0.8}L${x + d * r * 1.1} ${y - r * 1.7}M${x + d * r * 0.75} ${y - r * 1.25}L${x + d * r * 1.35} ${y - r * 1.15}M${x + d * r * 0.95} ${y - r * 1.5}L${x + d * r * 0.7} ${y - r * 1.9}`} stroke="#6b4a2a" strokeWidth="5" strokeLinecap="round" fill="none" />)}
      {has('hair') && <path d={`M${x - r * 1.05} ${y + r * 0.9}Q${x - r * 1.3} ${y - r * 1.2} ${x} ${y - r * 1.1}Q${x + r * 1.3} ${y - r * 1.2} ${x + r * 1.05} ${y + r * 0.9}Z`} fill={look.body} stroke={INK} strokeWidth="3" opacity="0.9" />}
      <circle cx={x} cy={y} r={r} fill={out ? '#b8b0a2' : look.face} stroke={INK} strokeWidth="3" />
      {has('scarf') && <path d={`M${x - r * 1.05} ${y + r * 0.1}Q${x} ${y - r * 1.6} ${x + r * 1.05} ${y + r * 0.1}L${x + r * 0.9} ${y - r * 0.4}Q${x} ${y - r * 1.25} ${x - r * 0.9} ${y - r * 0.4}Z`} fill="#a8322c" stroke={INK} strokeWidth="2.5" />}
      {has('cap') && <path d={`M${x - r * 0.95} ${y - r * 0.35}Q${x} ${y - r * 1.5} ${x + r * 0.95} ${y - r * 0.35}Z`} fill="#4a3a6b" stroke={INK} strokeWidth="2.5" />}
      {has('santa') && (
        <g>
          <path d={`M${x - r} ${y - r * 0.35}Q${x + r * 0.2} ${y - r * 2} ${x + r * 1.3} ${y - r * 1.1}L${x + r} ${y - r * 0.35}Z`} fill="#b3262a" stroke={INK} strokeWidth="2.5" />
          <rect x={x - r * 1.05} y={y - r * 0.5} width={r * 2.1} height={r * 0.32} rx={r * 0.16} fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx={x + r * 1.3} cy={y - r * 1.1} r={r * 0.18} fill="#fff" stroke={INK} strokeWidth="2" />
        </g>
      )}
      {has('helmet') && <path d={`M${x - r * 1.02} ${y - r * 0.15}Q${x} ${y - r * 1.7} ${x + r * 1.02} ${y - r * 0.15}L${x + r * 0.15} ${y - r * 0.15}L${x} ${y + r * 0.3}L${x - r * 0.15} ${y - r * 0.15}Z`} fill="#8d8f94" stroke={INK} strokeWidth="2.5" />}
      {has('crown') && <path d={`M${x - r * 0.6} ${y - r * 0.8}L${x - r * 0.65} ${y - r * 1.45}L${x - r * 0.3} ${y - r * 1.1}L${x} ${y - r * 1.6}L${x + r * 0.3} ${y - r * 1.1}L${x + r * 0.65} ${y - r * 1.45}L${x + r * 0.6} ${y - r * 0.8}Z`} fill="#e8c34a" stroke={INK} strokeWidth="2.5" />}
      {has('crest') && [-0.35, 0, 0.35].map((d) => <path key={d} d={`M${x + d * r} ${y - r * 0.9}Q${x + d * r * 2.2} ${y - r * 1.6} ${x + d * r * 1.4} ${y - r * 2}`} stroke="#f6c344" strokeWidth="5" strokeLinecap="round" fill="none" />)}
      {has('leaves') && [-0.7, 0.1, 0.8].map((d) => <ellipse key={d} cx={x + d * r} cy={y - r * 0.85} rx={r * 0.28} ry={r * 0.14} transform={`rotate(${d * 40} ${x + d * r} ${y - r * 0.85})`} fill="#6aa046" stroke={INK} strokeWidth="2" />)}
      {has('fins') && [-1, 1].map((d) => <path key={d} d={`M${x + d * r * 0.95} ${y - r * 0.2}L${x + d * r * 1.5} ${y - r * 0.6}L${x + d * r * 1.35} ${y + r * 0.1}Z`} fill="#4c9aa8" stroke={INK} strokeWidth="2.5" />)}
      <Eyes x={x} y={y - r * 0.1} r={r} n={look.eyes} out={out} />
      {has('nose') && <path d={`M${x} ${y + r * 0.05}Q${x + r * 0.35} ${y + r * 0.35} ${x + r * 0.05} ${y + r * 0.45}`} fill={look.face} stroke={INK} strokeWidth="2.5" />}
      {has('beard') ? (
        <path d={`M${x - r * 0.7} ${y + r * 0.45}Q${x} ${y + r * 1.9} ${x + r * 0.7} ${y + r * 0.45}Q${x} ${y + r * 0.85} ${x - r * 0.7} ${y + r * 0.45}Z`} fill={look.parts.includes('santa') ? '#fff' : '#d8d2c4'} stroke={INK} strokeWidth="2.5" />
      ) : has('grin') ? (
        <path d={`M${x - r * 0.45} ${y + r * 0.5}Q${x} ${y + r * (out ? 0.4 : 0.9)} ${x + r * 0.45} ${y + r * 0.5}`} fill={out ? 'none' : '#fffbe8'} stroke={INK} strokeWidth="2.5" />
      ) : (
        <path d={`M${x - r * 0.25} ${y + r * 0.55}L${x + r * 0.25} ${y + r * 0.55}`} stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      )}
    </g>
  )
}

export function BossArt({ art, defeated = false, hit = false, className = 'h-40 w-40' }: { art: string; defeated?: boolean; hit?: boolean; className?: string }) {
  const look = lookFor(art)
  const has = (p: Part) => look.parts.includes(p)
  const body = defeated ? '#8e877b' : look.body
  return (
    <svg viewBox="0 0 160 160" className={`${className} ${hit ? 'anim-shake' : ''}`} aria-hidden="true" style={{ filter: defeated ? 'grayscale(0.7)' : undefined }}>
      {has('snow') && [20, 45, 120, 140, 30, 132].map((cx, i) => <circle key={i} cx={cx} cy={20 + ((i * 37) % 110)} r="3" fill="#cfe4f2" />)}
      {has('wings') && [-1, 1].map((d) => <path key={d} d={`M${80 + d * 30} 112Q${80 + d * 78} 70 ${80 + d * 74} 128Q${80 + d * 55} 118 ${80 + d * 32} 134Z`} fill={body} opacity="0.85" stroke={INK} strokeWidth="3" />)}
      {look.shape === 'square' ? (
        <g>
          <path d="M28 90 L132 90 L140 150 L20 150 Z" fill={body} stroke={INK} strokeWidth="3" />
          {has('pattern') && [40, 64, 88, 112].map((px) => <path key={px} d={`M${px} 100l8 8l-8 8l-8 -8Z`} fill="#f1e4c8" stroke={INK} strokeWidth="1.5" />)}
          <path d="M20 150 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6" fill="none" stroke={INK} strokeWidth="2" />
        </g>
      ) : look.shape === 'bird' ? (
        <g>
          <path d="M80 150 Q40 160 30 140 Q60 140 70 128Z" fill="#c4421a" stroke={INK} strokeWidth="3" />
          <ellipse cx="80" cy="118" rx="36" ry="30" fill={body} stroke={INK} strokeWidth="3" />
        </g>
      ) : (
        <ellipse cx="80" cy={look.shape === 'tall' ? 122 : 124} rx={look.shape === 'tall' ? 36 : 48} ry={look.shape === 'tall' ? 34 : 32} fill={body} stroke={INK} strokeWidth="3" />
      )}
      {look.heads === 3 ? (
        <g>
          {[-1, 0, 1].map((d) => (
            <path key={d} d={`M${80 + d * 14} 110 Q${80 + d * 30} 90 ${80 + d * 42} ${d ? 62 : 48}`} stroke={body} strokeWidth="14" strokeLinecap="round" fill="none" />
          ))}
          {[-1, 0, 1].map((d) => (
            <Head key={d} x={80 + d * 42} y={d ? 56 : 42} r={20} look={{ ...look, face: defeated ? '#b8b0a2' : look.face }} out={defeated} />
          ))}
        </g>
      ) : (
        <Head x={80} y={look.shape === 'square' ? 62 : 66} r={look.shape === 'bird' ? 26 : 32} look={look} out={defeated} />
      )}
      {hit && <circle cx="80" cy="80" r="70" fill="#ffffff" opacity="0.35" />}
    </svg>
  )
}
