import type { Sentence } from '../types/content.gen'
import { useSettings } from '../db/settings'
import { speak } from '../audio/tts'
import { Ru } from './Md'

/** Example sentences with the word highlighted; tap one to hear it. */
export function ExampleList({ sentences, lex }: { sentences: Sentence[]; lex: string }) {
  const s = useSettings()
  return (
    <ul className="space-y-2">
      {sentences.map((x) => {
        const hit = x.w.find((w) => w.slice(2).some((r) => String(r).startsWith(lex + '|')))
        const [a, b] = hit ? [hit[0] as number, hit[1] as number] : [0, 0]
        return (
          <li key={x.id}>
            <button type="button" onClick={() => speak(x.ru, { rate: s.ttsRate, voice: s.ttsVoice })} className="text-left">
              <Ru className="text-lg">{x.ru.slice(0, a)}</Ru>
              <Ru className="text-lg font-bold text-red">{x.ru.slice(a, b)}</Ru>
              <Ru className="text-lg">{x.ru.slice(b)}</Ru>
            </button>
            <div className="text-sm text-ink-soft">
              {x.en[0]}{' '}
              <a href={`https://tatoeba.org/en/sentences/show/${x.id.slice(2)}`} className="text-xs underline" target="_blank" rel="noreferrer">
                Tatoeba
              </a>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
