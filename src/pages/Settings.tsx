import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { updateSettings, useSettings, type Settings as S } from '../db/settings'
import { downloadJson, exportProgress, importProgress, parseBackup, resetProgress, BackupError } from '../db/backup'
import { noteExported } from '../rewards/service'
import { TRANSLIT_TABLE } from '../engine/translit'
import { speak, ttsSupported, useRussianVoices } from '../audio/tts'
import { downloadIcs, reminderIcs } from '../lib/ics'
import { VoiceHelp } from '../components/VoiceHelp'
import { Ru } from '../components/Md'
import { Button, Card, Toggle } from '../components/ui'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-1">
      <h2 className="mb-1 font-serif text-xl">{title}</h2>
      {children}
    </Card>
  )
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-4 py-2">
      <span>{label}</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(options.find((o) => String(o[0]) === e.target.value)![0])}
        className="rounded-lg border border-line bg-paper px-3 py-2"
      >
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

const LAYOUT_HELP: [string, string][] = [
  ['Windows', 'Settings → Time & language → Language & region → Add a language → Russian. Switch layouts with Win + Space.'],
  ['macOS', 'System Settings → Keyboard → Text Input → Edit → + → Russian (choose "Russian – PC" for the standard ЙЦУКЕН layout). Switch with Ctrl + Space.'],
  ['iPhone / iPad', 'Settings → General → Keyboard → Keyboards → Add New Keyboard → Russian. Switch with the globe key.'],
  ['Android (Gboard)', 'Gboard settings → Languages → Add keyboard → Russian. Switch with the globe key or by long-pressing space.'],
]

export default function Settings() {
  const s = useSettings()
  const set = (patch: Partial<S>) => void updateSettings(patch)
  const { voices, ready } = useRussianVoices()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

  const doExport = async () => {
    const b = await exportProgress()
    downloadJson(b, `medved-progress-${b.exportedAt.slice(0, 10)}.json`)
    await noteExported(Date.now())
    setMsg('Progress exported. Keep the file somewhere safe.')
  }
  const doImport = async (f: File) => {
    try {
      const b = parseBackup(await f.text())
      if (!confirm(`Replace ALL current progress with the backup from ${b.exportedAt.slice(0, 10)}?`)) return
      await importProgress(b)
      setMsg('Progress imported.')
    } catch (e) {
      setMsg(e instanceof BackupError ? e.message : 'Import failed.')
    }
  }
  const doReset = async () => {
    if (!confirm('Delete ALL progress on this device? Export a backup first if you might want it back.')) return
    if (!confirm('Really delete everything? This cannot be undone.')) return
    await resetProgress()
    setMsg('All progress deleted.')
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p className="rounded-lg border border-red bg-paper-2 px-4 py-2" role="status">
          {msg}
        </p>
      )}
      <Section title="Learning">
        <Select
          label="Daily goal"
          value={s.dailyGoalMinutes}
          options={[5, 10, 15, 20, 30, 45, 60].map((m) => [m, `${m} minutes`] as [number, string])}
          onChange={(v) => set({ dailyGoalMinutes: v })}
        />
      </Section>

      <Section title="Display">
        <Toggle
          label="Show stress marks"
          hint="Turn off for advanced reading practice. ё is always shown."
          checked={s.showStress}
          onChange={(v) => set({ showStress: v })}
        />
        <p className="text-sm text-ink-soft">
          Preview: <Ru className="text-lg">{'Я ви́жу её ру́ку.'}</Ru>
        </p>
        <Select label="Theme" value={s.theme} options={[['system', 'Follow device'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(v) => set({ theme: v })} />
        <Select label="Animations" value={s.reduceMotion} options={[['system', 'Follow device'], ['off', 'Full'], ['on', 'Reduced']]} onChange={(v) => set({ reduceMotion: v })} />
      </Section>

      <Section title="Typing">
        <Toggle
          label="Transliteration input"
          hint="Type Russian with Latin letters until you know the ЙЦУКЕН layout."
          checked={s.translit}
          onChange={(v) => set({ translit: v })}
        />
        <details className="text-sm">
          <summary className="cursor-pointer py-2 text-red">Transliteration scheme</summary>
          <div className="grid grid-cols-4 gap-x-3 gap-y-1 sm:grid-cols-6">
            {TRANSLIT_TABLE.map(([lat, cyr]) => (
              <span key={lat}>
                <code>{lat}</code> → <span className="ru">{cyr}</span>
              </span>
            ))}
          </div>
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer py-2 text-red">How to add the Russian keyboard</summary>
          <dl className="space-y-2">
            {LAYOUT_HELP.map(([os, how]) => (
              <div key={os}>
                <dt className="font-bold">{os}</dt>
                <dd className="text-ink-soft">{how}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Section>

      <Section title="Sound and speech">
        <Toggle label="Sound effects" checked={s.sound} onChange={(v) => set({ sound: v })} />
        {canVibrate && <Toggle label="Vibration" checked={s.haptics} onChange={(v) => set({ haptics: v })} />}
        {!ttsSupported() ? (
          <p className="text-sm text-ink-soft">This browser has no speech synthesis, so listening exercises are skipped.</p>
        ) : ready && voices.length === 0 ? (
          <VoiceHelp />
        ) : (
          <>
            <Select
              label="Voice"
              value={s.ttsVoice}
              options={[['', 'Automatic'], ...voices.map((v) => [v.voiceURI, `${v.name}${v.localService ? '' : ' (online)'}`] as [string, string])]}
              onChange={(v) => set({ ttsVoice: v })}
            />
            <label className="flex min-h-11 items-center justify-between gap-4 py-2">
              <span>Speech speed ×{s.ttsRate.toFixed(2)}</span>
              <input type="range" min={0.5} max={1.3} step={0.05} value={s.ttsRate} onChange={(e) => set({ ttsRate: Number(e.target.value) })} className="accent-red" />
            </label>
            <Button variant="secondary" onClick={() => speak('Приве́т! Как дела́?', { rate: s.ttsRate, voice: s.ttsVoice })}>
              Test the voice
            </Button>
          </>
        )}
      </Section>

      <Section title="Daily reminder">
        <p className="text-sm text-ink-soft">
          Offline apps can't send notifications on a schedule, so add a repeating event to your calendar instead.
        </p>
        <label className="flex min-h-11 items-center justify-between gap-4 py-2">
          <span>Time</span>
          <input type="time" value={s.reminderTime} onChange={(e) => set({ reminderTime: e.target.value })} className="rounded-lg border border-line bg-paper px-3 py-2" />
        </label>
        <Button variant="secondary" onClick={() => downloadIcs(reminderIcs(s.reminderTime, new Date(), location.href.split('#')[0]!))}>
          Add a daily reminder to my calendar
        </Button>
      </Section>

      <Section title="Your progress">
        <p className="text-sm text-ink-soft">Everything is stored on this device. Export regularly so you never lose it.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={doExport}>Export progress</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import progress
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          <Button variant="ghost" onClick={doReset} className="text-bad">
            Delete all progress
          </Button>
        </div>
      </Section>

      <p className="text-center text-sm text-ink-soft">
        <Link to="/attributions" className="underline">
          Attributions and licences
        </Link>
      </p>
    </div>
  )
}
