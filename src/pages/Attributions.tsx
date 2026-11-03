// The pinned source list itself (tools/sources.json), so a credit never waits for a dictionary rebuild.
import sources from '../../tools/sources.json'

type Source = {
  name: string
  url: string
  licence: string
  licenceUrl: string
  commit?: string
  /** what was done to the source (CC licences ask for changes to be indicated) */
  changes?: string
  /** where the copy we used came from, when it isn't the source itself */
  via?: { name: string; url: string }
  /** per-author credit list served with the site (relative to the base URL) */
  credits?: string
}

const REPO = 'https://github.com/mark-152-w/Russian-learner'
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

export default function Attributions() {
  // the same rule as ingest.py: a source with a "status" note isn't in the build yet
  const list = Object.entries(sources as Record<string, Source & { status?: string }>).filter(([, s]) => !s.status)
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Attributions</h1>
      <section className="rounded-lg border border-line bg-paper-2 p-4 text-sm">
        <h2 className="font-serif text-lg">This app</h2>
        <p>
          Медве́дь is open source:{' '}
          <a href={REPO} className="underline">
            source code on GitHub
          </a>
          .
        </p>
        <ul className="mt-1 list-disc pl-5">
          <li>
            Code:{' '}
            <a href={`${REPO}/blob/main/LICENSE`} className="underline">
              MIT
            </a>
            .
          </li>
          <li>
            Course content and dictionary data:{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline">
              CC BY-SA 4.0
            </a>
            , because the dictionary is adapted from the CC BY-SA sources below.
          </li>
          <li>Example sentences: CC BY 2.0 FR, from Tatoeba.</li>
        </ul>
        <p className="mt-1">
          Details:{' '}
          <a href={`${REPO}/blob/main/CONTENT-LICENSE.md`} className="underline">
            CONTENT-LICENSE.md
          </a>
          .
        </p>
      </section>
      <h2 className="font-serif text-xl">Sources</h2>
      <ul className="space-y-3">
        {list.map(([key, s]) => (
          <li key={key} className="rounded-lg border border-line bg-paper-2 p-4">
            <a href={s.url} className="font-bold text-red underline">
              {s.name}
            </a>
            {s.via && (
              <div className="text-sm">
                Downloaded via{' '}
                <a href={s.via.url} className="underline">
                  {s.via.name}
                </a>
              </div>
            )}
            <div className="text-sm">
              Licence:{' '}
              <a href={s.licenceUrl} className="underline">
                {s.licence}
              </a>
            </div>
            {s.changes && <div className="text-sm text-ink-soft">Changes: {s.changes}</div>}
            {s.credits && (
              <div className="text-sm">
                <a href={asset(s.credits)} className="underline">
                  Authors of every sentence used
                </a>{' '}
                <span className="text-ink-soft">(about 1 MB, needs a connection)</span>
              </div>
            )}
            {s.commit && <div className="text-xs text-ink-soft">Version: {s.commit.slice(0, 10)}</div>}
          </li>
        ))}
        <li className="rounded-lg border border-line bg-paper-2 p-4 text-sm">
          Fonts: PT Sans and PT Serif by ParaType, SIL Open Font License 1.1 (self-hosted via Fontsource).
        </li>
        <li className="rounded-lg border border-line bg-paper-2 p-4 text-sm">
          Software: React, React Router, Dexie, ts-fsrs and Workbox, under the MIT, Apache 2.0 and ISC licences.{' '}
          <a href={asset('third-party-licenses.txt')} className="underline">
            Full licence texts
          </a>
          .
        </li>
      </ul>
    </div>
  )
}
