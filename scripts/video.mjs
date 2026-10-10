// ============================================================
//  惑星内のランダムな地点から直進するショート動画を撮る（SNS の自動投稿用）
//
//    npm run build && npm run video              … ランダムな地点
//    npm run video -- "lat=33.5&lon=-1"           … 地点を指定（指定のない値はランダム）
//
//  shot.mjs と同じく ?shot=1 を開き、Playwright の時計（page.clock）で時間を止めておく。
//  1/FPS 秒ずつ時計を進めて 1 コマ描かせては撮り、ffmpeg で mp4 にまとめる。
//  描くのが遅い CI（ソフトウェア描画）でも、仕上がりの動きはなめらかになる。
//  shots/ に mp4 と撮影地点の JSON を書き、JSON を標準出力にも出す
// ============================================================

import { spawn } from 'node:child_process'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { preview } from 'vite'
import { chromium } from 'playwright'
import ffmpegPath from 'ffmpeg-static'

const VIEWPORT      = { width: 1280, height: 720 }   // 16:9 の 720p
const FPS           = 30
const SECONDS       = 10                             // 直進する長さ
const MAX_BYTES     = 50_000_000                     // Bluesky の動画の上限（100MB）より十分小さく
const READY_TIMEOUT = 300_000                        // 時計を進めながら読み込みと起動演出を待つ上限（実時間）

const extra = process.argv[2] ?? ''
const softwareGL = !!process.env.CI || !!process.env.SHOT_SWIFTSHADER

const server = await preview({ logLevel: 'warn', preview: { port: 4173 } })
const browser = await chromium.launch({
  args: softwareGL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'],
})
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()) })
  page.on('pageerror', e => console.error('[page]', e.message))

  // ページの時計（performance.now・requestAnimationFrame・setTimeout など）を止め、こちらで進める
  // install だけでは実時間でも進むので、pauseAt で止める
  const start = Date.now()
  await page.clock.install({ time: start })
  await page.clock.pauseAt(start + 1000)
  const url = `${server.resolvedUrls.local[0]}?shot=1${extra ? '&' + extra : ''}`
  await page.goto(url)

  // 読み込みと起動演出が済むまで、1 コマずつ時計を進める（画像の読み込みは実時間で進むので少し待つ）
  const frameMs = 1000 / FPS
  const deadline = Date.now() + READY_TIMEOUT
  while (!(await page.evaluate(() => window.__shot?.ready))) {
    if (Date.now() > deadline) throw new Error('起動が終わらない')
    await page.clock.runFor(frameMs)
    await new Promise(r => setTimeout(r, 10))
  }
  const shot = await page.evaluate(() => ({
    lat: window.__shot.lat, lon: window.__shot.lon, heading: window.__shot.heading, pitch: window.__shot.pitch,
    light: window.__shot.light,
    area: document.getElementById('area-code').textContent,
  }))

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  await mkdir('shots', { recursive: true })
  const file = `shots/${stamp}.mp4`

  // 撮ったコマを JPEG のまま ffmpeg に流し込み、H.264 の mp4 にする
  const ff = spawn(process.env.FFMPEG ?? ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '20',
    '-movflags', '+faststart',
    file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] })
  const ffDone = new Promise((resolve, reject) => {
    ff.on('error', reject)
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg が ${code} で終わった`)))
  })

  // W を押したまま（直進）、1 コマずつ進めて撮る
  await page.keyboard.down('KeyW')
  const frames = SECONDS * FPS
  const t0 = Date.now()
  for (let i = 0; i < frames; i++) {
    await page.clock.runFor(frameMs)
    const img = await page.screenshot({ type: 'jpeg', quality: 92 })
    if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r))
    if ((i + 1) % FPS === 0) console.error(`${(i + 1) / FPS}/${SECONDS} 秒（${Math.round((Date.now() - t0) / 1000)} 秒かかった）`)
  }
  await page.keyboard.up('KeyW')
  ff.stdin.end()
  await ffDone

  const { size } = await stat(file)
  if (size > MAX_BYTES) throw new Error(`動画が ${size} バイトで上限を超えた`)
  const meta = { file, bytes: size, ...shot, video: { ...VIEWPORT, fps: FPS, seconds: SECONDS }, takenAt: new Date().toISOString() }
  await writeFile(`shots/${stamp}.json`, JSON.stringify(meta, null, 2) + '\n')
  console.log(JSON.stringify(meta))
} finally {
  await browser.close()
  await new Promise(r => server.httpServer.close(r))
}
