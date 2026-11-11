import * as THREE from 'three'
import { COUNTER_URL } from './visitCounter.js'
import { ITA_FACE } from '../my-3d-parts/parts/ita.js'

// ============================================================
//  板の書き込み — だれでも名前なしで書き残せて、書いたらすぐ出る（保存は counter/ の Worker の /notes）
//  addBoardNotes(ita, board): 板の表に、その板の新しい書き込み NOTES_ON_BOARD 件を字で出す
//  openBoardNotes(board):     書き込みのページ（その板の書き込みの一覧と入力欄）を開く
//  文字数の上限・URL の禁止・連投の間隔は Worker が見る（ここでは同じ上限で先に止めるだけ）
// ============================================================

const NOTES_URL = COUNTER_URL ? COUNTER_URL + '/notes' : ''
export const NOTES_ON_BOARD = 5   // 板の表に出す件数（新しい順）
const NOTE_MAX = 60               // 1 回に書ける文字数（counter/worker.js と同じ）
const INK = '#4a3626'             // 板の字の色（板の輪郭線と同じ濃い茶）
const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif'
const CANVAS_W = 1024             // 板の字のキャンバスの横の画素（縦は字を書ける範囲の縦横比で決める）

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

// 板の表に字を描く板（透明なキャンバスを貼った平面）を付ける。ita: createIta の root、board: 板の番号（1〜）
export function addBoardNotes(ita, board) {
  const F = ITA_FACE
  const w = F.x1 - F.x0, h = F.y1 - F.y0
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = Math.round(CANVAS_W * h / w)
  const ctx = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  )
  face.name = '板の字'
  face.position.set((F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2, F.z)
  face.renderOrder = 1
  ita.add(face)

  // 新しい順に上から。字が多くて入りきらないときは字を小さくする
  const draw = notes => {
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    const shown = notes.slice(0, NOTES_ON_BOARD)
    if (!shown.length) return void (tex.needsUpdate = true)
    let size = 64, blocks
    for (;;) {
      ctx.font = `bold ${size}px ${FONT}`
      blocks = shown.map(n => wrap(ctx, n.text, W - size * 1.2))
      const total = blocks.reduce((s, b) => s + b.length, 0) * size * 1.25 + (blocks.length - 1) * size * 0.5
      if (total <= H || size <= 20) break
      size -= 4
    }
    ctx.fillStyle = INK
    ctx.textBaseline = 'top'
    let y = 0
    for (const lines of blocks) {
      ctx.fillText('・', 0, y)
      for (const l of lines) { ctx.fillText(l, size * 1.2, y); y += size * 1.25 }
      y += size * 0.5
    }
    tex.needsUpdate = true
  }

  const entry = boards[board] ??= { notes: [], draws: [] }
  entry.draws.push(draw)
  fetchNotes(board).then(notes => { entry.notes = notes; draw(notes) }).catch(() => { /* 読めなければ何も書かない */ })
}

// --- 書き込みのページ ------------------------------------------
let pageEl = null
export const isBoardNotesOpen = () => !!pageEl

const ERRORS = {
  url: 'URL は書けません',
  long: `${NOTE_MAX} 文字までです`,
  empty: '何か書いてください',
  origin: 'ここからは書けません',
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
      <textarea rows="2" maxlength="${NOTE_MAX}" placeholder="ここに書き残す（${NOTE_MAX} 文字まで・名前は出ません）"></textarea>
      <div class="bn-row"><span class="bn-msg"></span><span class="bn-count">0/${NOTE_MAX}</span></div>
      <div class="bn-buttons">
        <button type="button" class="bn-close">CLOSE</button>
        <button type="submit" class="bn-ok">WRITE</button>
      </div>
    </form>`
  const list = el.querySelector('.bn-list')
  const input = el.querySelector('textarea')
  const msg = el.querySelector('.bn-msg')
  const count = el.querySelector('.bn-count')
  const ok = el.querySelector('.bn-ok')

  const fmt = at => {
    const d = new Date(at)
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
  }
  const render = notes => {
    list.replaceChildren(...(notes.length ? notes : [null]).map(n => {
      const li = document.createElement('li')
      if (!n) { li.className = 'bn-empty'; li.textContent = 'まだ何も書かれていません' }
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
  fetchNotes(board).then(refresh).catch(() => { msg.textContent = '読み込めませんでした' })

  input.addEventListener('input', () => { count.textContent = `${[...input.value].length}/${NOTE_MAX}`; msg.textContent = '' })
  // Enter で書き込む（Shift+Enter と変換中の Enter は除く）
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.querySelector('form').requestSubmit() }
    if (e.key === 'Escape') close()
  })
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) { msg.textContent = ERRORS.empty; return }
    ok.disabled = true
    try {
      const r = await fetch(NOTES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board, text }) })
      const res = await r.json()
      if (res.note) {
        input.value = ''
        count.textContent = `0/${NOTE_MAX}`
        msg.textContent = '書きました'
        refresh([res.note, ...entry.notes])
      } else if (res.error === 'wait') msg.textContent = `あと ${res.wait} 秒まってください`
      else msg.textContent = ERRORS[res.error] ?? '書けませんでした'
    } catch {
      msg.textContent = '書けませんでした'
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
