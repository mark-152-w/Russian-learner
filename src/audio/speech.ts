// Speech recognition for shadowing (Chrome/Edge expose webkitSpeechRecognition). Used only when the learner taps the
// microphone; note that Chrome sends the audio to its own recognition service. Everything else works without it.
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const recognitionSupported = () => !!ctor()

/** Listen once in Russian; resolves with the transcript ('' if nothing was heard). */
export function listenOnce(): Promise<string> {
  const C = ctor()
  if (!C) return Promise.resolve('')
  return new Promise((resolve) => {
    const r = new C()
    r.lang = 'ru-RU'
    r.interimResults = false
    r.maxAlternatives = 1
    let text = ''
    r.onresult = (e) => {
      text = e.results[0]?.[0]?.transcript ?? ''
    }
    r.onerror = () => resolve(text)
    r.onend = () => resolve(text)
    r.start()
  })
}
