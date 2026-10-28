// ============================================================
//  ドット絵エディタの書き出し（8sprite の txt）を、ページを開いてから描き始めるまでのローディング表示にする
//
//    npm run loading -- ~/Downloads/Loading.txt
//
//  名前の最後に数字がある絵（Ice1, Ice2, …）がパラパラ漫画のコマ（番号順）。数字のない絵はテロップで、どのコマの上にも重ねる
//  コマは横一列に並べた PNG に、テロップは別の PNG にして、index.html の「loading:begin」〜「loading:end」の CSS に data URI で埋め込む
//  JS や画像を読み込むより前から出せるように、ファイルを分けずに HTML へ直接入れる
//  最初の INTRO_FRAMES コマは INTRO_SEC 秒で速めに流し、描き始めるまでにそこまで見せる。まだ描き始めなければ続きのコマを FPS で流し、最後まで来たら 1 コマ目から FPS でくり返す
//  描き直したら、これを実行し直す
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'

const FPS = 4            // 1 秒に何コマ
const INTRO_FRAMES = 8   // 最初に速めに流すコマ数
const INTRO_SEC = 1      // そのコマを流しきる秒数
const TELOP_COLOR = '#FFFFFF'   // テロップを塗る色（txt の色にかかわらずこの 1 色に。txt の色のままにするなら null）

const src = process.argv[2]
if (!src?.endsWith('.txt')) {
  console.error('使い方: npm run loading -- <txt のパス>')
  process.exit(1)
}

const txt = readFileSync(src, 'utf8').replace(/^﻿/, '').replace(/\r/g, '')
const frames = []   // { n, art }
let telop = null
// 書き出しの最後の } が抜けていても読めるよう、grid の閉じかっこまでを取る（import-sprite.mjs と同じ）
const re = /^([^\s{\[\]}"_][^\n]*)\n\s*(\{[\s\S]*?\n\s*\][ \t]*(?:\n\})?)/gm
for (let m; (m = re.exec(txt));) {
  const label = m[1].trim()
  const json = m[2].trimEnd().endsWith('}') ? m[2] : `${m[2]}\n}`
  const art = JSON.parse(json.replace(/\/\/[^\n]*/g, ''))
  const n = label.match(/(\d+)\s*$/)?.[1]
  if (n) frames.push({ n: Number(n), art })
  else if (telop) throw new Error(`番号のない絵が 2 枚ある（「${label}」）。テロップは 1 枚だけ`)
  else telop = TELOP_COLOR ? { ...art, palette: Object.fromEntries(Object.entries(art.palette).map(([k, v]) => [k, v && TELOP_COLOR])) } : art
}
if (!frames.length) throw new Error('コマ（名前の最後に番号のある絵）が見つからない')
frames.sort((a, b) => a.n - b.n)
const { width: W, height: H } = frames[0].art
for (const { n, art } of frames) if (art.width !== W || art.height !== H) throw new Error(`${n} コマ目の大きさが 1 コマ目と違う`)
if (telop && (telop.width !== W || telop.height !== H)) throw new Error('テロップの大きさがコマと違う')

// 絵を RGBA の画素に描く（dx は横にずらす量）
const paint = (rgba, stride, art, dx) => art.grid.forEach((row, y) => row.forEach((c, x) => {
  const hex = art.palette[c]
  if (!hex) return
  const i = (y * stride + dx + x) * 4
  rgba[i] = parseInt(hex.slice(1, 3), 16); rgba[i + 1] = parseInt(hex.slice(3, 5), 16); rgba[i + 2] = parseInt(hex.slice(5, 7), 16); rgba[i + 3] = 255
}))

// RGBA の画素 → PNG
function png(rgba, w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6   // 8bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
const dataUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`

const sheet = new Uint8Array(W * frames.length * H * 4)
frames.forEach(({ art }, i) => paint(sheet, W * frames.length, art, i * W))
let telopUri = null
if (telop) { const t = new Uint8Array(W * H * 4); paint(t, W, telop, 0); telopUri = dataUri(png(t, W, H)) }

// コマ k（0 から）を出す background-position-x（絵の幅がコマ N 枚ぶんなので、0% が 1 コマ目・100% が最後のコマ）
const N = frames.length
const pos = (k) => `${+(k / (N - 1) * 100).toFixed(4)}%`
// steps(n, jump-none) で a〜b コマ目を 1 コマずつ同じ長さで出す。あとに書いたアニメほど優先されるので、遅れて始まるものが前のものを引き継ぐ
const anims = [], keyframes = []
const flip = (name, a, b, sec, delay, count) => {
  anims.push(`${name} ${+sec.toFixed(4)}s steps(${b - a + 1}, jump-none) ${+delay.toFixed(4)}s ${count}`)
  keyframes.push(`    @keyframes ${name} { from { background-position-x: ${pos(a)}; } to { background-position-x: ${pos(b)}; } }`)
}
const intro = Math.min(INTRO_FRAMES, N)
flip('ld-intro', 0, intro - 1, INTRO_SEC, 0, 1)
if (intro < N) flip('ld-rest', intro, N - 1, (N - intro) / FPS, INTRO_SEC, 1)
flip('ld-loop', 0, N - 1, N / FPS, INTRO_SEC + (N - intro) / FPS, 'infinite')

const css = [
  `    /* ${src.split('/').pop()} から scripts/import-loading.mjs で書き出したもの（${N} コマ。最初の ${intro} コマを ${INTRO_SEC} 秒で、そのあとは 1 秒に ${FPS} コマ）。手で直さず、描き直したら書き出し直す */`,
  `    #loading .ld-frames { background-image: url(${dataUri(png(sheet, W * frames.length, H))}); background-size: ${N * 100}% 100%; animation: ${anims.join(', ')}; }`,
  ...keyframes,
  telopUri ? `    #loading .ld-telop { background-image: url(${telopUri}); background-size: 100% 100%; }` : `    #loading .ld-telop { display: none; }`,
]

const HTML = 'index.html'
const html = readFileSync(HTML, 'utf8')
const block = /(\/\* loading:begin \*\/)[\s\S]*?(\n[ \t]*\/\* loading:end \*\/)/
if (!block.test(html)) throw new Error(`${HTML} に /* loading:begin */ 〜 /* loading:end */ がない`)
writeFileSync(HTML, html.replace(block, (_, a, b) => a + '\n' + css.join('\n') + b))
console.log(`${HTML} に書き出した: ${frames.length} コマ（${W}×${H}）${telop ? ' + テロップ' : ''}`)
