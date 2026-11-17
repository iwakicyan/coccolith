import * as THREE from 'three'

// ============================================================
//  ふわふわ飛ぶ音符 — ドット絵のキャラの頭のあたりから ♪ を 1 つずつ出し、左右にゆらゆらしながら NOTE_HEIGHT までゆっくり昇らせて消す
//  ♪ はいつもカメラの方を向く板（THREE.Sprite）。1 つずつ透明度を変えるので、マテリアルは ♪ ごとに持つ（数が少ないので軽い）
//  pixelSprite.js の createPixelSpriteWalkers が、絵のデータに notes（コマ = { palette, width, height, grid }）があるキャラごとに 1 つ作る
// ============================================================

const NOTE_GAP    = [0.4, 1.2]   // ♪ が消えてから次の ♪ を出すまで (s)。♪ は 1 つずつ出す
const NOTE_HEIGHT = 1.5          // 頭のあたりからこの高さ (m) まで昇って消える
const NOTE_RISE   = 0.55         // 昇る速さ (m/s)
const NOTE_LIFE   = NOTE_HEIGHT / NOTE_RISE   // 1 つの ♪ が消えるまで (s)
const NOTE_SWAY   = 0.25         // 左右に揺れる幅 (m)
const NOTE_SWAY_HZ = 0.6         // 揺れる速さ（1 秒に何回）
const NOTE_FADE_IN = 0.3         // ふわっと出てくる長さ (s)
const NOTE_FADE_OUT = 1.2        // 消えていく長さ (s。最後のこの秒数で薄くなる)
const NOTE_POOL   = 1
const rand = ([a, b]) => a + Math.random() * (b - a)

const textures = new Map()
function textureOf(frame) {
  if (textures.has(frame)) return textures.get(frame)
  const cv = document.createElement('canvas')
  cv.width = frame.width; cv.height = frame.height
  const ctx = cv.getContext('2d')
  frame.grid.forEach((row, y) => row.forEach((n, x) => {
    if (!frame.palette[n]) return
    ctx.fillStyle = frame.palette[n]
    ctx.fillRect(x, y, 1, 1)
  }))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  textures.set(frame, tex)
  return tex
}

const _side = new THREE.Vector3()

// frame: ♪ の絵 / size: ♪ の高さ (m)
export function createFloatNotes({ scene, frame, size }) {
  const tex = textureOf(frame)
  const notes = []
  for (let i = 0; i < NOTE_POOL; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.05 }))
    s.scale.set(size * frame.width / frame.height, size, 1)
    s.visible = false
    s.name = '音符'
    scene.add(s)
    notes.push({ s, age: 0, alive: false, from: new THREE.Vector3(), up: new THREE.Vector3(), side: new THREE.Vector3(), phase: 0, flip: 1 })
  }
  let timer = rand([0, NOTE_GAP[1]])

  // head: ♪ を出す所（ワールド座標）/ up: その場所の上の向き（単位ベクトル）/ camera: 揺れる横の向きをカメラから見た左右にする
  function update(dt, head, up, camera) {
    const n = notes.find(n => !n.alive)
    if (n && (timer -= dt) <= 0) {   // 前の ♪ が消えてから数える
      timer = rand(NOTE_GAP)
      n.alive = true; n.age = 0
      n.phase = Math.random() * Math.PI * 2
      n.flip = Math.random() < 0.5 ? -1 : 1   // 左右どちらへ流れていくか
      n.up.copy(up)
      // カメラから見た左右（上の向きに直角）
      _side.set(1, 0, 0).applyQuaternion(camera.quaternion)
      n.side.copy(_side).addScaledVector(up, -_side.dot(up)).normalize()
      n.from.copy(head).addScaledVector(n.side, n.flip * size * 0.4)
      n.s.visible = true
    }
    for (const n of notes) {
      if (!n.alive) continue
      n.age += dt
      if (n.age >= NOTE_LIFE) { n.alive = false; n.s.visible = false; continue }
      const sway = Math.sin(n.phase + n.age * NOTE_SWAY_HZ * 2 * Math.PI) * NOTE_SWAY + n.flip * n.age * 0.12
      n.s.position.copy(n.from).addScaledVector(n.up, n.age * NOTE_RISE).addScaledVector(n.side, sway)
      n.s.material.opacity = Math.min(1, n.age / NOTE_FADE_IN, (NOTE_LIFE - n.age) / NOTE_FADE_OUT)
      n.s.material.rotation = Math.sin(n.phase + n.age * NOTE_SWAY_HZ * 2 * Math.PI) * 0.25   // 揺れに合わせて少し傾ける
    }
  }
  return { update }
}
