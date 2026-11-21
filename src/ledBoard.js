import * as THREE from 'three'

// ============================================================
//  看板の黒板に出す電光掲示板（更新履歴）
//  文字を粗いドット格子に描いてしきい値で点灯/消灯を決め、丸いドットのマスクを重ねて LED に見せる
//  1 行に収まらない行は、頭で止まる → 左へ流す → 末尾で止まる → 頭に戻る、をくり返す
//  遠くにいるあいだは、粗いドットの大きな笑顔を出しておく（起動時に更新履歴を作って描くと重いので）
//  sabちゃんが NEAR (m) 以内に来たら更新履歴に切り替える。PREPARE (m) 以内に来たところで先に作っておく
// ============================================================

const ROWS      = 240    // 縦のドット数（行数は ROWS / PITCH で決まる。一番下が最新）
const PITCH     = 13     // 1 行の高さ（ドット）
const FONT_PX   = 11     // 文字の大きさ（ドット）
const MARGIN    = 3      // 左右の余白（ドット）
const DOT       = 4      // 1 ドットのテクスチャ上の大きさ (px)
const SPEED     = 14     // 流れる速さ（ドット/秒）
const PAUSE     = 2.0    // 頭と末尾で止まる時間（秒）
const COLOR_DATE   = [255, 90, 40]    // 日付
const COLOR_TEXT   = [255, 170, 30]   // 本文
const COLOR_LATEST = [255, 230, 90]   // 最新の行の本文
const COLOR_OFF    = [40, 18, 6]      // 消えているドット（ほんのり見える）
const FONT = `bold ${FONT_PX}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`
const NEAR      = 10     // ここまで近づいたら更新履歴を出す (m。地面に沿った距離)
const PREPARE   = 25     // ここまで近づいたら更新履歴のキャンバスを作っておく (m)
const SMILE_ROWS = 40    // 笑顔の縦のドット数（更新履歴より粗い）
const SMILE_DOT  = 8     // 笑顔の 1 ドットのテクスチャ上の大きさ (px)
const COLOR_SMILE = [255, 200, 40]   // 笑顔の顔

const boards = []
const _frustum = new THREE.Frustum()
const _viewProj = new THREE.Matrix4()
const _sphere = new THREE.Sphere()

// 丸いドットのマスク（ドットの外側を黒で塗りつぶす。丸の中だけ下の色が見える）を、1 ドットぶんの模様を敷きつめて描く
function drawDotMask(ctx, w, h, dot) {
  const cell = document.createElement('canvas')
  cell.width = cell.height = dot
  const cctx = cell.getContext('2d')
  cctx.fillStyle = '#000'
  cctx.fillRect(0, 0, dot, dot)
  cctx.globalCompositeOperation = 'destination-out'
  cctx.beginPath()
  cctx.arc(dot / 2, dot / 2, dot * 0.38, 0, Math.PI * 2)
  cctx.fill()
  ctx.fillStyle = ctx.createPattern(cell, 'repeat')
  ctx.fillRect(0, 0, w, h)
}

// 粗いドットの大きな笑顔のテクスチャ（ドットごとに目・口の中かを計算して塗る。顔の輪郭は描かない）
function createSmileTexture(aspect) {
  const rows = SMILE_ROWS, cols = Math.round(rows * aspect)
  const low = document.createElement('canvas')
  low.width = cols; low.height = rows
  const lctx = low.getContext('2d')
  const img = lctx.createImageData(cols, rows)
  const cx = cols / 2, cy = rows / 2, R = rows * 0.44
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const u = (x + 0.5 - cx) / R, v = (y + 0.5 - cy) / R   // 顔の半径を 1 とした位置（v は下が正）
    // 顔の輪郭は描かず、目と口だけを点ける
    const eye = [-0.36, 0.36].some(ex => ((u - ex) / 0.12) ** 2 + ((v + 0.3) / 0.22) ** 2 <= 1)
    const m = Math.hypot(u, v + 0.05)
    const mouth = v > 0.12 && m >= 0.5 && m <= 0.66 && Math.abs(u) < 0.58
    const c = eye || mouth ? COLOR_SMILE : COLOR_OFF
    const i = (y * cols + x) * 4
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255
  }
  lctx.putImageData(img, 0, 0)
  const canvas = document.createElement('canvas')
  canvas.width = cols * SMILE_DOT; canvas.height = rows * SMILE_DOT
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(low, 0, 0, canvas.width, canvas.height)
  drawDotMask(ctx, canvas.width, canvas.height, SMILE_DOT)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// mesh: UV が黒板の正面に 0〜1 で張られたメッシュ、aspect: 黒板の幅/高さ
// entries: [{ date: 'YYYY-MM-DD', subject }]（新しい順）
// 最初は笑顔を出す。更新履歴は近づいたときに作る（prepare）
export function addLedBoard(mesh, aspect, entries) {
  const smile = createSmileTexture(aspect)
  const mat = mesh.material.clone()
  mat.emissive = new THREE.Color(0xffffff)
  mat.emissiveMap = smile
  mat.emissiveIntensity = 1.4
  mesh.material = mat
  boards.push({ mesh, mat, aspect, entries, smile, dir: null, full: null, showing: 'smile' })
}

// 更新履歴の電光掲示板を作る
function prepare(board) {
  const rows = ROWS
  const nLines = Math.floor((rows - 4) / PITCH)
  const cols = Math.round(rows * board.aspect)

  // 粗い格子（1 px = 1 ドット）と、表示用の大きいキャンバス
  const low = document.createElement('canvas')
  low.width = cols; low.height = rows
  const lctx = low.getContext('2d', { willReadFrequently: true })
  const canvas = document.createElement('canvas')
  canvas.width = cols * DOT; canvas.height = rows * DOT
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  // ドットの外側を黒で塗りつぶすマスク
  const mask = document.createElement('canvas')
  mask.width = canvas.width; mask.height = canvas.height
  drawDotMask(mask.getContext('2d'), mask.width, mask.height, DOT)

  // 古い順に上から並べ、最新を一番下に置く（件数が少なければ上を空ける）
  lctx.font = FONT
  const items = board.entries.slice(0, nLines).reverse()
  const top = nLines - items.length
  const lines = items.map((e, i) => {
    const date = e.date.slice(5).replace('-', '/') + ' '
    const latest = i === items.length - 1
    const dateW = lctx.measureText(date).width
    const width = dateW + lctx.measureText(e.subject).width
    return { row: top + i, date, subject: e.subject, dateW, width, latest, phase: i * 1.7 }
  })

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  board.full = { lines, cols, rows, lctx, ctx, low, mask, tex, key: '' }
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

// 毎フレーム呼ぶ（t: 経過秒、camera: 描くカメラ、sabDir: sabちゃんの向き（惑星の中心から。単位ベクトル）、radius: 地面の半径 (m)）
// sabちゃんが近いあいだだけ更新履歴を出す。描き直すたびに大きなテクスチャを GPU へ送り直すので、画面に映っているときだけ動かす
export function updateLedBoards(t, camera, sabDir, radius) {
  _viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  _frustum.setFromProjectionMatrix(_viewProj)
  for (const b of boards) {
    const g = b.mesh.geometry
    if (!b.dir) {   // 黒板の真ん中の向き（惑星の中心から）。置き終わってから測る
      if (!g.boundingSphere) g.computeBoundingSphere()
      b.mesh.updateWorldMatrix(true, false)
      b.dir = g.boundingSphere.center.clone().applyMatrix4(b.mesh.matrixWorld).normalize()
    }
    const d = radius * sabDir.angleTo(b.dir)
    if (d < PREPARE && !b.full) prepare(b)
    const show = d < NEAR ? 'full' : 'smile'
    if (show !== b.showing) {
      b.showing = show
      b.mat.emissiveMap = show === 'full' ? b.full.tex : b.smile
    }
    if (show !== 'full') continue
    if (_frustum.intersectsSphere(_sphere.copy(g.boundingSphere).applyMatrix4(b.mesh.matrixWorld))) draw(b.full, t)
  }
}
