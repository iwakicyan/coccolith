// ============================================================
//  ドット絵の平面ページ — 光るもの（ツリーハウスの扉など）をタップで開く 2D のページ
//  レイヤーを背景から順に重ねて描き、暗い背景の上に整数倍で拡大して表示する（全画面にはしない）
//  レイヤー: { palette: { 番号: '#RRGGBB' | null }, width, height, grid: [行][列] = 番号, x?, y?, brightness? }
//  1枚目（背景）の左上を (0,0) として、2枚目以降は x, y（左上、省略時 0）にずらして重ねる。null は透明
//  背景からはみ出したレイヤーも切らずに暗い背景の上に出す（ページの大きさ = 色のあるドット全体の範囲）
//  brightness: そのレイヤーの色に掛ける明るさ（省略時 1。0.8 で 2 割暗く、1.1 で 1 割明るく）
//  blink: true のレイヤーはふだんは出さず、ランダムな間隔で一瞬だけ重ねる（目を閉じた目元を重ねて瞬き）
//  showOnTap: レイヤー を持つレイヤーはふだんは出さず、そのレイヤーの色のあるドットをタップするたびに出す・消すを切り替える（人物をタップで吹き出し）
//  onTap: 関数 を持つレイヤーは、その色のあるドットをタップすると関数を呼ぶ（バインダーをタップで開発資料を開く）
//  hoverLabel: 文字 を持つレイヤーは、カーソルを合わせると周り 1 ドットを白く縁取り、上にその文字を出す
//  絵と CLOSE の間にテキストウィンドウを置く（横幅は背景の表示幅の TEXT_W 倍。text で中身を渡す。改行はそのまま、[表示する文字](URL) はリンクにする）
//  閉じる: 外側のタップ・CLOSE・Esc
// ============================================================

import { isDocViewerOpen } from './docViewer.js'

let pageEl = null
export const isPixelSceneOpen = () => !!pageEl

const FIT_W = 0.6, FIT_H = 0.65   // 画面に対して、絵がはみ出さない幅・高さの割合（少し小さめに表示）
const FIT_W_PORTRAIT = 0.94       // 縦長の画面（スマホの縦向き）では幅いっぱい近くまで使う
const TEXT_W = 1.4   // テキストウィンドウの横幅（背景の表示幅に対する倍率）
const BLINK_GAP    = [2000, 6000]   // 瞬きの間隔 (ms)。この範囲でランダム
const BLINK_CLOSED = 130            // 目を閉じている長さ (ms)
const BLINK_DOUBLE = 0.2            // 続けてもう一度瞬きする確率
const OUTLINE_COLOR = '#FFFFFF'     // hoverLabel のレイヤーにカーソルを合わせたときの縁取りの色

// 色のあるドットの周り 1 ドット（斜めも含む）のうち、色のないところを { x, y, color } で並べる
function outlineDots(dots) {
  const filled = new Set(dots.map(d => `${d.x},${d.y}`))
  const out = new Map()
  for (const d of dots) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const key = `${d.x + dx},${d.y + dy}`
    if (!filled.has(key)) out.set(key, { x: d.x + dx, y: d.y + dy, color: OUTLINE_COLOR })
  }
  return [...out.values()]
}

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
  const layerDotsOf = new Map(layers.map(l => [l, layerDots(l)]))
  const dots = layers.filter(l => !l.blink).flatMap(l => layerDotsOf.get(l))   // ページの大きさはタップで出すレイヤーも含めて決める
  const blinkDots = layers.filter(l => l.blink).flatMap(l => layerDotsOf.get(l))
  const minX = Math.min(...dots.map(d => d.x)), maxX = Math.max(...dots.map(d => d.x))
  const minY = Math.min(...dots.map(d => d.y)), maxY = Math.max(...dots.map(d => d.y))
  const W = maxX - minX + 1, H = maxY - minY + 1

  const el = document.createElement('div')
  el.id = 'pixel-scene'
  el.innerHTML = `
    <canvas class="ps-art"></canvas>
    <div class="ps-label" hidden></div>
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
  const outlineOf = new Map(layers.filter(l => l.hoverLabel).map(l => [l, outlineDots(layerDotsOf.get(l))]))
  // タップで出すレイヤーは、出しているものだけ描く（元の重なり順のまま）
  const shown = new Set()
  let hovered = null   // カーソルを合わせている hoverLabel のレイヤー（縁取りする）
  let base = null   // 瞬きのあと戻す、目を開けた絵
  const draw = () => {
    ctx.clearRect(0, 0, W, H)
    for (const l of layers) {
      if (l.blink || (l.showOnTap && !shown.has(l))) continue
      paint(layerDotsOf.get(l))
      if (l === hovered) paint(outlineOf.get(l))   // 縁取りはそのレイヤーのすぐ上（手前のレイヤーより奥）に描く
    }
    base = ctx.getImageData(0, 0, W, H)
  }
  draw()

  // タップ: 押したドットが showOnTap のレイヤーに当たれば、そのレイヤーで出すものを切り替える。onTap のレイヤーならその関数を呼ぶ
  const tapLayers = layers.filter(l => l.showOnTap)
  const hitArea = new Map()   // 押すレイヤー → 色のあるドットの "x,y"
  for (const target of [...tapLayers.map(l => l.showOnTap), ...layers.filter(l => l.onTap || l.hoverLabel)]) {
    if (!hitArea.has(target)) hitArea.set(target, new Set(layerDotsOf.get(target).map(d => `${d.x},${d.y}`)))
  }
  const hitTarget = e => {
    const r = cv.getBoundingClientRect()
    const key = `${Math.floor((e.clientX - r.left) / r.width * W) + minX},${Math.floor((e.clientY - r.top) / r.height * H) + minY}`
    for (const [target, area] of hitArea) if (area.has(key)) return target
    return null
  }
  cv.addEventListener('click', e => {
    const target = hitTarget(e)
    if (!target) return
    if (target.onTap) { target.onTap(); return }
    for (const l of tapLayers) {
      if (l.showOnTap !== target) continue
      if (shown.has(l)) shown.delete(l)
      else shown.add(l)
    }
    draw()
  })
  // カーソルを合わせたとき: 押せるところは指マーク、hoverLabel のレイヤーは縁取りと文字を出す
  const labelEl = el.querySelector('.ps-label')
  const setHovered = l => {
    if (l === hovered) return
    hovered = l
    draw()
    labelEl.hidden = !l
    if (!l) return
    // 文字はレイヤーの色のあるドットの真上、縁取りの 1 ドット上に置く
    const ds = layerDotsOf.get(l)
    const r = cv.getBoundingClientRect(), s = r.width / W
    const x0 = Math.min(...ds.map(d => d.x)), x1 = Math.max(...ds.map(d => d.x)) + 1, y0 = Math.min(...ds.map(d => d.y))
    labelEl.textContent = l.hoverLabel
    labelEl.style.left = `${r.left + ((x0 + x1) / 2 - minX) * s}px`
    labelEl.style.top = `${r.top + (y0 - 2 - minY) * s}px`
  }
  cv.addEventListener('mousemove', e => {
    const target = hitTarget(e)
    cv.style.cursor = target && (target.onTap || tapLayers.some(l => l.showOnTap === target)) ? 'pointer' : ''
    setHovered(target?.hoverLabel ? target : null)
  })
  cv.addEventListener('mouseleave', () => setHovered(null))

  // 瞬き: 目を閉じた目元を一瞬だけ重ね、元の絵に戻す
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

  // ドットが潰れないよう、画面の物理ピクセルの整数倍で拡大する（スマホは 1px = 2〜3 ピクセルなので細かく刻める）
  const fit = () => {
    setHovered(null)   // 大きさが変わると文字の位置がずれるので、いったん消す
    const dpr = devicePixelRatio || 1
    const fitW = innerWidth < innerHeight ? FIT_W_PORTRAIT : FIT_W
    const s = Math.max(1, Math.floor(Math.min(innerWidth * fitW / W, innerHeight * FIT_H / H) * dpr)) / dpr   // 1 ドットの大きさ (px)
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
  const onKey = e => { if (e.code === 'Escape' && !isDocViewerOpen()) { close(); e.stopPropagation() } }   // 開発資料を開いている間は、そちらを先に閉じる
  el.addEventListener('click', e => { if (e.target === el) close() })   // 絵の外側をタップ
  el.querySelector('.ps-close').addEventListener('click', close)
  addEventListener('resize', fit)
  addEventListener('keydown', onKey, true)

  document.body.append(el)
  pageEl = el
}
