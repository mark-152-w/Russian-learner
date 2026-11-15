import { describe, expect, it } from 'vitest'
import { BACKUP_EVERY_DAYS, BACKUP_MIN_SESSIONS, BACKUP_SNOOZE_DAYS, backupDue } from './backupReminder'

const DAY = 86400000
const T0 = new Date(2026, 5, 1, 12).getTime()

describe('backup reminder', () => {
  it('waits until there is progress worth keeping', () => {
    expect(backupDue({ last: 0, snoozed: 0 }, T0, BACKUP_MIN_SESSIONS - 1, T0 + 60 * DAY)).toBe(false)
    expect(backupDue({ last: 0, snoozed: 0 }, T0, BACKUP_MIN_SESSIONS, T0 + 60 * DAY)).toBe(true)
  })
  it('counts from the last backup, or from the first use when there is none', () => {
    expect(backupDue({ last: 0, snoozed: 0 }, T0, 20, T0 + (BACKUP_EVERY_DAYS - 1) * DAY)).toBe(false)
    expect(backupDue({ last: 0, snoozed: 0 }, T0, 20, T0 + BACKUP_EVERY_DAYS * DAY)).toBe(true)
    const last = T0 + 30 * DAY
    expect(backupDue({ last, snoozed: 0 }, T0, 20, last + 3 * DAY)).toBe(false)
    expect(backupDue({ last, snoozed: 0 }, T0, 20, last + BACKUP_EVERY_DAYS * DAY)).toBe(true)
  })
  it('"Later" puts it away for a while', () => {
    const now = T0 + 60 * DAY
    expect(backupDue({ last: 0, snoozed: now - DAY }, T0, 20, now)).toBe(false)
    expect(backupDue({ last: 0, snoozed: now - BACKUP_SNOOZE_DAYS * DAY }, T0, 20, now)).toBe(true)
  })
})
