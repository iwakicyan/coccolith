// ============================================================
//  ドット絵の平面ページ — 光るもの（ツリーハウスの扉など）をタップで開く 2D のページ
//  レイヤーを背景から順に重ねて描き、暗い背景の上に整数倍で拡大して表示する（全画面にはしない）
//  レイヤー: { palette: { 番号: '#RRGGBB' | null }, width, height, grid: [行][列] = 番号, x?, y?, brightness? }
//  1枚目（背景）の左上を (0,0) として、2枚目以降は x, y（左上、省略時 0）にずらして重ねる。null は透明
//  背景からはみ出したレイヤーも切らずに暗い背景の上に出す（ページの大きさ = 色のあるドット全体の範囲）
//  brightness: そのレイヤーの色に掛ける明るさ（省略時 1。0.8 で 2 割暗く、1.1 で 1 割明るく）
//  blink: true のレイヤーはふだんは出さず、ランダムな間隔で一瞬だけ重ねる（目を閉じた目元を重ねて瞬き）
//  絵と CLOSE の間にテキストウィンドウを置く（横幅は背景の表示幅の TEXT_W 倍。text で中身を渡す。改行はそのまま、[表示する文字](URL) はリンクにする）
//  閉じる: 外側のタップ・CLOSE・Esc
// ============================================================

let pageEl = null
export const isPixelSceneOpen = () => !!pageEl

const FIT_W = 0.6, FIT_H = 0.65   // 画面に対して、絵がはみ出さない幅・高さの割合（少し小さめに表示）
const TEXT_W = 1.4   // テキストウィンドウの横幅（背景の表示幅に対する倍率）
const BLINK_GAP    = [2000, 6000]   // 瞬きの間隔 (ms)。この範囲でランダム
const BLINK_CLOSED = 130            // 目を閉じている長さ (ms)
const BLINK_DOUBLE = 0.2            // 続けてもう一度瞬きする確率

// 色のあるドットを { x, y, color } で並べる（brightness を掛けた色）
function layerDots(layer) {
  const ox = layer.x ?? 0, oy = layer.y ?? 0, k = layer.brightness ?? 1
  const colors = {}
  for (const [n, c] of Object.entries(layer.palette)) {
    if (!c) continue
    const v = parseInt(c.slice(1), 16)
    const ch = sh => Math.min(255, Math.round(((v >> sh) & 255) * k))
    colors[n] = `rgb(${ch(16)},${ch(8)},${ch(0)})`
  }
  const dots = []
  layer.grid.forEach((row, y) => row.forEach((n, x) => {
    if (colors[n]) dots.push({ x: ox + x, y: oy + y, color: colors[n] })
  }))
  return dots
}

export function openPixelScene(layers, { text = '' } = {}) {
  if (pageEl) return
  const dots = layers.filter(l => !l.blink).flatMap(layerDots)
  const blinkDots = layers.filter(l => l.blink).flatMap(layerDots)
  const minX = Math.min(...dots.map(d => d.x)), maxX = Math.max(...dots.map(d => d.x))
  const minY = Math.min(...dots.map(d => d.y)), maxY = Math.max(...dots.map(d => d.y))
  const W = maxX - minX + 1, H = maxY - minY + 1

  const el = document.createElement('div')
  el.id = 'pixel-scene'
  el.innerHTML = `
    <canvas class="ps-art"></canvas>
    <div class="ps-text"></div>
    <button class="ps-close">CLOSE</button>`
  const textEl = el.querySelector('.ps-text')
  // [表示する文字](URL) だけ新しいタブで開くリンクにする（ほかは文字のまま入れる）
  // split すると [文字, 表示する文字, URL, 文字, …] の順に並ぶ
  text.split(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/).forEach((part, i, parts) => {
    if (i % 3 === 0) { textEl.append(part); return }
    if (i % 3 === 2) return   // URL（ひとつ前の表示する文字のところで使う）
    const a = document.createElement('a')
    a.href = parts[i + 1]
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = part
    textEl.append(a)
  })
  const cv = el.querySelector('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  const paint = list => {
    for (const d of list) {   // 背景から順に並んでいるので、あとのレイヤーが手前に来る
      ctx.fillStyle = d.color
      ctx.fillRect(d.x - minX, d.y - minY, 1, 1)
    }
  }
  paint(dots)

  // 瞬き: 目を閉じた目元を一瞬だけ重ね、元の絵に戻す
  const base = ctx.getImageData(0, 0, W, H)
  let blinkTimer = null
  const rand = ([a, b]) => a + Math.random() * (b - a)
  const blink = () => {
    paint(blinkDots)
    blinkTimer = setTimeout(() => {
      ctx.putImageData(base, 0, 0)
      blinkTimer = setTimeout(blink, Math.random() < BLINK_DOUBLE ? BLINK_CLOSED * 1.5 : rand(BLINK_GAP))
    }, BLINK_CLOSED)
  }
  if (blinkDots.length) blinkTimer = setTimeout(blink, rand(BLINK_GAP))

  // ドットが潰れないよう整数倍で拡大する
  const fit = () => {
    const s = Math.max(1, Math.floor(Math.min(innerWidth * FIT_W / W, innerHeight * FIT_H / H)))
    cv.style.width = `${W * s}px`
    cv.style.height = `${H * s}px`
    // テキストウィンドウも絵と同じ倍率で伸び縮みさせる（枠の太さ = 1 ドット）
    textEl.style.width = `${Math.round(layers[0].width * s * TEXT_W)}px`
    textEl.style.setProperty('--dot', `${s}px`)
  }
  fit()

  const close = () => {
    clearTimeout(blinkTimer)
    el.remove()
    pageEl = null
    removeEventListener('resize', fit)
    removeEventListener('keydown', onKey, true)
  }
  const onKey = e => { if (e.code === 'Escape') { close(); e.stopPropagation() } }
  el.addEventListener('click', e => { if (e.target === el) close() })   // 絵の外側をタップ
  el.querySelector('.ps-close').addEventListener('click', close)
  addEventListener('resize', fit)
  addEventListener('keydown', onKey, true)

  document.body.append(el)
  pageEl = el
}
