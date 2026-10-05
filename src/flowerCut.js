import * as THREE from 'three'

// ============================================================
//  花の切り抜き — イーゼルのキャンバスの絵（64x64）を10頂点で切り抜いて、花壇の茎の先に咲かせる
//  キャンバスをタップすると「画像切り抜きページ」（2D）を開き、頂点をドラッグで動かす。ok で花に反映
//  頂点は画像の左上を (0,0)、右下を (1,1) とした座標。localStorage に残す
// ============================================================

const STORAGE_KEY = 'coccolith.flowerCut'
const N = 10

// 初期の切り抜き：画像の中心を囲む正十角形
function defaultPoints() {
  return Array.from({ length: N }, (_, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / N
    return [0.5 + 0.3 * Math.cos(a), 0.5 + 0.3 * Math.sin(a)]
  })
}

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (Array.isArray(p) && p.length === N && p.every(q => q.length === 2 && q.every(Number.isFinite))) return p
  } catch { /* 読めなければ初期の形 */ }
  return defaultPoints()
}
function save(points) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(points)) } catch { /* 保存できなくても今回は効く */ }
}

let points = load()

// --- 花のジオメトリ -----------------------------------------
// 茎のジオメトリ（createFlowerStemGeometry）と同じ単位で、茎の先端 tip に花を付ける
// 絵の大きさは切り抜きによらず一定（IMAGE_SIZE）。切り抜いた範囲の中心を先端の少し上に置く
const IMAGE_SIZE = 0.5   // 画像全体の一辺（茎の高さ 1 に対して）

export function createFlowerGeometry(tip) {
  // 画像の座標（下が v=0）で形を作ると、ShapeGeometry の UV がそのまま画像の UV になる
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, 1 - y)))
  const geo = new THREE.ShapeGeometry(shape)
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  const cx = (bb.min.x + bb.max.x) / 2, h = bb.max.y - bb.min.y
  // 位置だけ動かす（UV は作ったときの画像座標のまま）
  geo.translate(-cx, -bb.min.y, 0)
  geo.scale(IMAGE_SIZE, IMAGE_SIZE, 1)
  geo.translate(tip[0], tip[1] - h * IMAGE_SIZE * 0.2, tip[2] ?? 0)   // 下の端を先端に少しかぶせる
  geo.computeVertexNormals()
  return geo
}

// --- 画像切り抜きページ ----------------------------------------
let editorEl = null
export const isFlowerCutOpen = () => !!editorEl

// imageSrc: 切り抜く画像、onOk(points): ok を押したとき（頂点は保存済み）
export function openFlowerCut(imageSrc, onOk) {
  if (editorEl) return
  let work = points.map(p => [...p])

  const SVG = 'http://www.w3.org/2000/svg'
  const el = document.createElement('div')
  el.id = 'flower-cut'
  el.innerHTML = `
    <div class="fc-title">花の切り抜き</div>
    <div class="fc-hint">点をドラッグして、花にする範囲を囲んでください</div>
    <div class="fc-stage">
      <img alt="" draggable="false">
      <svg viewBox="0 0 1 1" preserveAspectRatio="none">
        <path class="fc-shade" fill-rule="evenodd"/>
        <polygon class="fc-poly"/>
      </svg>
    </div>
    <div class="fc-buttons">
      <button class="fc-reset">初期の形</button>
      <button class="fc-cancel">やめる</button>
      <button class="fc-ok">ok</button>
    </div>`
  el.querySelector('img').src = imageSrc
  const stage = el.querySelector('.fc-stage')
  const svg = el.querySelector('svg')
  const shade = el.querySelector('.fc-shade')
  const poly = el.querySelector('.fc-poly')

  // 頂点のつまみ（SVG の viewBox は 0〜1 なので、丸が潰れないよう HTML の要素で置く）
  const handles = work.map((_, i) => {
    const h = document.createElement('div')
    h.className = 'fc-handle'
    h.dataset.i = i
    stage.append(h)
    return h
  })

  const draw = () => {
    const pts = work.map(([x, y]) => `${x},${y}`).join(' ')
    poly.setAttribute('points', pts)
    shade.setAttribute('d', `M0,0H1V1H0Z M${work.map(([x, y]) => `${x},${y}`).join('L')}Z`)   // 切り抜く範囲の外だけ暗く
    handles.forEach((h, i) => {
      h.style.left = `${work[i][0] * 100}%`
      h.style.top  = `${work[i][1] * 100}%`
    })
  }
  draw()

  // ドラッグ（マウス・タッチ共通）
  let drag = null
  stage.addEventListener('pointerdown', e => {
    const h = e.target.closest('.fc-handle')
    if (!h) return
    drag = { i: +h.dataset.i, id: e.pointerId }
    h.setPointerCapture(e.pointerId)
    h.classList.add('active')
    e.preventDefault()
  })
  stage.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return
    const r = svg.getBoundingClientRect()
    const clamp = v => Math.max(0, Math.min(1, v))
    work[drag.i] = [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)]
    draw()
  })
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return
    handles[drag.i].classList.remove('active')
    drag = null
  }
  stage.addEventListener('pointerup', endDrag)
  stage.addEventListener('pointercancel', endDrag)
  stage.addEventListener('lostpointercapture', endDrag)

  const close = () => { el.remove(); editorEl = null }
  el.querySelector('.fc-reset').addEventListener('click', () => { work = defaultPoints(); draw() })
  el.querySelector('.fc-cancel').addEventListener('click', close)
  el.querySelector('.fc-ok').addEventListener('click', () => {
    points = work
    save(points)
    close()
    onOk(points)
  })

  document.body.append(el)
  editorEl = el
}
