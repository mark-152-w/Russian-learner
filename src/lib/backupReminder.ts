// A reminder to export: all progress lives in this browser only, so a lost phone or cleared site data loses it.
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getKV, setKV } from '../db/db'
import { downloadJson, exportProgress } from '../db/backup'
import { noteExported } from '../rewards/service'

const DAY = 86400000
/** Days between backups before Home asks for a new one. */
export const BACKUP_EVERY_DAYS = 14
/** "Later" puts the reminder away for this many days. */
export const BACKUP_SNOOZE_DAYS = 7
/** Sessions before there's enough progress to be worth asking about. */
export const BACKUP_MIN_SESSIONS = 5

export interface BackupState {
  /** Last export (epoch ms), 0 if never. */
  last: number
  snoozed: number
}

/**
 * Whether to ask for a backup now: enough progress, and the last backup (or, if there's never been one, the
 * first use of the app) is BACKUP_EVERY_DAYS old, unless the learner said "Later" recently.
 */
export function backupDue(s: BackupState, created: number, sessions: number, now: number): boolean {
  if (sessions < BACKUP_MIN_SESSIONS) return false
  if (s.snoozed && now - s.snoozed < BACKUP_SNOOZE_DAYS * DAY) return false
  const since = s.last || created || now
  return now - since >= BACKUP_EVERY_DAYS * DAY
}

export const loadBackupState = async (): Promise<BackupState> => ({ last: await getKV('backup:last', 0), snoozed: await getKV('backup:snooze', 0) })

export const useBackupState = () =>
  useLiveQuery(async () => {
    const [last, snoozed] = await Promise.all([db.kv.get('backup:last'), db.kv.get('backup:snooze')])
    return { last: (last?.value as number) ?? 0, snoozed: (snoozed?.value as number) ?? 0 }
  }, [])

export const snoozeBackup = (now: number) => setKV('backup:snooze', now)

/** Export everything to a download and remember when. */
export async function exportAndDownload(now: number): Promise<void> {
  const b = await exportProgress()
  downloadJson(b, `medved-progress-${b.exportedAt.slice(0, 10)}.json`)
  await setKV('backup:last', now)
  await noteExported(now)
}
