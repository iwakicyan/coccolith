// ============================================================
//  動く台（gondola・gondeer）の道沿いの地面の高さを測って、src/rideHeights.json に書き出す
//
//    node scripts/bake-rides.mjs
//
//  ページを開くたびに道沿いの地面を測ると、レイを何万回も飛ばすので起動が止まる（PC でも約 0.2 秒）
//  地形は決まった種から作るので測った高さは毎回同じ。ここで一度だけ測り、rideHeights.js はそれを読むだけにする
//  地形・道（ROUTES・GONDOLA_TOURS など）・道沿いの建物・台の大きさを変えたら、これを実行し直す
//  （し忘れても、起動時に測り直して合わなければその場で測るので、動きは崩れない。コンソールに知らせる）
//
//  開発サーバーを立てて ?bake-rides で開き、測った高さ（window.__rideBake。src/rideHeights.js）を読む
// ============================================================

import { writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const OUT = 'src/rideHeights.json'
const TIMEOUT = 180_000

const server = await createServer({ logLevel: 'warn', server: { port: 5199, strictPort: false } })
await server.listen()
const args = ['--ignore-gpu-blocklist']
// Playwright の Chromium が入っていなければ、この Mac の Chrome を使う
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' }))
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on('pageerror', e => console.error('[page]', e.message))
  await page.goto(`${server.resolvedUrls.local[0]}?bake-rides`)
  await page.waitForFunction(() => performance.getEntriesByName('first-frame').length > 0, null, { timeout: TIMEOUT, polling: 500 })
  const data = await page.evaluate(() => window.__rideBake)
  const keys = Object.keys(data).sort()
  if (!keys.length) throw new Error('測った高さがありません')
  // 1 台 1 行で書く（差分が読みやすいように）
  await writeFile(OUT, `{\n${keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(data[k])}`).join(',\n')}\n}\n`)
  for (const k of keys) console.log(`${k}: ${data[k].length} 点`)
  console.log(`→ ${OUT}`)
} finally {
  await browser.close()
  await server.close()
}
