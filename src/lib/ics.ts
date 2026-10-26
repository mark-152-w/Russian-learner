// "Add a daily reminder to my calendar": a recurring .ics event (PWAs can't schedule notifications offline).

const pad = (n: number) => String(n).padStart(2, '0')

/** Floating local time (no TZ), so the reminder follows the learner's clock. */
export function reminderIcs(time: string, now: Date, url: string): string {
  const [h, m] = time.split(':').map(Number)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m)
  const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  const end = new Date(start.getTime() + 20 * 60000)
  const utc = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Medved//Russian course//EN',
    'BEGIN:VEVENT',
    `UID:medved-daily-${now.getTime()}@medved`,
    `DTSTAMP:${utc}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    'RRULE:FREQ=DAILY',
    'SUMMARY:Russian practice (Medved)',
    `DESCRIPTION:Time for today's Russian session. ${url}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Russian practice',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function downloadIcs(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'russian-reminder.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
