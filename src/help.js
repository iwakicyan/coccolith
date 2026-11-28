// ============================================================
//  操作方法 — HUD 3行目のスピーカーの横の ⓘ ボタンで開くパネル
//  キーボードとタッチの操作を並べる。文言は i18n.js（helpKeys / helpTouch）
// ============================================================

import { t, onLangChange } from './i18n.js'

const ICON_INFO = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6"/><path d="M8 7.2 V11.6"/><circle cx="8" cy="4.9" r="0.35" fill="currentColor"/></svg>'

export function initHelp(btn, panel) {
  btn.innerHTML = ICON_INFO
  const section = (titleKey, rowsKey) => {
    const title = document.createElement('div')
    title.className = 'help-title'
    title.textContent = t(titleKey)
    const list = document.createElement('div')
    list.className = 'help-list'
    for (const [k, v] of t(rowsKey)) {
      const key = document.createElement('span'); key.className = 'help-key'; key.textContent = k
      const val = document.createElement('span'); val.textContent = v
      list.append(key, val)
    }
    return [title, list]
  }
  const draw = () => {
    btn.setAttribute('aria-label', t('help'))
    panel.replaceChildren(...section('helpKeysTitle', 'helpKeys'), ...section('helpTouchTitle', 'helpTouch'))
  }
  onLangChange(draw)   // 最初の書き込みもここで

  const setOpen = open => {
    panel.classList.toggle('open', open)
    btn.classList.toggle('open', open)
    btn.setAttribute('aria-expanded', open)
  }
  btn.addEventListener('click', () => { setOpen(!panel.classList.contains('open')); btn.blur() })
  document.addEventListener('pointerdown', e => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) setOpen(false)
  })
}
