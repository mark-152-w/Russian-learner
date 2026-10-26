// Shown when no Russian text-to-speech voice is installed.
const STEPS: [string, string][] = [
  ['Windows', 'Settings → Time & language → Speech → Manage voices → Add voices → Russian. Then restart the browser.'],
  ['macOS', 'System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → Russian (e.g. Milena) → download. Then restart the browser.'],
  ['iPhone / iPad', 'Settings → Accessibility → Spoken Content → Voices → Russian → download a voice (e.g. Milena).'],
  ['Android', 'Settings → System → Languages & input → Text-to-speech output → Preferred engine settings (gear) → Install voice data → Russian.'],
]

export function VoiceHelp() {
  return (
    <div className="rounded-lg border border-line bg-paper p-3 text-sm">
      <p className="font-bold">No Russian voice found on this device</p>
      <p className="mt-1 text-ink-soft">
        Listening exercises use your device's built-in voices, which work offline once installed. Add a Russian voice:
      </p>
      <dl className="mt-2 space-y-2">
        {STEPS.map(([os, how]) => (
          <div key={os}>
            <dt className="font-bold">{os}</dt>
            <dd className="text-ink-soft">{how}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-ink-soft">Until then, exercises that need audio are left out of your sessions.</p>
    </div>
  )
}
