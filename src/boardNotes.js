import * as THREE from 'three'
import { COUNTER_URL } from './visitCounter.js'
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
const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif'

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
//   紙は PAPER_SLOTS の場所に新しい順に貼り、新しいものほど手前に重ねる。傾きは板と場所ごとに決まった小さな角度
const PAPER_W = 1.2, PAPER_H = 0.95   // 紙の大きさ（板のモデル単位。板の横幅は約 3.9）
const PAPER_PX = 512                  // 紙のキャンバスの横の画素
const FONT_PX = 44                    // 字の大きさ（紙のキャンバスの画素）。入りきらないときは小さくする
// 紙を貼る場所（字を書ける範囲 ITA_FACE の中の割合。u: 左 0〜右 1、v: 上 0〜下 1）。新しい順
const PAPER_SLOTS = [
  { u: 0.24, v: 0.26 },
  { u: 0.74, v: 0.34 },
  { u: 0.46, v: 0.70 },
  { u: 0.86, v: 0.80 },
  { u: 0.14, v: 0.76 },
]
// ピンの色（書く人が選ぶ。counter/worker.js の NOTE_PINS と同じ名前）
const PINS = { red: '#ff3b30', blue: '#0a5cff', yellow: '#ffc21a', green: '#2fb84f' }
const pinMats = Object.fromEntries(Object.entries(PINS).map(([k, c]) => [k, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.45 })]))
const paperMat = tex => new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 })
const pinGeo = new THREE.SphereGeometry(0.045, 10, 6).scale(1, 1, 0.5)
const tilt = (board, i) => { const x = Math.sin(board * 12.9898 + i * 78.233) * 43758.5453; return (x - Math.floor(x) - 0.5) * 0.12 }   // ±3.4°

function drawPaper(ctx, text) {
  const W = ctx.canvas.width, H = ctx.canvas.height, pad = W * 0.08
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = INK
  ctx.lineWidth = W * 0.012
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth)
  let size = FONT_PX, lines
  for (;;) {
    ctx.font = `bold ${size}px ${FONT}`
    lines = wrap(ctx, text, W - pad * 2)
    if (lines.length * size * 1.35 <= H - pad * 2.6 || size <= 14) break
    size -= 2
  }
  ctx.fillStyle = INK
  ctx.textBaseline = 'top'
  lines.forEach((l, k) => ctx.fillText(l, pad, pad * 1.6 + k * size * 1.35))   // 上はピンの分あける
}

// minY: 紙の下の端をこれより下にしない（ita のローカルの高さ。地面に埋まっている分をよけるのに使う）
export function addBoardNotes(ita, board, { minY = -Infinity } = {}) {
  const F = ITA_FACE
  const papers = PAPER_SLOTS.slice(0, NOTES_ON_BOARD).map((slot, i) => {
    const canvas = document.createElement('canvas')
    canvas.width = PAPER_PX
    canvas.height = Math.round(PAPER_PX * PAPER_H / PAPER_W)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(PAPER_W, PAPER_H), paperMat(tex))
    paper.name = `板の紙 ${i + 1}`
    // 字を書ける範囲からはみ出さないよう、紙の中心を寄せる
    const x = THREE.MathUtils.clamp(F.x0 + slot.u * (F.x1 - F.x0), F.x0 + PAPER_W / 2, F.x1 - PAPER_W / 2)
    const y = THREE.MathUtils.clamp(F.y1 - slot.v * (F.y1 - F.y0), Math.max(F.y0, minY) + PAPER_H / 2, F.y1 - PAPER_H / 2)
    paper.position.set(x, y, F.z + (PAPER_SLOTS.length - i) * 0.004)   // 新しいものほど手前
    paper.rotation.z = tilt(board, i)
    const pin = new THREE.Mesh(pinGeo, pinMats.red)
    pin.name = 'ピン'
    pin.position.set(0, PAPER_H / 2 - 0.1, 0.01)
    paper.add(pin)
    paper.visible = false
    ita.add(paper)
    return { paper, pin, ctx: canvas.getContext('2d'), tex }
  })

  const draw = notes => {
    papers.forEach((p, i) => {
      const n = notes[i]
      p.paper.visible = !!n
      if (!n) return
      drawPaper(p.ctx, n.text)
      p.pin.material = pinMats[n.pin] ?? pinMats.red
      p.tex.needsUpdate = true
    })
  }

  const entry = boards[board] ??= { notes: [], draws: [] }
  entry.draws.push(draw)
  fetchNotes(board).then(notes => { entry.notes = notes; draw(notes) }).catch(() => { /* 読めなければ何も貼らない */ })
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
      const r = await fetch(NOTES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board, text, pin }) })
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
