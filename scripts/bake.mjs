// ============================================================
//  起動のたびに同じ答えになる重い計算をしておいて、src/baked.json に書き出す（読むのは src/bake.js）
//
//    node scripts/bake.mjs
//
//  書き出すもの
//    ride:*        動く台（gondola・gondeer）の道沿いの地面の高さ（開くたびに測るとレイを何万回も飛ばす）
//    pixelGround:* ドット絵の地面（下葉・EF）のどのマスが平らで貼れるか
//    grass:*       草の原のどこに草を置くか（陸か・海岸から離れているか・縁のギザギザ）
//  地形・道（ROUTES・GONDOLA_TOURS など）・道沿いの建物・台の大きさ・草やドット絵の地面の範囲や密度を変えたら、これを実行し直す
//  （し忘れても、起動時に何か所か計算し直して合わなければその場で全部計算するので、見た目は崩れない。コンソールに知らせる）
//
//  開発サーバーを立てて ?bake で開き、計算したもの（window.__bake）を読む
// ============================================================

import { writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const OUT = 'src/baked.json'
const TIMEOUT = 180_000

const server = await createServer({ logLevel: 'warn', server: { port: 5199, strictPort: false } })
await server.listen()
const args = ['--ignore-gpu-blocklist']
// Playwright の Chromium が入っていなければ、この Mac の Chrome を使う
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' }))
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on('pageerror', e => console.error('[page]', e.message))
  await page.goto(`${server.resolvedUrls.local[0]}?bake`)
  await page.waitForFunction(() => performance.getEntriesByName('first-frame').length > 0, null, { timeout: TIMEOUT, polling: 500 })
  const data = await page.evaluate(() => window.__bake)
  const keys = Object.keys(data).sort()
  if (!keys.length) throw new Error('計算したものがありません')
  // 1 つ 1 行で書く（差分が読みやすいように）
  await writeFile(OUT, `{\n${keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(data[k])}`).join(',\n')}\n}\n`)
  for (const k of keys) console.log(`${k}: ${Array.isArray(data[k]) ? data[k].length + ' 点' : data[k].n + ' 候補'}`)
  console.log(`→ ${OUT}`)
} finally {
  await browser.close()
  await server.close()
}
