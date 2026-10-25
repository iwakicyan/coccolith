// ============================================================
//  ドット絵エディタの書き出し（8sprite の txt）を、うろうろするスプライトの絵のファイルにする
//
//    npm run sprite -- ../8sprite/さとうくま.txt satoukuma         … 5 匹
//    npm run sprite -- ../8sprite/さとうくま.txt satoukuma 3       … 3 匹
//
//  src/pixelArt/sprites/<名前>.js に書き出す（同じ名前のファイルは上書き）。
//  このフォルダの絵は main.js が全部読み込んで、陸のランダムな地点に count 匹ずつ出す。
//
//  txt の形: 絵の名前の行のすぐ下に、書き出しの JSON（{ palette, width, height, grid }）を貼ったものを並べる
//    名前に入っている言葉で方向を決める: 正面 / 斜め前 / 横（真横）/ 斜め後ろ / 背面 / 天面
//    名前の最後の数字がコマの番号（1, 2, …）。「座」が入っていれば立ち止まったときの絵（sit）、それ以外は歩き（walk）
//    斜め前・斜め後ろがなければ 4 方向、あれば 8 方向のスプライトになる
//    sit がなければ、立ち止まると歩きの 1 コマ目で止まる
//  横（斜め）の絵は物体の左側から見た絵（顔が画面の左）とする。右側から見た絵なら書き出したファイルの drawnSide を 'right' に
//  物体の中心は絵の幅のまん中の列とする。ずれていれば書き出したファイルの cx を直す
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const [src, name, countArg] = process.argv.slice(2)
if (!src || !/^[a-z][a-z0-9]*$/.test(name ?? '')) {
  console.error('使い方: npm run sprite -- <txt のパス> <ファイル名（英小文字・数字）> [匹数]')
  process.exit(1)
}
const count = countArg ? Number(countArg) : 5
const title = basename(src).replace(/\.txt$/, '')

// 名前の言葉 → 方向（「斜め前」より先に「前」を見ないよう、長い言葉から）
const VIEW_WORDS = [['斜め前', 'frontSide'], ['斜め後ろ', 'backSide'], ['正面', 'front'], ['背面', 'back'], ['天面', 'top'], ['横', 'side']]
const VIEW_VAR = { front: 'Front', frontSide: 'FrontSide', side: 'Side', backSide: 'BackSide', back: 'Back', top: 'Top' }
const VIEW_ORDER = ['front', 'frontSide', 'side', 'backSide', 'back', 'top']

const txt = readFileSync(src, 'utf8').replace(/^﻿/, '').replace(/\r/g, '')
const frames = []   // { label, pose, view, n, json, width }
const re = /^([^\s{\[\]}"_][^\n]*)\n\s*(\{[\s\S]*?\n\})/gm
for (let m; (m = re.exec(txt));) {
  const label = m[1].trim()
  const view = VIEW_WORDS.find(([w]) => label.includes(w))?.[1]
  const n = Number(label.match(/(\d+)\s*$/)?.[1] ?? 1)
  if (!view) throw new Error(`「${label}」の方向がわからない（正面・斜め前・横・斜め後ろ・背面・天面 のどれかを名前に入れる）`)
  const json = m[2]
  const { width } = JSON.parse(json.replace(/\/\/[^\n]*/g, ''))
  frames.push({ label, pose: label.includes('座') ? 'sit' : 'walk', view, n, json, width })
}
if (!frames.length) throw new Error('絵が見つからない')

// ポーズ → 方向 → コマ（番号順）
const poses = {}
for (const f of frames) ((poses[f.pose] ??= {})[f.view] ??= []).push(f)
for (const views of Object.values(poses)) for (const list of Object.values(views)) list.sort((a, b) => a.n - b.n)

const eight = Object.values(poses).some(v => v.frontSide || v.backSide)
const need = eight ? VIEW_ORDER : ['front', 'side', 'back', 'top']
for (const [pose, views] of Object.entries(poses)) {
  const missing = need.filter(v => !views[v])
  if (missing.length) throw new Error(`${pose} に ${missing.join('・')} の絵がない`)
}
if (!poses.walk) throw new Error('歩きの絵がない（「座」の入っていない名前の絵）')

const varName = f => `${f.pose}${VIEW_VAR[f.view]}${f.n}`
const cx = Math.floor(frames[0].width / 2)
const frameCount = Math.max(...poses.walk.front.map(f => f.n))

const out = `// ${title}（${eight ? 8 : 4} 方向スプライトの絵。pixelSprite.js）
//  scripts/import-sprite.mjs で ${basename(src)} から書き出したもの（描き直したらもう一度書き出す）
//  ${eight ? '正面・斜め前・真横・斜め後ろ・背面・天面の 8 方向' : '正面・真横・背面・天面の 4 方向で、斜め前・斜め後ろの絵はない（見る角度を 90° ごとに区切る）'}
//  歩き: 各方向 ${frameCount} コマ。${poses.sit ? '立ち止まったら座りの絵' : '立ち止まったら 1 コマ目で止まる'}
//  横の絵は左側から見た絵（顔が画面の左）。どの絵も左から ${cx} 列目が中心

${frames.map(f => `// ${f.label}\nconst ${varName(f)} = ${f.json}\n`).join('\n')}
export default {
  count: ${count},   // 何匹出すか
  cx: ${cx},
  drawnSide: 'left',
  poses: {
${Object.entries(poses).map(([pose, views]) => `    ${pose}: {
${pose === 'walk' ? '      fps: 4,\n' : ''}      views: {
${need.map(v => `        ${v}: [${views[v].map(varName).join(', ')}],`).join('\n')}
      },
    },`).join('\n')}
  },
}
`
const dest = `src/pixelArt/sprites/${name}.js`
writeFileSync(new URL(`../${dest}`, import.meta.url), out)
console.log(`${dest} に書き出した（${eight ? 8 : 4} 方向、${Object.keys(poses).join('・')}、${count} 匹）`)
