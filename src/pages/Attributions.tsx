// The pinned source list itself (tools/sources.json), so a credit never waits for a dictionary rebuild.
import sources from '../../tools/sources.json'

type Source = { name: string; url: string; licence: string; licenceUrl: string; commit?: string }

export default function Attributions() {
  // the same rule as ingest.py: a source with a "status" note isn't in the build yet
  const list = Object.entries(sources as Record<string, Source & { status?: string }>).filter(([, s]) => !s.status)
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Attributions</h1>
      <p className="text-ink-soft">
        Медве́дь is built on open linguistic data. The derived dictionary data in this app is shared under the same
        licences.
      </p>
      <ul className="space-y-3">
        {list.map(([key, s]) => (
          <li key={key} className="rounded-lg border border-line bg-paper-2 p-4">
            <a href={s.url} className="font-bold text-red underline">
              {s.name}
            </a>
            <div className="text-sm">
              Licence:{' '}
              <a href={s.licenceUrl} className="underline">
                {s.licence}
              </a>
            </div>
            {s.commit && <div className="text-xs text-ink-soft">Version: {s.commit.slice(0, 10)}</div>}
          </li>
        ))}
        <li className="rounded-lg border border-line bg-paper-2 p-4 text-sm">
          Fonts: PT Sans and PT Serif by ParaType, SIL Open Font License 1.1 (self-hosted via Fontsource).
        </li>
      </ul>
    </div>
  )
}
