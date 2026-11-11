import * as THREE from 'three'

// ============================================================
//  HUD — コンパス & vethインジケーター
// ============================================================

const _right  = new THREE.Vector3()
const _toVeth = new THREE.Vector3()
const _north  = new THREE.Vector3()
const _east   = new THREE.Vector3()

// ============================================================
//  方位磁針 — 向いている方向がいつも上。N/E/S/W の文字盤が回る
//  北 = 北極（+Y、HUD の lat が増える向き）、東 = HUD の lon が増える向き
//  上の ▲ が今向いている方向、真ん中にその方角（N, NE, …）を出す
// ============================================================
const CARDINALS = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
const POINTS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const NORTH_COLOR = '#ff6b6b'
const MARK_COLOR  = 'rgba(186,205,216,1)'   // veth の矢印と同じ色

export function createCompass(canvas) {
  const SIZE = 88
  const dpr = Math.min(window.devicePixelRatio || 1, 3)   // 文字がにじまないよう画面の解像度で描く
  canvas.width = canvas.height = Math.round(SIZE * dpr)
  canvas.style.width = canvas.style.height = SIZE + 'px'
  const ctx = canvas.getContext('2d')
  const cx = SIZE / 2, cy = SIZE / 2, R = 40
  let lastDeg = NaN

  // up: 立っている地点の外向きの法線、fwd: 向いている方向（地面に沿っていなくてよい）
  function drawCompass(up, fwd) {
    // 北: 北極（+Y）の方向を地面に沿わせたもの。極の真上では決まらないので、経度 -180° の線から極へ来たときの北にする
    _north.set(0, 1, 0).addScaledVector(up, -up.y)
    if (_north.lengthSq() < 1e-8) _north.set(up.y > 0 ? -1 : 1, 0, 0)
    _north.normalize()
    _east.crossVectors(up, _north)   // 上 × 北 = 東（lon が増える向き）
    const heading = Math.atan2(fwd.dot(_east), fwd.dot(_north))   // 北から東回りの角度 (rad)
    let deg = THREE.MathUtils.radToDeg(heading)
    if (deg < 0) deg += 360
    if (Math.abs(deg - lastDeg) < 0.2) return   // ほとんど回っていなければ描き直さない
    lastDeg = deg

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, SIZE, SIZE)

    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()

    // 目盛り（30° ごと）。向いている方向が上に来るよう、文字盤を -heading 回す
    const at = (bearingDeg, r) => {
      const a = THREE.MathUtils.degToRad(bearingDeg) - heading - Math.PI / 2
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
    }
    ctx.lineCap = 'round'
    for (let b = 0; b < 360; b += 30) {
      if (b % 90 === 0) continue   // 東西南北は文字を置く
      const [x0, y0] = at(b, R - 3), [x1, y1] = at(b, R - 7)
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke()
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [label, b] of CARDINALS) {
      const [x, y] = at(b, R - 10)
      ctx.font = b === 0 ? 'bold 12px monospace' : '10px monospace'
      ctx.fillStyle = b === 0 ? NORTH_COLOR : 'rgba(255,255,255,0.75)'
      ctx.fillText(label, x, y + 0.5)
    }
    // 北を指す細い針（文字盤と一緒に回る）
    {
      const [nx, ny] = at(0, R - 18)
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny)
      ctx.strokeStyle = NORTH_COLOR; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.globalAlpha = 1
    }

    // 上の ▲（今向いている方向。回らない）
    ctx.beginPath()
    ctx.moveTo(cx, cy - R + 1); ctx.lineTo(cx - 4, cy - R + 7); ctx.lineTo(cx + 4, cy - R + 7)
    ctx.closePath(); ctx.fillStyle = MARK_COLOR; ctx.fill()

    // 真ん中に、向いている方角
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill()
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = MARK_COLOR
    ctx.fillText(POINTS8[Math.round(deg / 45) % 8], cx, cy + 0.5)
  }

  return { drawCompass }
}

export function createVethIndicator(canvas) {
  const ctx = canvas.getContext('2d')
  let left = '', top = ''

  function drawVethIndicator(camPos, pDir, pFwd, vethPos) {
    const ww = window.innerWidth, wh = window.innerHeight
    const toVeth    = _toVeth.copy(vethPos).sub(camPos).normalize()
    const right     = _right.crossVectors(pFwd, pDir).normalize()
    const screenX   = toVeth.dot(right)
    const screenY   = toVeth.dot(pDir)
    const inFront   = toVeth.dot(pFwd)
    const orbitR    = Math.min(ww, wh) * 0.42
    const centerX   = ww / 2, centerY = wh / 2
    const margin    = 30

    let ax = inFront > 0
      ? centerX + screenX * orbitR
      : centerX - screenX * orbitR
    let ay = inFront > 0
      ? centerY - screenY * orbitR
      : centerY + screenY * orbitR

    ax = Math.max(margin, Math.min(ww - margin, ax))
    ay = Math.max(margin, Math.min(wh - margin, ay))

    // 位置は変わったときだけ書き換える
    const l = Math.round(ax - 14) + 'px', t = Math.round(ay - 14) + 'px'
    if (l !== left) canvas.style.left = left = l
    if (t !== top)  canvas.style.top  = top  = t

    const arrowAngle = Math.atan2(-screenY, screenX) + (inFront > 0 ? 0 : Math.PI)
    const bright = inFront > 0

    ctx.clearRect(0, 0, 28, 28)
    ctx.beginPath(); ctx.arc(14, 14, 12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(186,205,216,0.18)'; ctx.fill()
    ctx.strokeStyle = bright ? 'rgba(186,205,216,0.85)' : 'rgba(186,205,216,0.35)'
    ctx.lineWidth = 1; ctx.stroke()

    ctx.save(); ctx.translate(14, 14); ctx.rotate(arrowAngle)
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(2, -4); ctx.lineTo(2, 4)
    ctx.closePath()
    ctx.fillStyle = bright ? 'rgba(186,205,216,1)' : 'rgba(186,205,216,0.35)'; ctx.fill()
    ctx.restore()

    ctx.font = 'bold 7px monospace'
    ctx.fillStyle = bright ? 'rgba(186,205,216,0.9)' : 'rgba(186,205,216,0.3)'
    ctx.textAlign = 'center'
    ctx.fillText('V', 14, 17)
  }

  return { drawVethIndicator }
}
