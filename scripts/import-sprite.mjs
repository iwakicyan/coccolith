// ============================================================
//  ドット絵エディタの書き出し（8sprite の txt）を、うろうろするスプライトの絵のファイルにする
//
//    npm run sprite -- ../8sprite/さとうくま.txt satoukuma         … 5 匹
//    npm run sprite -- ../8sprite/さとうくま.txt satoukuma 3       … 3 匹
//    npm run sprite -- 歩行.txt 静止.txt anpafe                     … txt が分かれていれば全部並べる
//
//  src/pixelArt/sprites/<名前>.js に書き出す（同じ名前のファイルは上書き）。
//  このフォルダの絵は main.js が全部読み込んで、陸のランダムな地点に count 匹ずつ出す。
//
//  txt の形: 絵の名前の行のすぐ下に、書き出しの JSON（{ palette, width, height, grid }）を貼ったものを並べる
//    名前に入っている言葉で方向を決める: 正面 / 斜め前 / 横（真横）/ 斜め後ろ / 背面 / 天面
//    名前の最後の数字がコマの番号（1, 2, …、なければ 1）。「座」か「静止」が入っていれば立ち止まったときの絵（sit）、それ以外は歩き（walk）
//    斜め前・斜め後ろがなければ 4 方向、あれば 8 方向のスプライトになる
//    sit がなければ、立ち止まると歩きの 1 コマ目で止まる
//  空を飛ぶもの（飛行機など）: 名前に「真下」「下方」「水平」「上から」があれば、飛びまわるスプライトにして src/pixelArt/flyers/ に書き出す
//    下方（見上げた絵）・水平・上から（見下ろした絵）の 3 段それぞれに 正面〜背面 の 5 方向、天面、真下（下から見上げた絵、前が画像の上）
//    絵はマスの上下左右のまん中にそろえる（幅や高さの違う絵があってよい）
//  横（斜め）の絵は物体の左側から見た絵（顔が画面の左）とする。右側から見た絵なら書き出したファイルの drawnSide を 'right' に
//  物体の中心は絵の幅のまん中の列とする。ずれていれば書き出したファイルの cx を直す
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const args = process.argv.slice(2)
const srcs = args.filter(a => a.endsWith('.txt'))
const [name, countArg] = args.filter(a => !a.endsWith('.txt'))
if (!srcs.length || !/^[a-z][a-z0-9]*$/.test(name ?? '')) {
  console.error('使い方: npm run sprite -- <txt のパス>… <ファイル名（英小文字・数字）> [匹数]')
  process.exit(1)
}
const count = countArg ? Number(countArg) : 5
const srcNames = srcs.map(s => basename(s)).join('・')
// 絵の名前（txt が複数あればファイル名の共通部分。アンパフェ歩行・アンパフェ静止 → アンパフェ）
const titles = srcs.map(s => basename(s).replace(/\.txt$/, ''))
let title = titles[0]
while (title && !titles.every(t => t.startsWith(title))) title = title.slice(0, -1)
title ||= titles[0]

// 名前の言葉 → 方向（「斜め前」より先に「前」を見ないよう、長い言葉から）
const VIEW_WORDS = [['真下', 'bottom'], ['斜め前', 'frontSide'], ['斜め後ろ', 'backSide'], ['正面', 'front'], ['背面', 'back'], ['天面', 'top'], ['横', 'side']]
const VIEW_VAR = { front: 'Front', frontSide: 'FrontSide', side: 'Side', backSide: 'BackSide', back: 'Back', top: 'Top' }
const VIEW_ORDER = ['front', 'frontSide', 'side', 'backSide', 'back', 'top']
// 空を飛ぶものの段（見る高さ）。名前の言葉 → 段
const BAND_WORDS = [['下方', 'below'], ['上から', 'above'], ['水平', '']]
const FLY_WORDS = /真下|下方|上から|水平/
const bandView = (band, view) => band ? band + VIEW_VAR[view] : view

const txt = srcs.map(s => readFileSync(s, 'utf8').replace(/^﻿/, '').replace(/\r/g, '')).join('\n\n')
const frames = []   // { label, pose, view, n, json, width }
// 書き出しの最後の } が抜けていても読めるよう、grid の閉じかっこまでを取る
const re = /^([^\s{\[\]}"_][^\n]*)\n\s*(\{[\s\S]*?\n\s*\][ \t]*(?:\n\})?)/gm
const flying = FLY_WORDS.test(txt)
for (let m; (m = re.exec(txt));) {
  const label = m[1].trim()
  let view = VIEW_WORDS.find(([w]) => label.includes(w))?.[1]
  if (flying && view !== 'top' && view !== 'bottom') view = bandView(BAND_WORDS.find(([w]) => label.includes(w))?.[1] ?? '', view)
  const n = Number(label.match(/(\d+)\s*$/)?.[1] ?? 1)
  if (!view) throw new Error(`「${label}」の方向がわからない（正面・斜め前・横・斜め後ろ・背面・天面 のどれかを名前に入れる）`)
  const json = m[2].trimEnd().endsWith('}') ? m[2] : `${m[2]}\n}`
  const { width } = JSON.parse(json.replace(/\/\/[^\n]*/g, ''))
  frames.push({ label, pose: flying ? 'fly' : /座|静止/.test(label) ? 'sit' : 'walk', view, n, json, width })
}
if (!frames.length) throw new Error('絵が見つからない')

// ポーズ → 方向 → コマ（番号順）
const poses = {}
for (const f of frames) ((poses[f.pose] ??= {})[f.view] ??= []).push(f)
for (const views of Object.values(poses)) for (const list of Object.values(views)) list.sort((a, b) => a.n - b.n)

const eight = Object.values(poses).some(v => v.frontSide || v.backSide)
const need = flying
  ? [...['below', '', 'above'].flatMap(b => VIEW_ORDER.slice(0, 5).map(v => bandView(b, v))), 'top', 'bottom']
  : eight ? VIEW_ORDER : ['front', 'side', 'back', 'top']
for (const [pose, views] of Object.entries(poses)) {
  const missing = need.filter(v => !views[v])
  if (missing.length) throw new Error(`${pose} に ${missing.join('・')} の絵がない`)
}
if (!flying && !poses.walk) throw new Error('歩きの絵がない（「座」「静止」の入っていない名前の絵）')

const varName = f => `${f.pose}${f.view[0].toUpperCase()}${f.view.slice(1)}${f.n}`
const cx = Math.floor(frames[0].width / 2)
const frameCount = Math.max(...(poses.walk ?? poses.fly).front.map(f => f.n))

const out = flying ? `// ${title}（空を飛びまわる 8 方向スプライトの絵。pixelSprite.js の createPixelSpriteFlyers）
//  scripts/import-sprite.mjs で ${srcNames} から書き出したもの（描き直したらもう一度書き出す）
//  下方（見上げた絵）・水平・上から（見下ろした絵）の 3 段に 正面・斜め前・真横・斜め後ろ・背面、それと天面・真下
//  横の絵は左側から見た絵（機首が画面の左）。どの絵もマスの上下左右のまん中にそろえる

${frames.map(f => `// ${f.label}\nconst ${varName(f)} = ${f.json}\n`).join('\n')}
export default {
  count: ${countArg ? count : 2},   // 何機出すか
  scale: 40,   // 大きさの倍率（歩くキャラのドットの 40 倍。56 ドットの絵が 100m ほど）
  drawnSide: 'left',
  poses: {
    fly: {
      views: {
${need.map(v => `        ${v}: [${poses.fly[v].map(varName).join(', ')}],`).join('\n')}
      },
    },
  },
}
` : `// ${title}（${eight ? 8 : 4} 方向スプライトの絵。pixelSprite.js）
//  scripts/import-sprite.mjs で ${srcNames} から書き出したもの（描き直したらもう一度書き出す）
//  ${eight ? '正面・斜め前・真横・斜め後ろ・背面・天面の 8 方向' : '正面・真横・背面・天面の 4 方向で、斜め前・斜め後ろの絵はない（見る角度を 90° ごとに区切る）'}
//  歩き: 各方向 ${frameCount} コマ。${poses.sit ? '立ち止まったら座り（静止）の絵' : '立ち止まったら 1 コマ目で止まる'}
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
const dest = `src/pixelArt/${flying ? 'flyers' : 'sprites'}/${name}.js`
writeFileSync(new URL(`../${dest}`, import.meta.url), out)
console.log(flying ? `${dest} に書き出した（空を飛ぶ 8 方向 × 3 段）` : `${dest} に書き出した（${eight ? 8 : 4} 方向、${Object.keys(poses).join('・')}、${count} 匹）`)
