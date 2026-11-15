// Export / import of all progress as one JSON document.
import { db, TABLES, type TableName } from './db'

export const BACKUP_APP = 'medved'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  tables: Record<TableName, unknown[]>
}

export async function exportProgress(): Promise<Backup> {
  const tables = {} as Record<TableName, unknown[]>
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) tables[t] = await db.table(t).toArray()
  })
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables }
}

export class BackupError extends Error {}

/** Each table's primary key, and the fields a row can't work without (beyond being an object). Auto-increment
 *  tables (reviews, attempts, sessions) need no key. */
const REQUIRED: Record<TableName, Record<string, 'string' | 'number'>> = {
  kv: { key: 'string' },
  srs: { id: 'string', lex: 'string', due: 'number', state: 'number' },
  reviews: { card: 'string', ts: 'number' },
  attempts: { ts: 'number', item: 'string' },
  mastery: { key: 'string', score: 'number' },
  days: { day: 'string' },
  quests: { id: 'string', period: 'string' },
  achievements: { id: 'string', ts: 'number' },
  bests: { key: 'string' },
  sessions: { start: 'number', kind: 'string' },
}

export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not valid JSON.')
  }
  const b = data as Partial<Backup>
  if (b?.app !== BACKUP_APP || typeof b.version !== 'number' || typeof b.tables !== 'object' || !b.tables) {
    throw new BackupError('That file is not a Медве́дь progress backup.')
  }
  if (b.version > BACKUP_VERSION) throw new BackupError('This backup comes from a newer version of the app. Update the app first.')
  for (const t of Object.keys(b.tables)) {
    if (!(TABLES as readonly string[]).includes(t)) throw new BackupError(`Unknown table "${t}" in backup.`)
    const rows = (b.tables as Record<string, unknown>)[t]
    if (!Array.isArray(rows)) throw new BackupError(`Table "${t}" is malformed.`)
    // a damaged file must be refused before it replaces anything, not crash pages later
    const need = Object.entries(REQUIRED[t as TableName])
    rows.forEach((row, i) => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) throw new BackupError(`Table "${t}", row ${i + 1} is malformed.`)
      for (const [k, type] of need)
        if (typeof (row as Record<string, unknown>)[k] !== type) throw new BackupError(`Table "${t}", row ${i + 1} is missing "${k}".`)
    })
  }
  return b as Backup
}

/** Replace all progress with the backup's contents (atomic). */
export async function importProgress(b: Backup): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      const rows = b.tables[t] ?? []
      if (rows.length) await db.table(t).bulkAdd(rows)
    }
  })
}

export async function resetProgress(): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear()
  })
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
