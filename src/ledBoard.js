import * as THREE from 'three'

// ============================================================
//  看板の黒板に出す電光掲示板（更新履歴）
//  文字を粗いドット格子に描いてしきい値で点灯/消灯を決め、丸いドットのマスクを重ねて LED に見せる
//  1 行に収まらない行は、頭で止まる → 左へ流す → 末尾で止まる → 頭に戻る、をくり返す
// ============================================================

const LINES     = 8      // 表示する行数（一番下が最新）
const PITCH     = 18     // 1 行の高さ（ドット）
const FONT_PX   = 14     // 文字の大きさ（ドット）
const MARGIN    = 3      // 左右の余白（ドット）
const DOT       = 6      // 1 ドットのテクスチャ上の大きさ (px)
const SPEED     = 14     // 流れる速さ（ドット/秒）
const PAUSE     = 2.0    // 頭と末尾で止まる時間（秒）
const COLOR_DATE   = [255, 90, 40]    // 日付
const COLOR_TEXT   = [255, 170, 30]   // 本文
const COLOR_LATEST = [255, 230, 90]   // 最新の行の本文
const COLOR_OFF    = [40, 18, 6]      // 消えているドット（ほんのり見える）
const FONT = `bold ${FONT_PX}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`

const boards = []

// mesh: UV が黒板の正面に 0〜1 で張られたメッシュ、aspect: 黒板の幅/高さ
// entries: [{ date: 'YYYY-MM-DD', subject }]（新しい順）
export function addLedBoard(mesh, aspect, entries) {
  const rows = LINES * PITCH + 4
  const cols = Math.round(rows * aspect)

  // 粗い格子（1 px = 1 ドット）と、表示用の大きいキャンバス
  const low = document.createElement('canvas')
  low.width = cols; low.height = rows
  const lctx = low.getContext('2d', { willReadFrequently: true })
  const canvas = document.createElement('canvas')
  canvas.width = cols * DOT; canvas.height = rows * DOT
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  // ドットの外側を黒で塗りつぶすマスク（丸の中だけ下の色が見える）
  const mask = document.createElement('canvas')
  mask.width = canvas.width; mask.height = canvas.height
  const mctx = mask.getContext('2d')
  mctx.fillStyle = '#000'
  mctx.fillRect(0, 0, mask.width, mask.height)
  mctx.globalCompositeOperation = 'destination-out'
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    mctx.beginPath()
    mctx.arc((x + 0.5) * DOT, (y + 0.5) * DOT, DOT * 0.38, 0, Math.PI * 2)
    mctx.fill()
  }

  // 古い順に上から並べ、最新を一番下に置く（件数が少なければ上を空ける）
  lctx.font = FONT
  const items = entries.slice(0, LINES).reverse()
  const top = LINES - items.length
  const lines = items.map((e, i) => {
    const date = e.date.slice(5).replace('-', '/') + ' '
    const latest = i === items.length - 1
    const dateW = lctx.measureText(date).width
    const width = dateW + lctx.measureText(e.subject).width
    return { row: top + i, date, subject: e.subject, dateW, width, latest, phase: i * 1.7 }
  })

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = mesh.material.clone()
  mat.emissive = new THREE.Color(0xffffff)
  mat.emissiveMap = tex
  mat.emissiveIntensity = 1.4
  mesh.material = mat

  const board = { lines, cols, rows, lctx, ctx, low, mask, tex, key: '' }
  boards.push(board)
  draw(board, 0)
}

// 行の横ずれ（ドット）: 頭で止まる → 流す → 末尾で止まる → 頭に戻る
function offsetOf(line, avail, t) {
  const travel = Math.ceil(line.width - avail)
  if (travel <= 0) return 0
  const cycle = PAUSE * 2 + travel / SPEED
  const u = (t + line.phase) % cycle
  if (u < PAUSE) return 0
  return Math.min(travel, Math.floor((u - PAUSE) * SPEED))
}

function draw(board, t) {
  const { lines, cols, rows, lctx, ctx, low, mask, tex } = board
  const avail = cols - MARGIN * 2
  const offsets = lines.map(l => offsetOf(l, avail, t))
  const key = offsets.join(',')
  if (key === board.key) return   // ドット単位で動いたときだけ描き直す
  board.key = key

  // 文字を粗い格子に描く
  lctx.clearRect(0, 0, cols, rows)
  lctx.font = FONT
  lctx.textBaseline = 'top'
  lines.forEach((l, i) => {
    const y = 2 + l.row * PITCH + Math.floor((PITCH - FONT_PX) / 2)
    const x = MARGIN - offsets[i]
    lctx.save()
    lctx.beginPath()
    lctx.rect(MARGIN, y - 1, avail, PITCH)
    lctx.clip()
    lctx.fillStyle = `rgb(${COLOR_DATE})`
    lctx.fillText(l.date, x, y)
    lctx.fillStyle = `rgb(${l.latest ? COLOR_LATEST : COLOR_TEXT})`
    lctx.fillText(l.subject, x + l.dateW, y)
    lctx.restore()
  })

  // しきい値で点灯/消灯の 2 値にする（にじみをなくしてドットらしくする）
  const img = lctx.getImageData(0, 0, cols, rows)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a > 110) {
      const k = 255 / a
      d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k)
    } else {
      d[i] = COLOR_OFF[0]; d[i + 1] = COLOR_OFF[1]; d[i + 2] = COLOR_OFF[2]
    }
    d[i + 3] = 255
  }
  lctx.putImageData(img, 0, 0)

  // 拡大してドットのマスクを重ねる
  ctx.drawImage(low, 0, 0, cols * DOT, rows * DOT)
  ctx.drawImage(mask, 0, 0)
  tex.needsUpdate = true
}

// 毎フレーム呼ぶ（t: 経過秒）
export function updateLedBoards(t) {
  for (const b of boards) draw(b, t)
}
