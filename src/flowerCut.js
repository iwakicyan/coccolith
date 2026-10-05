import * as THREE from 'three'

// ============================================================
//  花の切り抜き — イーゼルのキャンバスの絵（64x64）を12頂点で切り抜いて、花壇の茎の先に咲かせる
//  キャンバスをタップすると「画像切り抜きページ」（2D）を開き、頂点をドラッグで動かす（RANDOM でランダムな形）。OK で花に反映
//  頂点は画像の左上を (0,0)、右下を (1,1) とした座標。保存はせず、読み込むたびにランダムな形から始める
// ============================================================

const N = 12

// 初期の形と RANDOM ボタン：中心と各頂点の距離をランダムにした形。角度の順に並べるので辺は交差しない
function randomPoints() {
  const cx = 0.3 + 0.4 * Math.random(), cy = 0.3 + 0.4 * Math.random()
  const a0 = Math.random() * 2 * Math.PI
  const clamp = v => Math.max(0, Math.min(1, v))
  return Array.from({ length: N }, (_, i) => {
    const a = a0 + (i + (Math.random() - 0.5) * 0.6) * 2 * Math.PI / N
    const r = 0.12 + 0.3 * Math.random()
    return [clamp(cx + r * Math.cos(a)), clamp(cy + r * Math.sin(a))]
  })
}

let points = randomPoints()   // 読み込むたびにランダムな形から始める（保存はしない）

// --- 花のジオメトリ -----------------------------------------
// 茎のジオメトリ（createFlowerStemGeometry）と同じ単位で、茎の先端 tip に花を付ける
// 絵の大きさは切り抜きによらず一定（IMAGE_SIZE）。切り抜いた範囲の中心を先端の少し上に置く
const IMAGE_SIZE = 1.0   // 画像全体の一辺（茎の高さ 1 に対して）

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

// imageSrc: 切り抜く画像、onOk(points): OK を押したとき
export function openFlowerCut(imageSrc, onOk) {
  if (editorEl) return
  let work = points.map(p => [...p])

  const SVG = 'http://www.w3.org/2000/svg'
  const el = document.createElement('div')
  el.id = 'flower-cut'
  el.innerHTML = `
    <div class="fc-stage">
      <img alt="" draggable="false">
      <svg viewBox="0 0 1 1" preserveAspectRatio="none">
        <path class="fc-shade" fill-rule="evenodd"/>
        <polygon class="fc-poly"/>
      </svg>
    </div>
    <div class="fc-buttons">
      <button class="fc-random">RANDOM</button>
      <button class="fc-ok">OK</button>
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
  el.querySelector('.fc-random').addEventListener('click', () => { work = randomPoints(); draw() })
  el.querySelector('.fc-ok').addEventListener('click', () => {
    points = work
    close()
    onOk(points)
  })

  document.body.append(el)
  editorEl = el
}
