// Render PWA icons from public/favicon.svg (run once; outputs are committed).
// Needs Playwright's Chromium: NODE_PATH=$(npm root -g) node scripts/gen-icons.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const svg = readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()
const out = [
  ['public/icons/icon-192.png', 192, false],
  ['public/icons/icon-512.png', 512, false],
  ['public/icons/maskable-512.png', 512, true],
  ['public/icons/apple-touch-icon.png', 180, true],
]
for (const [file, size, maskable] of out) {
  // maskable: full-bleed background, artwork inside the 80% safe zone
  const inner = maskable ? size * 0.72 : size
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:${maskable ? '#8e1c1c' : 'transparent'};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg', `<svg width="${inner}" height="${inner}"`)}</div></body></html>`)
  await page.screenshot({ path: file, omitBackground: !maskable })
  console.log('wrote', file)
}
await browser.close()
