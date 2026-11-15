import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { MedvedDB, useDatabase } from './db'
import { attemptsOf, isCardOf } from '../srs/deck'

describe('database upgrades', () => {
  it('a version 1 database opens as version 2 with its rows, and attempts become searchable by word', async () => {
    const name = 'upgrade-test'
    // the original schema, as installed apps have it
    const old = new Dexie(name)
    old.version(1).stores({ kv: '&key', attempts: '++id, ts, item, *tags, err' })
    await old.table('kv').put({ key: 'profile', value: { xp: 120 } })
    await old.table('attempts').bulkAdd([
      { ts: 1, item: 'gen:x', type: 'transform', level: 'A2', tags: [], lex: 'n:кот', correct: true, ms: 1, xp: 1 },
      { ts: 2, item: 'srs:vocab:n:кот:ru-en', type: 'choice', level: 'A2', tags: [], correct: false, ms: 1, xp: 0 },
      { ts: 3, item: 'srs:vocab:n:котёл:ru-en', type: 'choice', level: 'A2', tags: [], correct: true, ms: 1, xp: 1 },
    ])
    old.close()

    const db = new MedvedDB(name)
    useDatabase(db)
    expect(db.verno).toBe(2)
    expect((await db.kv.get('profile'))?.value).toEqual({ xp: 120 })
    expect(await db.attempts.where('lex').equals('n:кот').count()).toBe(1)
    expect((await attemptsOf('n:кот')).map((a) => a.ts)).toEqual([1, 2])
  })
})

describe('isCardOf', () => {
  it('matches a word exactly, never a longer word or a homograph', () => {
    expect(isCardOf('srs:vocab:n:кот:ru-en', 'n:кот')).toBe(true)
    expect(isCardOf('srs:form:n:кот:pl_gen', 'n:кот')).toBe(true)
    expect(isCardOf('srs:pair:n:кит|n:кот', 'n:кот')).toBe(true)
    expect(isCardOf('srs:vocab:n:котёл:ru-en', 'n:кот')).toBe(false)
    expect(isCardOf('srs:vocab:n:замок:2:ru-en', 'n:замок')).toBe(false)
    expect(isCardOf('srs:vocab:n:замок:2:ru-en', 'n:замок:2')).toBe(true)
    expect(isCardOf('gen:mean:n:кот', 'n:кот')).toBe(false)
  })
})
