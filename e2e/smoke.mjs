// End-to-end smoke test against the production build: `npm run build && npm run e2e`.
// Plain Playwright (no test runner): each check throws on failure, and any page error fails the run.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// require, not import: it also finds a Playwright installed outside the project (NODE_PATH)
const { chromium } = createRequire(import.meta.url)('playwright')

const PORT = 4179
const BASE = `http://localhost:${PORT}/Russian-learner/`

function startServer() {
  // vite itself, not through npx: killing an npx wrapper leaves the server running
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite preview did not start')), 30000)
    proc.stdout.on('data', (d) => {
      if (String(d).includes(String(PORT))) {
        clearTimeout(t)
        resolve(proc)
      }
    })
    proc.on('exit', (code) => reject(new Error(`vite preview exited with ${code}`)))
  })
}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

/** Rows of an IndexedDB table in the app's database. */
const rows = (page, table) =>
  page.evaluate(
    (t) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('medved')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const q = r.result.transaction(t).objectStore(t).getAll()
          q.onsuccess = () => res(q.result)
          q.onerror = () => rej(q.error)
        }
      }),
    table,
  )

/** Answer whatever item is showing (right or wrong doesn't matter), then wait for the feedback panel. */
async function answerOne(page) {
  const input = await page.$('input[aria-label="Your answer"]')
  if (input) {
    await input.fill('кот')
    await page.keyboard.press('Enter')
  } else {
    const choice = await page.$('main .grid button:not([disabled])')
    if (choice) await choice.click()
    else {
      // stress, tiles, find-error, match, self-graded: fall back to the first enabled button in the card
      const any = await page.$('main .rounded-2xl button:not([disabled])')
      assert(any, 'no way to answer this item')
      await any.click()
      const check = await page.$('main button:has-text("Check"):not([disabled])')
      if (check) await check.click()
    }
  }
  await page.waitForSelector('[role=status] button:has-text("Continue")', { timeout: 5000 }).catch(() => null)
}

const checks = []
const check = (name, fn) => checks.push([name, fn])

check('home loads with its plan and navigation', async (page) => {
  await page.goto(BASE)
  await page.waitForSelector('text=Practice session')
  assert((await page.title()).includes('Медве́дь'), 'page title')
})

check('a session left with Back is still recorded, without a chest', async (page) => {
  await page.goto(BASE + '#/practice/quick')
  await page.waitForSelector('button[aria-label="End session"]', { timeout: 30000 })
  await answerOne(page)
  await page.goBack()
  await page.waitForTimeout(1000)
  const s = await rows(page, 'sessions')
  assert(s.length === 1 && s[0].kind === 'practice-quick' && s[0].answered >= 1 && !s[0].chest, `sessions: ${JSON.stringify(s)}`)
})

check('a finished session shows its summary', async (page) => {
  await page.goto(BASE + '#/practice/quick')
  await page.waitForSelector('button[aria-label="End session"]', { timeout: 30000 })
  for (let i = 0; i < 3; i++) {
    await answerOne(page)
    const next = await page.$('[role=status] button:has-text("Continue")')
    if (next) await next.click()
  }
  await page.click('button[aria-label="End session"]')
  await page.waitForSelector('text=XP', { timeout: 5000 })
  assert((await rows(page, 'sessions')).length === 2, 'second session row')
})

check('export, delete everything, import brings the progress back', async (page) => {
  page.on('dialog', (d) => void d.accept())
  await page.goto(BASE + '#/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export progress")')])
  const file = await download.path()
  const backup = JSON.parse(await readFile(file, 'utf8'))
  assert(backup.app === 'medved' && backup.tables.sessions.length === 2, 'backup contents')
  await page.click('button:has-text("Delete all progress")')
  await page.waitForSelector('text=All progress deleted')
  assert((await rows(page, 'sessions')).length === 0, 'reset')
  await page.setInputFiles('input[type=file]', file)
  await page.waitForSelector('text=Progress imported')
  assert((await rows(page, 'sessions')).length === 2, 'import restored the sessions')
})

check('the main pages render', async (page) => {
  for (const route of ['course', 'review', 'reader', 'trainers', 'grammar', 'stats', 'trophies', 'games', 'lab']) {
    await page.goto(BASE + '#/' + route)
    await page.waitForFunction(() => !document.body.innerText.includes('Loading…'), null, { timeout: 15000 })
    assert(!(await page.$('text=This page didn\'t load')), `${route} showed the error page`)
  }
})

const server = await startServer()
const browser = await chromium.launch()
let failed = 0
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const [name, fn] of checks) {
    errors.length = 0
    try {
      await fn(page)
      assert(!errors.length, `page errors: ${errors.join(' | ')}`)
      console.log(`✓ ${name}`)
    } catch (e) {
      failed++
      console.log(`✗ ${name}\n  ${e.message}`)
    }
  }
} finally {
  await browser.close()
  server.kill()
}
console.log(failed ? `${failed} of ${checks.length} failed` : `all ${checks.length} passed`)
process.exit(failed ? 1 : 0)
