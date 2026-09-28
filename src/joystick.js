// Virtual joystick state — read each frame in main.js
export const vJoy = { lx: 0, ly: 0, rx: 0, ry: 0 }

const HANDLE_SHIFT = 6   // ハンドル画像のずれ幅 (px) — 中心からあまり動かさない

function makeJoystick(wrapEl, onMove) {
  const handle = wrapEl.querySelector('.joy-handle')
  const maxDist = wrapEl.offsetWidth / 2 - 23   // 入力の最大半径
  let touchId    = null
  let mouseActive = false

  function project(cx, cy) {
    const rect = wrapEl.getBoundingClientRect()
    let dx = cx - (rect.left + rect.width  / 2)
    let dy = cy - (rect.top  + rect.height / 2)
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > maxDist) { const s = maxDist / d; dx *= s; dy *= s }
    // 見た目: 少しだけずらし、倒した方向へハンドルの上端を向ける
    const k = HANDLE_SHIFT / maxDist
    const deg = d > 4 ? Math.atan2(dx, -dy) * 180 / Math.PI : 0
    handle.style.transform =
      `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px)) rotate(${deg}deg)`
    onMove(dx / maxDist, dy / maxDist)
  }

  function reset() {
    handle.style.transform = 'translate(-50%, -50%)'
    onMove(0, 0)
  }

  // Touch — track a single touch ID so both sticks work simultaneously
  wrapEl.addEventListener('touchstart', e => {
    e.preventDefault()
    if (touchId !== null) return
    const t = e.changedTouches[0]
    touchId = t.identifier
    project(t.clientX, t.clientY)
  }, { passive: false })

  wrapEl.addEventListener('touchmove', e => {
    e.preventDefault()
    for (const t of e.changedTouches) {
      if (t.identifier === touchId) { project(t.clientX, t.clientY); return }
    }
  }, { passive: false })

  const onTouchEnd = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchId) { touchId = null; reset(); return }
    }
  }
  wrapEl.addEventListener('touchend',   onTouchEnd)
  wrapEl.addEventListener('touchcancel', onTouchEnd)

  // Mouse (desktop testing)
  wrapEl.addEventListener('mousedown', e => {
    mouseActive = true
    project(e.clientX, e.clientY)
    e.stopPropagation()
  })
  window.addEventListener('mousemove', e => { if (mouseActive) project(e.clientX, e.clientY) })
  window.addEventListener('mouseup',   ()  => { if (mouseActive) { mouseActive = false; reset() } })
}

// 直進ボタン — 押している間だけ前進（横移動なし）。真後ろに引っ張ると後退
const REVERSE_PULL = 28   // 後退に切り替わる引っ張り量 (px)

function makeDriveButton(btn) {
  const pointers = new Map()   // id → { sx, sy, back }
  const update = () => {
    const on   = pointers.size > 0
    const back = [...pointers.values()].some(p => p.back)
    vJoy.lx = 0
    vJoy.ly = on ? (back ? 1 : -1) : 0
    btn.classList.toggle('pressed', on)
    btn.classList.toggle('reverse', back)
  }
  const press = (id, x, y) => { pointers.set(id, { sx: x, sy: y, back: false }); update() }
  const drag  = (id, x, y) => {
    const p = pointers.get(id)
    if (!p) return
    const dx = x - p.sx, dy = y - p.sy
    // ほぼ真下（後ろ）方向に一定以上引っ張ったら後退、戻したら前進
    p.back = dy > REVERSE_PULL && dy > Math.abs(dx) * 1.5
    update()
  }
  const release = id => { if (pointers.delete(id)) update() }

  btn.addEventListener('touchstart', e => {
    e.preventDefault()
    for (const t of e.changedTouches) press(t.identifier, t.clientX, t.clientY)
  }, { passive: false })
  btn.addEventListener('touchmove', e => {
    e.preventDefault()
    for (const t of e.changedTouches) drag(t.identifier, t.clientX, t.clientY)
  }, { passive: false })
  const onTouchEnd = e => { for (const t of e.changedTouches) release(t.identifier) }
  btn.addEventListener('touchend',    onTouchEnd)
  btn.addEventListener('touchcancel', onTouchEnd)

  btn.addEventListener('mousedown', e => { press('mouse', e.clientX, e.clientY); e.stopPropagation() })
  window.addEventListener('mousemove', e => drag('mouse', e.clientX, e.clientY))
  window.addEventListener('mouseup',   () => release('mouse'))
  btn.addEventListener('contextmenu', e => e.preventDefault())
}

export function initJoysticks() {
  const drive = document.getElementById('drive-btn')
  const jR = document.getElementById('joy-right')
  if (drive) makeDriveButton(drive)
  if (jR) makeJoystick(jR, (x, y) => { vJoy.rx = x; vJoy.ry = y })

  // 俯瞰ボタン → Tab KeyboardEvent を dispatch
  const tabBtn = document.getElementById('tab-btn')
  if (tabBtn) {
    const fire = e => {
      e.preventDefault()
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }))
    }
    tabBtn.addEventListener('touchend', fire)
    tabBtn.addEventListener('click',    fire)
  }
}
