// ============================================================
//  shots/ のスクショ（jpg）を、SS館に飾る絵にする
//
//    npm run gallery
//
//  F20 号の縦横比（横長: 72.7 × 60.6）に真ん中から切り抜き、横 WIDTH px に縮めて src/interiors/gallery/ に書き出す
//  shots/ は git に入れないので、飾る絵はここで repo に入れる。書き出し先にあって shots/ にない絵は消す
//  並べる順は名前（= 撮った日時）順。室内の壁へは src/interiors/sshall.js が順に掛ける
//  macOS の sips を使う
// ============================================================

import { readdirSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const SRC = 'shots'
const OUT = 'src/interiors/gallery'
const RATIO = 72.7 / 60.6   // F20 号の横 / 縦
const WIDTH = 800           // 書き出す横幅 (px)

const px = (file, key) => Number(execFileSync('sips', ['-g', key, file], { encoding: 'utf8' }).match(/:\s*(\d+)/)[1])

mkdirSync(OUT, { recursive: true })
const names = readdirSync(SRC).filter(f => /\.jpe?g$/i.test(f)).sort()
for (const f of readdirSync(OUT)) if (!names.includes(f)) rmSync(join(OUT, f))
for (const name of names) {
  const src = join(SRC, name), out = join(OUT, name)
  const w = px(src, 'pixelWidth'), h = px(src, 'pixelHeight')
  const cw = Math.min(w, Math.round(h * RATIO)), ch = Math.min(h, Math.round(w / RATIO))
  execFileSync('sips', ['-c', String(ch), String(cw), src, '--out', out], { stdio: 'ignore' })
  execFileSync('sips', ['-Z', String(WIDTH), '-s', 'formatOptions', '80', out], { stdio: 'ignore' })
  console.log(`${name}: ${w}x${h} → ${cw}x${ch} → 横 ${WIDTH}`)
}
console.log(`${names.length} 枚を ${OUT} に書き出しました`)
