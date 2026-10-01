// ============================================================
//  全画面ボタン — HUD 左上。押すとアドレスバー等を隠して全画面に
//  Fullscreen API 非対応（iPhone の Safari）や、ホーム画面から
//  アプリとして開いているときはボタンを出さない
// ============================================================

const ICON_ENTER = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>'
const ICON_EXIT  = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>'

export function initFullscreenButton(btn) {
  const doc = document
  const enabled = doc.fullscreenEnabled || doc.webkitFullscreenEnabled
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
    || navigator.standalone
  if (!enabled || standalone) { btn.remove(); return }

  const current = () => doc.fullscreenElement || doc.webkitFullscreenElement
  const update = () => {
    const on = !!current()
    btn.innerHTML = on ? ICON_EXIT : ICON_ENTER
    btn.setAttribute('aria-label', on ? '全画面を終了' : '全画面')
  }

  btn.addEventListener('click', () => {
    const el = doc.documentElement
    if (current()) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc)
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el)?.catch?.(() => {})
    btn.blur()
  })
  doc.addEventListener('fullscreenchange', update)
  doc.addEventListener('webkitfullscreenchange', update)
  update()
  btn.hidden = false
}
