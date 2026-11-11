import * as THREE from 'three'
import { COUNTER_URL } from './visitCounter.js'
import { t } from './i18n.js'
import { ITA_FACE } from '../my-3d-parts/parts/ita.js'

// ============================================================
//  板の書き込み — だれでも名前なしで書き残せて、書いたらすぐ出る（保存は counter/ の Worker の /notes）
//  addBoardNotes(ita, board): 板の表に、その板の新しい書き込み NOTES_ON_BOARD 件を白い紙に書いてピンで留めたように貼る
//  openBoardNotes(board):     書き込みのページ（その板の書き込みの一覧と入力欄）を開く
//  文字数の上限・URL の禁止・連投の間隔は Worker が見る（ここでは同じ上限で先に止めるだけ）
// ============================================================

const NOTES_URL = COUNTER_URL ? COUNTER_URL + '/notes' : ''
export const NOTES_ON_BOARD = 5   // 板の表に出す件数（新しい順）
const PIN_KEY = 'coccolith.notePin'   // 前に選んだピンの色（localStorage）
const NOTE_MAX = 60               // 1 回に書ける文字数（counter/worker.js と同じ）
const INK = '#4a3626'             // 紙の字と縁の色（板の輪郭線と同じ濃い茶）
const FONT_FAMILY = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif'

const boards = {}   // board → { notes, draw }。書き込んだら同じ板の表も描き直す

async function fetchNotes(board) {
  if (!NOTES_URL) return []
  const r = await fetch(`${NOTES_URL}?board=${board}`)
  const { notes } = await r.json()
  return Array.isArray(notes) ? notes : []
}

// 字を幅 maxW に収まるよう 1 文字ずつ折り返す
function wrap(ctx, text, maxW) {
  const lines = []
  let line = ''
  for (const ch of text) {
    if (line && ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch }
    else line += ch
  }
  if (line) lines.push(line)
  return lines
}

// 板の表に、書き込みを 1 件ずつ白い紙に書いてピンで留めたように貼る。ita: createIta の root、board: 板の番号（1〜）
//   紙の大きさは文字数で 3 段階（PAPER_SIZES）。字の大きさはどの紙でも同じ（入りきらないときだけ小さくする）
//   貼る場所はなるべく散らす：古いものから順に、id で決まる候補 PLACE_TRIES か所のうち、もう貼った紙からいちばん離れた所に貼る
//   一度貼った紙の場所は覚えておき、新しい書き込みが来ても動かさない（読み込み直すと古いものから決め直す）。傾きは id で決める
//   新しいものほど手前に重ねる。重ねる間隔 LAYER はピンの厚みより大きくして、下の紙のピンが上の紙を突き抜けないようにする
const PAPER_SIZES = [   // max: この文字数未満ならこの大きさ（板のモデル単位。板の横幅は約 3.9）
  { max: 20, w: 0.62, h: 0.5 },
  { max: 40, w: 0.84, h: 0.68 },
  { max: Infinity, w: 1.0, h: 0.84 },
]
const PX_PER_UNIT = 480   // 紙のキャンバスの、モデル単位あたりの画素
const FONT = 0.07         // 字の大きさ（モデル単位）
const LAYER = 0.03        // 紙を重ねる間隔（モデル単位）
const PLACE_TRIES = 32    // 貼る場所の候補の数
const paperSize = text => PAPER_SIZES.find(s => [...text].length < s.max)
// ピンの色（書く人が選ぶ。counter/worker.js の NOTE_PINS と同じ名前）
const PINS = { red: '#ff3b30', blue: '#0a5cff', yellow: '#ffc21a', green: '#2fb84f' }
const pinMats = Object.fromEntries(Object.entries(PINS).map(([k, c]) => [k, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.45 })]))
const pinGeo = new THREE.SphereGeometry(0.035, 10, 6).scale(1, 1, 0.5)
const paperGeo = new THREE.PlaneGeometry(1, 1)   // 紙の大きさは scale で
// id から 0〜1 の決まった値を出す（k で別の値）
const hash = (id, k) => { const x = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }

// 紙のキャンバスを描く。上はピンの分あける
function paperCanvas(text, w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * PX_PER_UNIT)
  canvas.height = Math.round(h * PX_PER_UNIT)
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height, pad = 0.06 * PX_PER_UNIT, top = 0.12 * PX_PER_UNIT
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = INK
  ctx.lineWidth = 0.008 * PX_PER_UNIT
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth)
  let size = Math.round(FONT * PX_PER_UNIT), lines
  for (;;) {
    ctx.font = `bold ${size}px ${FONT_FAMILY}`
    lines = wrap(ctx, text, W - pad * 2)
    if (lines.length * size * 1.35 <= H - top - pad || size <= 12) break
    size -= 2
  }
  ctx.fillStyle = INK
  ctx.textBaseline = 'top'
  lines.forEach((l, k) => ctx.fillText(l, pad, top + k * size * 1.35))
  return canvas
}

// minY: 紙の下の端をこれより下にしない（ita のローカルの高さ。地面に埋まっている分をよけるのに使う）
export function addBoardNotes(ita, board, { minY = -Infinity } = {}) {
  const F = ITA_FACE
  const layer = new THREE.Group()
  layer.name = '板の紙'
  ita.add(layer)
  const placed = new Map()   // id → { x, y, w, h }（一度決めた場所）
  const y0 = Math.max(F.y0, minY)
  // ほかの紙との間（重なっていれば負）。紙の縁どうしの、x と y の離れ具合の大きいほう
  const gap = (a, b) => Math.max(Math.abs(a.x - b.x) - (a.w + b.w) / 2, Math.abs(a.y - b.y) - (a.h + b.h) / 2)
  const place = (n, others) => {
    const { w, h } = paperSize(n.text)
    let best = null, bestScore = -Infinity
    for (let k = 0; k < PLACE_TRIES; k++) {
      const c = {
        x: THREE.MathUtils.lerp(F.x0 + w / 2, F.x1 - w / 2, hash(n.id, 10 + k * 2)),
        y: THREE.MathUtils.lerp(y0 + h / 2, F.y1 - h / 2, hash(n.id, 11 + k * 2)),
        w, h,
      }
      const score = others.length ? Math.min(...others.map(o => gap(c, o))) : 0
      if (score > bestScore) { best = c; bestScore = score }
    }
    return best
  }

  const draw = notes => {
    for (const c of [...layer.children]) {
      c.children[0].material.map.dispose()
      c.children[0].material.dispose()
      layer.remove(c)
    }
    const shown = notes.slice(0, NOTES_ON_BOARD)
    // 場所を決める（まだ決めていないものだけ、古いものから）。外れた紙の場所は忘れる
    const ids = new Set(shown.map(n => n.id))
    for (const id of placed.keys()) if (!ids.has(id)) placed.delete(id)
    for (const n of [...shown].reverse()) if (!placed.has(n.id)) placed.set(n.id, place(n, [...placed.values()]))
    shown.forEach((n, i) => {
      const { w, h } = paperSize(n.text)
      const tex = new THREE.CanvasTexture(paperCanvas(n.text, w, h))
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      const g = new THREE.Group()
      g.name = `紙 ${n.id}`
      const paper = new THREE.Mesh(paperGeo, new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 }))
      paper.scale.set(w, h, 1)
      const pin = new THREE.Mesh(pinGeo, pinMats[n.pin] ?? pinMats.red)
      pin.position.set(0, h / 2 - 0.07, 0.005)
      g.add(paper, pin)
      const { x, y } = placed.get(n.id)
      g.position.set(x, y, F.z + (shown.length - i) * LAYER)   // 新しいもの（i が小さい）ほど手前
      g.rotation.z = (hash(n.id, 3) - 0.5) * 0.12   // ±3.4°
      layer.add(g)
    })
  }

  const entry = boards[board] ??= { notes: [], draws: [] }
  entry.draws.push(draw)
  fetchNotes(board).then(notes => { entry.notes = notes; draw(notes) }).catch(() => { /* 読めなければ何も貼らない */ })
}

// --- 書き込みのページ ------------------------------------------
let pageEl = null
export const isBoardNotesOpen = () => !!pageEl

const ERRORS = {   // Worker の error → 文言（i18n.js）
  url: () => t('noteErrUrl'),
  long: () => t('noteErrLong', NOTE_MAX),
  empty: () => t('noteErrEmpty'),
  origin: () => t('noteErrOrigin'),
}

export function openBoardNotes(board) {
  if (pageEl) return
  const entry = boards[board] ??= { notes: [], draws: [] }
  const el = document.createElement('div')
  el.id = 'board-notes'
  el.innerHTML = `
    <div class="bn-title">BOARD ${board}</div>
    <ul class="bn-list"></ul>
    <form class="bn-form">
      <textarea rows="2" maxlength="${NOTE_MAX}" placeholder="${t('notePlaceholder')}"></textarea>
      <div class="bn-row"><span class="bn-pins">${Object.entries(PINS).map(([k, c]) => `<button type="button" class="bn-pin" data-pin="${k}" style="--pin:${c}" aria-label="${k}"></button>`).join('')}</span><span class="bn-count">0/${NOTE_MAX}</span></div>
      <div class="bn-msg"></div>
      <div class="bn-buttons">
        <button type="button" class="bn-close">CLOSE</button>
        <button type="submit" class="bn-ok">POST</button>
      </div>
    </form>`
  const list = el.querySelector('.bn-list')
  const input = el.querySelector('textarea')
  const msg = el.querySelector('.bn-msg')
  const count = el.querySelector('.bn-count')
  const ok = el.querySelector('.bn-ok')
  // ピンの色を選ぶ（前に選んだ色を覚えておく）
  let pin = 'red'
  try { if (PINS[localStorage.getItem(PIN_KEY)]) pin = localStorage.getItem(PIN_KEY) } catch { /* 覚えられなくてもよい */ }
  const pinBtns = [...el.querySelectorAll('.bn-pin')]
  const setPin = k => {
    pin = k
    pinBtns.forEach(b => b.classList.toggle('on', b.dataset.pin === k))
    try { localStorage.setItem(PIN_KEY, k) } catch { /* 覚えられなくてもよい */ }
  }
  pinBtns.forEach(b => b.addEventListener('click', () => setPin(b.dataset.pin)))
  setPin(pin)

  const fmt = at => {
    const d = new Date(at)
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
  }
  const render = notes => {
    list.replaceChildren(...(notes.length ? notes : [null]).map(n => {
      const li = document.createElement('li')
      if (!n) { li.className = 'bn-empty'; li.textContent = t('noteEmptyList') }
      else {
        const t = document.createElement('span'); t.textContent = n.text
        const d = document.createElement('time'); d.textContent = fmt(n.at)
        li.append(t, d)
      }
      return li
    }))
  }
  const refresh = notes => {
    entry.notes = notes
    render(notes)
    for (const d of entry.draws) d(notes)
  }
  render(entry.notes)
  fetchNotes(board).then(refresh).catch(() => { msg.textContent = t('noteLoadFailed') })

  input.addEventListener('input', () => { count.textContent = `${[...input.value].length}/${NOTE_MAX}`; msg.textContent = '' })
  // Enter で書き込む（Shift+Enter と変換中の Enter は除く）
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.querySelector('form').requestSubmit() }
    if (e.key === 'Escape') close()
  })
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) { msg.textContent = ERRORS.empty(); return }
    ok.disabled = true
    try {
      const r = await fetch(NOTES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board, text, pin }) })
      const res = await r.json()
      if (res.note) {
        input.value = ''
        count.textContent = `0/${NOTE_MAX}`
        msg.textContent = t('notePosted')
        refresh([res.note, ...entry.notes])
      } else if (res.error === 'wait') msg.textContent = t('noteWait', res.wait)
      else msg.textContent = ERRORS[res.error]?.() ?? t('noteFailed')
    } catch {
      msg.textContent = t('noteFailed')
    }
    ok.disabled = false
  })

  const close = () => { el.remove(); pageEl = null }
  el.querySelector('.bn-close').addEventListener('click', close)
  el.addEventListener('pointerdown', e => { if (e.target === el) close() })   // 外の暗いところを押しても閉じる

  document.body.append(el)
  pageEl = el
  input.focus({ preventScroll: true })
}
