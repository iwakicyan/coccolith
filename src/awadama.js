import * as THREE from 'three'
import { createAwadama, AWADAMA_KINDS } from '../my-3d-parts/parts/awadama.js'

// ============================================================
//  泡玉（my-3d-parts/parts/awadama.js）を、sabちゃんのまわりの海にプカッと浮かべて、しばらく揺れたらパッと消す
//  1 つずつ：待つ（見えない）→ 浮かぶ（水の中から飛び出して少し行き過ぎ、戻って浮く）→ 揺れる（上下にゆらゆら・少し傾く）→ パッと消える → 待つ …
//  出る場所は sabちゃんから SPAWN_DIST の範囲の、水深が MIN_DEPTH 以上の海。顔の向きはランダム
//  ふだん出るのはもとの kirakira だけ。コインを投げ込んで呼んだときは AWADAMA_KINDS の 10 種類からランダム（続けて同じ種類にはしない）
//  海面の高さは出たときに getSeaLevel で測る（海面球は多面体なので、その場所の実際の面の高さ。出ている数秒のあいだの潮の動きは小さいので測り直さない）
// ============================================================

const SPAWN_DIST = [5, 100]     // sabちゃんから出る場所までの距離 (m)
const MIN_DEPTH  = 0.6          // 出る場所の水深の下限 (m)
const MIN_GAP    = 2.5          // ほかの泡玉と離す距離 (m)
const WAIT       = [1, 5]       // 消えてから次に出るまで (s)
const RISE       = 0.9          // 浮かんでくる時間 (s)
const OVERSHOOT  = 1.8          // 浮かぶときの行き過ぎ（easeOutBack の強さ）
const FLOAT      = [4, 9]       // 揺れている時間 (s)
const SINK       = 0.5          // 浮いているとき水に沈んでいる割合（高さに対して）
const BOB        = 0.06         // 上下の揺れ（高さに対して）
const BOB_PERIOD = 2.4          // 上下の揺れの周期 (s)
const TILT       = 0.07         // 傾きの揺れ (rad)

// 陰影なし（shade: false）のときに色に掛ける色。昼の色（そのまま）と夜の色（環境光 0x334455 を掛けた色）の真ん中で、昼も夜も同じにする
const TINT = new THREE.Color(0x334455).lerp(new THREE.Color(1, 1, 1), 0.5)

const rand = ([a, b]) => a + Math.random() * (b - a)
const easeOutBack = s => { const c = OVERSHOOT; return 1 + (c + 1) * (s - 1) ** 3 + c * (s - 1) ** 2 }
const _axis = new THREE.Vector3()
const _side = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1)

// count: 泡玉の数 / height: 高さ (m) / radius: 星の半径 (m) / colors: パーツの色の差し替え / shade: 陰影をつけるか（どちらも createAwadama と同じ）
// getGround(dir): その向きの地面の高さ（星の中心から m）/ getSeaLevel(dir): その向きの海面の高さ（星の中心から m）
// makeCoin(radius): kind 'coin' の泡玉にくわえさせるコイン（Object3D。表が +z）を作る。null ならコインなし
export function createAwadamaFloaters({ scene, count = 5, height = 1, radius, getGround, getSeaLevel, colors = null, shade = true, makeCoin = null }) {
  const bubbles = []
  const tinted = new Map()   // 部品のマテリアル -> TINT を掛けた写し
  const KINDS = Object.keys(AWADAMA_KINDS)
  let lastKind = 'kirakira'
  // b の泡玉を kind の種類にする（同じなら何もしない）。colors（からだの色の差し替え）は、からだが水色の種類のときだけ使う
  function setKind(b, kind) {
    if (b.kind === kind) return
    b.kind = kind
    b.holder.clear()
    const model = createAwadama({ kind, height, colors: AWADAMA_KINDS[kind].body == null ? colors : null, shade })
    // 陰影なしのときは TINT を掛けたマテリアルにする（部品のマテリアルは変えずに写し、泡玉どうしでは使い回す。どの種類もマテリアルは同じなので、新しいシェーダーは要らない）
    if (!shade) model.traverse(o => {
      if (!o.isMesh) return
      if (!tinted.has(o.material)) { const m = o.material.clone(); m.color.multiply(TINT); tinted.set(o.material, m) }
      o.material = tinted.get(o.material)
    })
    // コインは陰影のある金属のまま（TINT は掛けない）
    const slot = model.userData.coin
    if (slot && makeCoin) slot.anchor.add(makeCoin(slot.radius))
    b.holder.add(model)
  }
  function addBubble(timer) {
    const holder = new THREE.Group(); holder.name = '泡玉'
    // 最初は星の中心に置いて見えるままにする（起動時の compileAsync でシェーダーを作っておく）。最初の update で隠す
    scene.add(holder)
    const b = { holder, kind: null, phase: 'wait', timer, t: 0, life: 0, summoned: false,
      dir: new THREE.Vector3(), fwd: new THREE.Vector3(), seed: Math.random() * 10 }
    setKind(b, 'kirakira')
    bubbles.push(b)
    return b
  }
  for (let i = 0; i < count; i++) addBubble(rand(WAIT) * (i + 1) / count)

  // sabちゃん（sabDir）から SPAWN_DIST の範囲で、水深のある海の地点を探す
  //   範囲の中で場所が偏らないよう、距離は面積に比例して選ぶ（真ん中に寄りすぎない）
  function pickSpot(b, sabDir) {
    const [r0, r1] = SPAWN_DIST
    for (let n = 0; n < 24; n++) {
      _side.randomDirection().addScaledVector(sabDir, -_side.dot(sabDir)).normalize()
      _axis.crossVectors(sabDir, _side).normalize()
      const dist = Math.sqrt(r0 * r0 + Math.random() * (r1 * r1 - r0 * r0))
      const d = b.dir.copy(sabDir).applyAxisAngle(_axis, dist / radius).normalize()
      const sea = getSeaLevel(d)
      if (sea - getGround(d) < MIN_DEPTH) continue
      if (bubbles.some(o => o !== b && o.phase !== 'wait' && radius * o.dir.angleTo(d) < MIN_GAP)) continue
      b.sea = sea
      // 顔はランダムな向き
      b.fwd.randomDirection().addScaledVector(d, -b.fwd.dot(d)).normalize()
      return true
    }
    return false
  }

  // lift: 浮いている位置からの上下 (m) / tilt: 傾き
  function place(b, lift, tiltX, tiltZ) {
    const base = b.sea - SINK * height
    b.holder.setRotationFromMatrix(_m.makeBasis(_side.crossVectors(b.dir, b.fwd), b.dir, b.fwd))
    if (tiltX) b.holder.quaternion.multiply(_q.setFromAxisAngle(X, tiltX))
    if (tiltZ) b.holder.quaternion.multiply(_q.setFromAxisAngle(Z, tiltZ))
    b.holder.position.copy(b.dir).multiplyScalar(base + lift)
  }

  // dir（星の中心からの向き）の海面から、すぐに 1 つ浮かばせる（水面にコインを投げ込んだとき）。顔は faceDir（sabちゃんのいる向き）へ向ける
  //   待っている泡玉を使う。みんな出ていたら 1 つ増やす（増やしたものは、そのあとは呼ばれたときだけ出る）
  function summon(dir, faceDir) {
    const b = bubbles.find(o => o.phase === 'wait' && o.summoned) || bubbles.find(o => o.phase === 'wait') || addBubble(0)
    if (bubbles.indexOf(b) >= count) b.summoned = true
    // 種類はランダム（前に呼んだのとは違うもの）
    const others = KINDS.filter(k => k !== lastKind)
    lastKind = others[Math.floor(Math.random() * others.length)]
    setKind(b, lastKind)
    b.dir.copy(dir).normalize()
    b.sea = getSeaLevel(b.dir)
    b.fwd.copy(faceDir).addScaledVector(b.dir, -faceDir.dot(b.dir))
    if (b.fwd.lengthSq() < 1e-8) b.fwd.randomDirection().addScaledVector(b.dir, -b.fwd.dot(b.dir))
    b.fwd.normalize()
    b.phase = 'rise'; b.t = 0; b.life = rand(FLOAT); b.holder.visible = true
  }

  // ray（Raycaster）の先にいちばん近い、出ている泡玉。なければ null
  function hit(ray) {
    let best = null, bestD = Infinity
    for (const b of bubbles) {
      if (b.phase === 'wait') continue
      const h = ray.intersectObject(b.holder, true)[0]
      if (h && h.distance < bestD) { best = b; bestD = h.distance }
    }
    return best
  }
  // その場でパッと消す（タッチされたとき）
  function pop(b) { b.phase = 'wait'; b.timer = rand(WAIT); b.holder.visible = false }

  // sabDir: sabちゃんのいる向き（星の中心から）
  function update(dt, sabDir) {
    for (const b of bubbles) {
      if (b.phase === 'wait') {
        b.holder.visible = false
        if (b.summoned) continue   // 呼ばれたときだけ出る泡玉
        b.timer -= dt
        if (b.timer > 0) continue
        if (!pickSpot(b, sabDir)) { b.timer = rand(WAIT); continue }
        setKind(b, 'kirakira')   // 呼ばれて別の種類になっていたら戻す
        b.phase = 'rise'; b.t = 0; b.life = rand(FLOAT); b.holder.visible = true
      }
      // t は出てからの時間（浮かぶ → 揺れるを通しで数える。揺れが途中で跳ばないように）
      b.t += dt
      const sway = b.t + b.seed
      const bob = BOB * height * Math.sin(2 * Math.PI * sway / BOB_PERIOD)
      const tx = TILT * Math.sin(2 * Math.PI * sway / (BOB_PERIOD * 1.3))
      const tz = TILT * Math.sin(2 * Math.PI * sway / (BOB_PERIOD * 1.7) + 1)
      if (b.phase === 'rise') {
        // 水の中（てっぺんが海面の所）から、行き過ぎて戻る。揺れは少しずつ足す
        const s = Math.min(1, b.t / RISE)
        place(b, -(1 - SINK) * height * (1 - easeOutBack(s)) + bob * s, tx * s, tz * s)
        if (s >= 1) b.phase = 'float'
      } else if (b.phase === 'float') {
        place(b, bob, tx, tz)
        // 時間が来たらその場でパッと消える
        if (b.t >= RISE + b.life) pop(b)
      }
    }
  }

  return { update, summon, hit, pop, bubbles }
}
