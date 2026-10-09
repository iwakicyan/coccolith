// ============================================================
//  操作設定 — HUD 3行目の歯車ボタンで開くパネル
//  ハンドル（右ジョイスティック）の上下・左右の向きを、視点ごとに反転できる
//  初期状態はどの視点も「倒した方向にあるものが見えるようになる」向き。設定は localStorage に残す
// ============================================================

const STORAGE_KEY = 'coccolith.handleInvert'

const ICON_GEAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.27 6.82 L15.14 7.07 L15.14 8.93 L13.27 9.18 L12.56 10.89 L13.71 12.39 L12.39 13.71 L10.89 12.56 L9.18 13.27 L8.93 15.14 L7.07 15.14 L6.82 13.27 L5.11 12.56 L3.61 13.71 L2.29 12.39 L3.44 10.89 L2.73 9.18 L0.86 8.93 L0.86 7.07 L2.73 6.82 L3.44 5.11 L2.29 3.61 L3.61 2.29 L5.11 3.44 L6.82 2.73 L7.07 0.86 L8.93 0.86 L9.18 2.73 L10.89 3.44 L12.39 2.29 L13.71 3.61 L12.56 5.11Z"/><circle cx="8" cy="8" r="2.2"/></svg>'

// 視点ごとの反転フラグ（x = 左右、y = 上下）。main.js が毎フレーム読む
// show: その行を出す場面（'outdoor' = 屋外にいるときだけ、'overview' = 俯瞰中だけ、'interior' = 室内にいるときだけ）
const VIEWS = [
  { id: 'back',     label: '後ろから（屋外）', show: 'outdoor' },
  { id: 'overview', label: '俯瞰',             show: 'overview' },
  { id: 'inBack',   label: '後ろから（室内）', show: 'interior' },
  { id: 'fp',       label: '主観（室内）',     show: 'interior' },
]
const rowOf = {}   // 視点 id → パネルの行
export const handleInvert = Object.fromEntries(VIEWS.map(v => [v.id, { x: false, y: false }]))

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    for (const v of VIEWS) {
      if (saved[v.id]) handleInvert[v.id] = { x: !!saved[v.id].x, y: !!saved[v.id].y }
    }
  } catch { /* 読めなければ初期設定のまま */ }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(handleInvert)) } catch { /* 保存できなくても今回は効く */ }
}

// 反転フラグ → 入力に掛ける符号
export const invSign = on => (on ? -1 : 1)

export function initSettings(btn, panel) {
  load()
  btn.innerHTML = ICON_GEAR

  const rows = VIEWS.map(v => {
    const row = document.createElement('div')
    row.className = 'set-row'
    rowOf[v.id] = row
    const name = document.createElement('span')
    name.textContent = v.label
    row.append(name)
    for (const [axis, text, axisName] of [['y', '⇅', '上下'], ['x', '⇆', '左右']]) {
      const b = document.createElement('button')
      b.textContent = text
      b.setAttribute('aria-label', `${v.label}の${axisName}を反転`)
      const sync = () => {
        b.classList.toggle('on', handleInvert[v.id][axis])
        b.setAttribute('aria-pressed', handleInvert[v.id][axis])
      }
      b.addEventListener('click', () => {
        handleInvert[v.id][axis] = !handleInvert[v.id][axis]
        sync(); save(); b.blur()
      })
      sync()
      row.append(b)
    }
    return row
  })
  const title = document.createElement('div')
  title.className = 'set-title'
  title.textContent = 'ハンドルの向きを反転'
  panel.append(title, ...rows)

  const setOpen = open => {
    panel.classList.toggle('open', open)
    btn.classList.toggle('open', open)
    btn.setAttribute('aria-expanded', open)
  }
  showSettingsFor({ overview: false, interior: false })
  btn.addEventListener('click', () => { setOpen(!panel.classList.contains('open')); btn.blur() })
  document.addEventListener('pointerdown', e => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) setOpen(false)
  })
}

// 今の場面に関係する視点の行だけ出す（main.js が視点・室内の切り替えのたびに呼ぶ）
export function showSettingsFor({ overview, interior }) {
  for (const v of VIEWS) {
    const on = v.show === 'outdoor' ? !interior : v.show === 'overview' ? overview : interior
    if (rowOf[v.id]) rowOf[v.id].hidden = !on
  }
}
