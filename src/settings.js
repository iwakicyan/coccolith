// ============================================================
//  操作設定 — HUD 3行目の歯車ボタンで開くパネル
//  ハンドル（右ジョイスティック）の上下・左右の向きを、視点ごとに反転できる
//  初期状態はどの視点も「倒した方向にあるものが見えるようになる」向き。設定は localStorage に残す
//  文言は i18n.js。言語が変わったら relabel に登録した書き直しをまとめて呼ぶ
// ============================================================

import { gyro, gyroSupported, enableGyro, disableGyro } from './gyro.js'
import { t, LANGS, getLang, setLang, onLangChange } from './i18n.js'

const STORAGE_KEY = 'coccolith.handleInvert'
const SPEED_KEY   = 'coccolith.moveSpeed'
const OUTVIEW_KEY = 'coccolith.outdoorFp'
const SPEED_STEPS = [0.5, 1, 1.5]   // 移動速度の倍率の選択肢

const ICON_GEAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.27 6.82 L15.14 7.07 L15.14 8.93 L13.27 9.18 L12.56 10.89 L13.71 12.39 L12.39 13.71 L10.89 12.56 L9.18 13.27 L8.93 15.14 L7.07 15.14 L6.82 13.27 L5.11 12.56 L3.61 13.71 L2.29 12.39 L3.44 10.89 L2.73 9.18 L0.86 8.93 L0.86 7.07 L2.73 6.82 L3.44 5.11 L2.29 3.61 L3.61 2.29 L5.11 3.44 L6.82 2.73 L7.07 0.86 L8.93 0.86 L9.18 2.73 L10.89 3.44 L12.39 2.29 L13.71 3.61 L12.56 5.11Z"/><circle cx="8" cy="8" r="2.2"/></svg>'

// 視点ごとの反転フラグ（x = 左右、y = 上下）。main.js が毎フレーム読む
// show: その行を出す場面（'outBack' / 'outFp' = 屋外でその視点にしているときだけ、'overview' = 俯瞰中だけ、'interior' = 室内にいるときだけ）
const VIEWS = [
// label: i18n.js の文言のキー
  { id: 'back',     label: 'viewRowBack',     show: 'outBack' },
  { id: 'outFp',    label: 'viewRowOutFp',    show: 'outFp' },
  { id: 'overview', label: 'viewRowOverview', show: 'overview' },
  { id: 'inBack',   label: 'viewRowInBack',   show: 'interior' },
  { id: 'fp',       label: 'viewRowInFp',     show: 'interior' },
]
const rowOf = {}   // 視点 id → パネルの行
const outdoorViewEls = []   // 「屋外の視点」の見出しと行（屋外にいるときだけ出す）
export const handleInvert = Object.fromEntries(VIEWS.map(v => [v.id, { x: false, y: false }]))
// 移動速度の倍率（屋外・室内とも）。main.js が毎フレーム読む
export const moveSpeed = { k: 1 }
// 屋外の視点（fp = true で主観、false で sabちゃんの後ろから）。main.js が毎フレーム読む
export const outdoorView = { fp: false }
let lastScene = { overview: false, interior: false }

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    for (const v of VIEWS) {
      if (saved[v.id]) handleInvert[v.id] = { x: !!saved[v.id].x, y: !!saved[v.id].y }
    }
  } catch { /* 読めなければ初期設定のまま */ }
  try {
    const k = Number(localStorage.getItem(SPEED_KEY))
    if (SPEED_STEPS.includes(k)) moveSpeed.k = k
  } catch { /* 読めなければ 1 倍のまま */ }
  try {
    outdoorView.fp = localStorage.getItem(OUTVIEW_KEY) === '1'
  } catch { /* 読めなければ後ろからのまま */ }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(handleInvert))
    localStorage.setItem(SPEED_KEY, String(moveSpeed.k))
    localStorage.setItem(OUTVIEW_KEY, outdoorView.fp ? '1' : '0')
  } catch { /* 保存できなくても今回は効く */ }
}

// 反転フラグ → 入力に掛ける符号
export const invSign = on => (on ? -1 : 1)

// onOutdoorView: 屋外の視点を切り替えたときに呼ぶ（main.js が sabちゃんの表示などをそろえる）
export function initSettings(btn, panel, { onOutdoorView } = {}) {
  load()
  btn.innerHTML = ICON_GEAR
  const relabels = []   // 言語が変わったときに文言を書き直す関数
  const relabel = fn => relabels.push(fn)

  // 言語（日本語 / English から1つ選ぶ）。ボタンの字はそれぞれの言語のまま
  const langTitle = document.createElement('div')
  langTitle.className = 'set-title'
  relabel(() => { langTitle.textContent = t('language') })
  const langRow = document.createElement('div')
  langRow.className = 'set-row'
  const langBtns = LANGS.map(([code, text]) => {
    const b = document.createElement('button')
    b.className = 'set-speed'
    b.textContent = text
    relabel(() => b.setAttribute('aria-label', t('languageTo', text)))
    b.addEventListener('click', () => { setLang(code); b.blur() })
    return b
  })
  relabel(() => langBtns.forEach((b, i) => {
    const on = LANGS[i][0] === getLang()
    b.classList.toggle('on', on)
    b.setAttribute('aria-pressed', on)
  }))
  langRow.append(...langBtns)

  const rows = VIEWS.map(v => {
    const row = document.createElement('div')
    row.className = 'set-row'
    rowOf[v.id] = row
    const name = document.createElement('span')
    relabel(() => { name.textContent = t(v.label) })
    row.append(name)
    for (const [axis, text, ariaKey] of [['y', '⇅', 'invertY'], ['x', '⇆', 'invertX']]) {
      const b = document.createElement('button')
      b.textContent = text
      relabel(() => b.setAttribute('aria-label', t(ariaKey, t(v.label))))
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
  relabel(() => { title.textContent = t('handleInvert') })

  // 移動速度（0.5 / 1 / 1.5 倍から1つ選ぶ）
  const speedTitle = document.createElement('div')
  speedTitle.className = 'set-title'
  relabel(() => { speedTitle.textContent = t('moveSpeed') })
  const speedRow = document.createElement('div')
  speedRow.className = 'set-row'
  const speedBtns = SPEED_STEPS.map(k => {
    const b = document.createElement('button')
    b.className = 'set-speed'
    b.textContent = `×${k}`
    relabel(() => b.setAttribute('aria-label', t('moveSpeedK', k)))
    b.addEventListener('click', () => {
      moveSpeed.k = k
      syncSpeed(); save(); b.blur()
    })
    return b
  })
  const syncSpeed = () => speedBtns.forEach((b, i) => {
    const on = SPEED_STEPS[i] === moveSpeed.k
    b.classList.toggle('on', on)
    b.setAttribute('aria-pressed', on)
  })
  syncSpeed()
  speedRow.append(...speedBtns)

  // 屋外の視点（後ろから / 主観から1つ選ぶ）。室内の視点は 俯瞰ボタンで切り替えるので、屋外にいるときだけ出す
  const viewTitle = document.createElement('div')
  viewTitle.className = 'set-title'
  relabel(() => { viewTitle.textContent = t('outdoorView') })
  const viewRow = document.createElement('div')
  viewRow.className = 'set-row'
  outdoorViewEls.push(viewTitle, viewRow)
  const viewBtns = [[false, 'viewBack'], [true, 'viewFp']].map(([fp, key]) => {
    const b = document.createElement('button')
    b.className = 'set-speed'
    relabel(() => {
      b.textContent = t(key)
      b.setAttribute('aria-label', t('outdoorViewTo', t(key)))
    })
    b.addEventListener('click', () => {
      outdoorView.fp = fp
      syncView(); save(); b.blur()
      showSettingsFor(lastScene)
      onOutdoorView?.()
    })
    return b
  })
  const syncView = () => viewBtns.forEach((b, i) => {
    const on = (i === 1) === outdoorView.fp
    b.classList.toggle('on', on)
    b.setAttribute('aria-pressed', on)
  })
  syncView()
  viewRow.append(...viewBtns)

  // ジャイロ（主観のとき端末の傾きで見回す）。iOS はここで押したときに許可を聞くので、開くたびに OFF から始める
  const gyroEls = []
  if (gyroSupported()) {
    const gyroTitle = document.createElement('div')
    gyroTitle.className = 'set-title'
    let gyroFailed = false   // 許可がもらえなかったら見出しで知らせる
    relabel(() => { gyroTitle.textContent = t(gyroFailed ? 'gyroFailed' : 'gyro') })
    const gyroRow = document.createElement('div')
    gyroRow.className = 'set-row'
    const gyroBtns = [[false, 'OFF'], [true, 'ON']].map(([on, text]) => {
      const b = document.createElement('button')
      b.className = 'set-speed'
      b.textContent = text
      relabel(() => b.setAttribute('aria-label', t('gyroTo', text)))
      b.addEventListener('click', async () => {
        b.blur()
        if (on === gyro.on) return
        if (on) {
          gyroFailed = !await enableGyro()
          gyroTitle.textContent = t(gyroFailed ? 'gyroFailed' : 'gyro')
        }
        else disableGyro()
        syncGyro()
      })
      return b
    })
    const syncGyro = () => gyroBtns.forEach((b, i) => {
      const on = (i === 1) === gyro.on
      b.classList.toggle('on', on)
      b.setAttribute('aria-pressed', on)
    })
    syncGyro()
    gyroRow.append(...gyroBtns)
    gyroEls.push(gyroTitle, gyroRow)
  }
  onLangChange(() => relabels.forEach(fn => fn()))   // 最初の書き込みもここで
  panel.append(langTitle, langRow, viewTitle, viewRow, ...gyroEls, title, ...rows, speedTitle, speedRow)

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
  lastScene = { overview, interior }
  for (const v of VIEWS) {
    const on = v.show === 'outBack' ? !interior && !outdoorView.fp
      : v.show === 'outFp' ? !interior && outdoorView.fp
      : v.show === 'overview' ? overview : interior
    if (rowOf[v.id]) rowOf[v.id].hidden = !on
  }
  for (const el of outdoorViewEls) el.hidden = !!interior
}
