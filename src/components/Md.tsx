// Markdown-lite renderer for explanations: **bold**, *italic*, ~~wrong form~~, `code`, {{ru:сло́во}}, line breaks.
// Honours the "show stress marks" setting for all Russian it renders.
import type { ReactNode } from 'react'
import { useSettings } from '../db/settings'
import { displayStress } from '../lib/ru'

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|\{\{ru:[^}]+\}\})/g

export function renderInline(text: string, showStress: boolean): ReactNode[] {
  const out: ReactNode[] = []
  text.split(TOKEN).forEach((part, i) => {
    if (!part) return
    const t = (s: string) => displayStress(s, showStress)
    if (part.startsWith('**')) out.push(<strong key={i} className="ru font-bold">{t(part.slice(2, -2))}</strong>)
    else if (part.startsWith('~~')) out.push(<s key={i} className="ru text-bad">{t(part.slice(2, -2))}</s>)
    else if (part.startsWith('{{ru:')) out.push(<span key={i} className="ru">{t(part.slice(5, -2))}</span>)
    else if (part.startsWith('`')) out.push(<code key={i} className="rounded bg-paper px-1">{part.slice(1, -1)}</code>)
    else if (part.startsWith('*') && part.length > 2) out.push(<em key={i}>{t(part.slice(1, -1))}</em>)
    else out.push(t(part))
  })
  return out
}

export function Md({ text, className = '' }: { text: string; className?: string }) {
  const { showStress } = useSettings()
  return (
    <div className={className}>
      {text.split(/\n{2,}/).map((para, i) => {
        const lines = para.split('\n')
        // a paragraph made only of "- " lines is a bullet list
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.slice(2), showStress)}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="mb-2 last:mb-0">
            {lines.flatMap((line, j) => (j ? [<br key={`b${j}`} />, ...renderInline(line, showStress)] : renderInline(line, showStress)))}
          </p>
        )
      })}
    </div>
  )
}

/** Russian text with the stress-mark setting applied. */
export function Ru({ children, className = '' }: { children: string; className?: string }) {
  const { showStress } = useSettings()
  return (
    <span className={`ru ${className}`} lang="ru">
      {displayStress(children, showStress)}
    </span>
  )
}
