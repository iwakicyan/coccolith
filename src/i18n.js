// ============================================================
//  画面の文言（日本語 / English）— 設定パネルの「言語」で切り替える
//  はじめて開いたときはブラウザの言語で決め（ja なら日本語、それ以外は English）、選んだ言語は localStorage に残す
//  index.html の固定の文言は data-i18n（中身）・data-i18n-aria（aria-label）にキーを書いておくと、ここで入れ替わる
//  JS で書く文言は t('キー') で取り、言語が変わったときに書き直したいものは onLangChange で登録する
// ============================================================

const LANG_KEY = 'coccolith.lang'
export const LANGS = [['ja', '日本語'], ['en', 'English']]

const TEXT = {
  ja: {
    ctrl: 'W/S/A/D 移動 &nbsp;|&nbsp; Q/E 旋回 &nbsp;|&nbsp; ↑↓ 見上げ/見下ろし &nbsp;|&nbsp; Tab 俯瞰切替（室内: 主観） &nbsp;|&nbsp; L ライト &nbsp;|&nbsp; Enter 決定',
    settings: '設定',
    drive: '直進',
    picPrev: '前の作品',
    picNext: '次の作品',
    fullscreen: '全画面',
    fullscreenExit: '全画面を終了',
    tabOverview: '俯瞰',
    tabBackToFp: '主観に戻る',
    tabInBack: '後ろからの視点',
    tabInFp: '主観視点',
    docPrev: '前へ',
    docNext: '次へ',
    // 設定パネル
    language: '言語',
    languageTo: name => `言語を${name}に`,
    outdoorView: '屋外の視点',
    viewBack: '後ろから',
    viewFp: '主観',
    outdoorViewTo: text => `屋外の視点を${text}に`,
    gyro: 'ジャイロ（主観のとき）',
    gyroFailed: 'ジャイロ（使えませんでした）',
    gyroTo: text => `ジャイロを${text}に`,
    handleInvert: 'ハンドルの向きを反転',
    viewRowBack: '後ろから（屋外）',
    viewRowOutFp: '主観（屋外）',
    viewRowOverview: '俯瞰',
    viewRowInBack: '後ろから（室内）',
    viewRowInFp: '主観（室内）',
    invertY: view => `${view}の上下を反転`,
    invertX: view => `${view}の左右を反転`,
    moveSpeed: '移動速度',
    moveSpeedK: k => `移動速度 ${k} 倍`,
  },
  en: {
    ctrl: 'W/S/A/D Move &nbsp;|&nbsp; Q/E Turn &nbsp;|&nbsp; ↑↓ Look up/down &nbsp;|&nbsp; Tab Overview (indoors: first-person) &nbsp;|&nbsp; L Light &nbsp;|&nbsp; Enter Select',
    settings: 'Settings',
    drive: 'Go forward',
    picPrev: 'Previous work',
    picNext: 'Next work',
    fullscreen: 'Fullscreen',
    fullscreenExit: 'Exit fullscreen',
    tabOverview: 'Overview',
    tabBackToFp: 'Back to first-person',
    tabInBack: 'View from behind',
    tabInFp: 'First-person view',
    docPrev: 'Previous',
    docNext: 'Next',
    language: 'Language',
    languageTo: name => `Switch language to ${name}`,
    outdoorView: 'Outdoor view',
    viewBack: 'Behind',
    viewFp: 'First-person',
    outdoorViewTo: text => `Set outdoor view to ${text}`,
    gyro: 'Gyro (first-person)',
    gyroFailed: 'Gyro (not available)',
    gyroTo: text => `Turn gyro ${text}`,
    handleInvert: 'Invert handle direction',
    viewRowBack: 'Behind (outdoor)',
    viewRowOutFp: 'First-person (outdoor)',
    viewRowOverview: 'Overview',
    viewRowInBack: 'Behind (indoor)',
    viewRowInFp: 'First-person (indoor)',
    invertY: view => `Invert vertical for ${view}`,
    invertX: view => `Invert horizontal for ${view}`,
    moveSpeed: 'Move speed',
    moveSpeedK: k => `Move speed ×${k}`,
  },
}

function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (TEXT[saved]) return saved
  } catch { /* 読めなければブラウザの言語で決める */ }
  return /^ja\b/i.test(navigator.language || '') ? 'ja' : 'en'
}

let lang = initialLang()
const listeners = []

export const getLang = () => lang

// キーの文言を返す。関数の文言は引数を渡して組み立てる
export function t(key, ...args) {
  const v = TEXT[lang][key] ?? TEXT.ja[key]
  return typeof v === 'function' ? v(...args) : v
}

// 言語が変わったときに呼ぶ関数を登録する（登録したときにも 1 回呼ぶので、最初の書き込みもこれに任せられる）
export function onLangChange(fn) {
  listeners.push(fn)
  fn(lang)
}

export function setLang(next) {
  if (!TEXT[next] || next === lang) return
  lang = next
  try { localStorage.setItem(LANG_KEY, lang) } catch { /* 保存できなくても今回は効く */ }
  for (const fn of listeners) fn(lang)
}

// index.html の data-i18n / data-i18n-aria を今の言語で書き直す（言語が変わるたびにも）
onLangChange(() => {
  document.documentElement.lang = lang
  for (const el of document.querySelectorAll('[data-i18n]')) el.innerHTML = t(el.dataset.i18n)
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria))
})
