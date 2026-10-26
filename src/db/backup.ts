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
    if (!Array.isArray((b.tables as Record<string, unknown>)[t])) throw new BackupError(`Table "${t}" is malformed.`)
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
