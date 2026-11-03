// Licence notices for the third-party code and fonts bundled into the built site: public/third-party-licenses.txt
// (MIT, Apache-2.0 and the SIL OFL each ask for their notice to travel with copies). Runs before every build, so
// the list follows package.json; the output is gitignored.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'third-party-licenses.txt')
// vite-plugin-pwa bundles these into sw.js / workbox-*.js and the registration code
const WORKBOX = ['workbox-window', 'workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-strategies', 'workbox-expiration', 'workbox-cacheable-response']

const pkgDir = (name) => join(root, 'node_modules', name)
const readPkg = (name) => JSON.parse(readFileSync(join(pkgDir(name), 'package.json'), 'utf8'))

// production dependencies, followed transitively (peer and dev dependencies aren't bundled on their own)
const seen = new Set()
const queue = [...Object.keys(readPkg('..').dependencies ?? {}), ...WORKBOX]
while (queue.length) {
  const name = queue.shift()
  if (seen.has(name) || !existsSync(pkgDir(name))) continue
  seen.add(name)
  queue.push(...Object.keys(readPkg(name).dependencies ?? {}))
}

// the licence file, plus any NOTICE file (Apache-2.0 asks for it to be passed on too)
const licenceText = (name) => {
  const files = readdirSync(pkgDir(name))
  const pick = (re) => files.find((f) => re.test(f))
  const parts = [pick(/^(licen[cs]e|copying)(\.|$)/i), pick(/^notice(\.|$)/i)].filter(Boolean)
  return parts.length ? parts.map((f) => readFileSync(join(pkgDir(name), f), 'utf8').trim()).join('\n\n') : null
}

const sections = [...seen].sort().map((name) => {
  const p = readPkg(name)
  const text = licenceText(name)
  const repo = typeof p.repository === 'string' ? p.repository : p.repository?.url
  return [`${name} ${p.version}`, `Licence: ${p.license ?? 'see below'}`, repo && `Source: ${repo.replace(/^git\+/, '')}`, '', text ?? `(${p.license} licence; no licence file in the package)`]
    .filter((l) => l !== undefined && l !== null)
    .join('\n')
})

const header = `Third-party software in Медведь (https://github.com/mark-152-w/Russian-learner)

Медведь's own code is MIT-licensed and its content CC BY-SA 4.0 (see LICENSE and CONTENT-LICENSE.md in the
repository). The built site also contains the following packages, under their own licences:
${[...seen].sort().map((n) => `  - ${n} (${readPkg(n).license})`).join('\n')}
`
mkdirSync(dirname(out), { recursive: true })
// the byte-order mark makes browsers read it as UTF-8 even when the server names no charset
writeFileSync(out, `\ufeff${header}\n${'='.repeat(78)}\n\n${sections.join(`\n\n${'='.repeat(78)}\n\n`)}\n`)
console.log(`public/third-party-licenses.txt: ${seen.size} packages`)
