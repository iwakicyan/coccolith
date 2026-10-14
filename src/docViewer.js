// ============================================================
//  開発資料ビューア — ツリーハウスのドット絵のバインダーをタップで開く、画像を 1 枚ずつ見るページ
//  画像は DOC_DIR の中に置く。サブフォルダに分けるとフォルダ名がカテゴリのタブになる（documents/icon/xxx.png → icon）
//  直下に置いた画像は MISC にまとめる。タイトルはファイル名（拡張子を除く）
//  めくる: ‹ › ボタン・左右キー・左右スワイプ。閉じる: 外側のタップ・CLOSE・Esc
// ============================================================

// 置き場所を変えるときは、ここの 2 つのパスを書き換える
const files = import.meta.glob('/documents/**/*.{png,PNG,jpg,JPG,jpeg,JPEG,webp,gif}', { eager: true, query: '?url', import: 'default' })
const DOC_DIR = '/documents/'
const MISC = 'misc'
const SWIPE_MIN = 40   // これより大きく横に動かしたらスワイプとみなす (px)

// カテゴリ → [{ title, url }]（カテゴリもファイルも名前順）
const categories = new Map()
for (const path of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
  const parts = path.slice(DOC_DIR.length).split('/')
  const cat = parts.length > 1 ? parts[0] : MISC
  if (!categories.has(cat)) categories.set(cat, [])
  categories.get(cat).push({ title: parts.at(-1).replace(/\.[^.]+$/, ''), url: files[path] })
}
const catNames = [...categories.keys()].sort((a, b) => (a === MISC) - (b === MISC) || a.localeCompare(b))   // MISC は最後

let viewerEl = null
export const isDocViewerOpen = () => !!viewerEl

export function openDocViewer() {
  if (viewerEl || !catNames.length) return
  const el = document.createElement('div')
  el.id = 'doc-viewer'
  el.innerHTML = `
    <div class="dv-tabs"></div>
    <div class="dv-stage">
      <button class="dv-prev" aria-label="前へ">‹</button>
      <img class="dv-img" alt="">
      <button class="dv-next" aria-label="次へ">›</button>
    </div>
    <div class="dv-title"></div>
    <button class="dv-close">CLOSE</button>`
  const tabsEl = el.querySelector('.dv-tabs')
  const img = el.querySelector('.dv-img')
  const titleEl = el.querySelector('.dv-title')

  let cat = catNames[0], index = 0
  const show = () => {
    const list = categories.get(cat)
    const item = list[index]
    el.dataset.cat = cat   // カテゴリごとに見た目を変えられるように（icon は大きさを揃える。index.html）
    img.src = item.url
    img.alt = item.title
    titleEl.textContent = `${item.title}  (${index + 1}/${list.length})`
    for (const b of tabsEl.children) b.classList.toggle('active', b.dataset.cat === cat)
    new Image().src = list[(index + 1) % list.length].url   // 次の 1 枚を先に読んでおく
  }
  const step = d => {
    const n = categories.get(cat).length
    index = (index + d + n) % n
    show()
  }

  // カテゴリが 1 つだけならタブは出さない
  if (catNames.length > 1) {
    for (const name of catNames) {
      const b = document.createElement('button')
      b.textContent = name.toUpperCase()
      b.dataset.cat = name
      b.addEventListener('click', () => { cat = name; index = 0; show() })
      tabsEl.append(b)
    }
  }
  el.querySelector('.dv-prev').addEventListener('click', () => step(-1))
  el.querySelector('.dv-next').addEventListener('click', () => step(1))

  // 左右スワイプでめくる
  let touchX = null
  img.addEventListener('pointerdown', e => { touchX = e.clientX })
  img.addEventListener('pointerup', e => {
    if (touchX === null) return
    const dx = e.clientX - touchX
    touchX = null
    if (Math.abs(dx) >= SWIPE_MIN) step(dx < 0 ? 1 : -1)
  })
  img.addEventListener('dragstart', e => e.preventDefault())

  const close = () => {
    el.remove()
    viewerEl = null
    removeEventListener('keydown', onKey, true)
  }
  const onKey = e => {
    if (e.code === 'Escape') close()
    else if (e.code === 'ArrowLeft') step(-1)
    else if (e.code === 'ArrowRight') step(1)
    else return
    e.stopPropagation()
  }
  el.addEventListener('click', e => { if (e.target === el || e.target.classList.contains('dv-stage')) close() })   // 画像の外側をタップ
  el.querySelector('.dv-close').addEventListener('click', close)
  addEventListener('keydown', onKey, true)

  show()
  document.body.append(el)
  viewerEl = el
}
