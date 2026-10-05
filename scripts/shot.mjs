// ============================================================
//  惑星内のランダムな地点のスクショを撮る（SNS の自動投稿用）
//
//    npm run build && npm run shot              … ランダムな地点
//    npm run shot -- "lat=33.5&lon=-1"           … 地点を指定（指定のない値はランダム）
//
//  dist/ を vite preview で配信し、ヘッドレスの Chromium で ?shot=1 を開いて
//  window.__shot.ready（src/shot.js）を待ってから撮る。
//  shots/ に JPEG と撮影地点の JSON を書き、JSON を標準出力にも出す
// ============================================================

import { mkdir, writeFile } from 'node:fs/promises'
import { preview } from 'vite'
import { chromium } from 'playwright'

const VIEWPORT     = { width: 1200, height: 675 }   // 16:9
const SCALE        = 2                              // 書き出しは 2400×1350
const MAX_BYTES    = 950_000                        // Bluesky の画像の上限（1MB）に収める
const QUALITIES    = [90, 82, 74, 66, 58]
const READY_TIMEOUT = 180_000                       // GPU のない CI はソフトウェア描画で遅い

const extra = process.argv[2] ?? ''
// GPU のない環境（CI）では SwiftShader で WebGL を描く
const softwareGL = !!process.env.CI || !!process.env.SHOT_SWIFTSHADER

const server = await preview({ logLevel: 'warn', preview: { port: 4173 } })
const browser = await chromium.launch({
  args: softwareGL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'],
})
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()) })
  page.on('pageerror', e => console.error('[page]', e.message))

  const url = `${server.resolvedUrls.local[0]}?shot=1${extra ? '&' + extra : ''}`
  await page.goto(url)
  await page.waitForFunction(() => window.__shot?.ready, null, { timeout: READY_TIMEOUT, polling: 500 })
  const shot = await page.evaluate(() => ({
    lat: window.__shot.lat, lon: window.__shot.lon, heading: window.__shot.heading, pitch: window.__shot.pitch,
    light: window.__shot.light,
    area: document.getElementById('area-code').textContent,
  }))

  let img
  for (const quality of QUALITIES) {
    img = await page.screenshot({ type: 'jpeg', quality })
    if (img.length <= MAX_BYTES) break
  }
  if (img.length > MAX_BYTES) throw new Error(`画像が ${img.length} バイトで上限を超えた`)

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  await mkdir('shots', { recursive: true })
  const file = `shots/${stamp}.jpg`
  const meta = { file, bytes: img.length, ...shot, takenAt: new Date().toISOString() }
  await writeFile(file, img)
  await writeFile(`shots/${stamp}.json`, JSON.stringify(meta, null, 2) + '\n')
  console.log(JSON.stringify(meta))
} finally {
  await browser.close()
  await new Promise(r => server.httpServer.close(r))
}
