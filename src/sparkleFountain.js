import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'

// ============================================================
//  光の粒の立ちのぼり：半径 BASE_R のあたり（縁はノイズでギザギザ）の地中 DEPTH から、丸いぽわぽわした光の粒がゆらゆら揺れながら立ちのぼり、ふわっと消える
//  粒の動きはぜんぶ頂点シェーダーで時刻から計算する（粒ごとの乱数を属性に持たせるだけ。毎フレーム JS で動かさない）
//    粒ごと：出る時刻のずれ・寿命・出る角度と半径・回る速さ・のぼる高さ・揺れ・色・大きさ
//    t（0→1 の一生）で：ゆっくり回り、揺れながらのぼる（のぼる勢いはだんだん弱まる）、明るさは出てすぐ明るく、最後に消える
//    粒は真ん中ほど明るい丸いぼかし。色を足し合わせて光らせる（AdditiveBlending）。地面の向きを上にした向きで置く
// ============================================================

const COUNT     = 1000          // 粒の数
const HEIGHT    = [10, 26]      // のぼる高さ (m)
const LIFE      = [3.5, 7]      // 1 粒の一生 (s)
const BASE_R    = [0, 50]       // 出る所の、真ん中からの半径 (m)。縁の内側に一様に散らす
// 縁のギザギザ：角度ごとの半径を、円周に沿って取ったノイズ（simplex-noise。パーリンノイズの仲間）で伸び縮みさせる
const EDGE_AMP    = 0.3         // 半径の伸び縮みの幅（BASE_R[1] に対する割合。±）
const EDGE_FREQ   = 2.2         // ギザギザの細かさ（大きな波の数の目安）
const EDGE_OCT    = 4           // 重ねる細かさの段数（多いほど縁が細かくギザギザする）
const EDGE_SEED   = 7           // 形を決める乱数の種の既定（createSparkleFountain の edgeSeed で場所ごとに変える。開くたびには変わらない）
const DEPTH     = 6             // 出る所の地中の深さ (m)。地面から湧き出すように見せる（星の丸みで下がる分も合わせて下げる）
const SPREAD    = 1.1           // てっぺんで半径が何倍に広がるか
const SPIN      = [0.01, 0.04]  // 一生のあいだに真ん中のまわりを回る量（周）
const SIZE      = [0.11, 0.28]  // 粒の大きさ (m)
const WOBBLE    = 1.2           // ゆらゆら揺れる幅 (m)
const COLORS    = [0xe2f9ff, 0xffecfa, 0xfff9dc, 0xede7ff, 0xffffff, 0xd6f4ff]   // 粒の色（順番に使う）

const rand = ([a, b]) => a + Math.random() * (b - a)

// 種から決まる乱数（ノイズの形を毎回同じにする）
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
// 角度 a での縁の半径 (m)。ノイズを円周（cos a, sin a）の上で取るので、1 周してつなぎ目が出ない。細かい段ほど弱く重ねる
function edgeRadiusOf(edgeSeed, edgeAmp = EDGE_AMP) {
  const noise = createNoise2D(mulberry32(edgeSeed))
  return a => {
  let n = 0, amp = 1, f = EDGE_FREQ, sum = 0
  for (let o = 0; o < EDGE_OCT; o++) {
    n += amp * noise(Math.cos(a) * f + o * 17.3, Math.sin(a) * f - o * 9.1)
    sum += amp; amp *= 0.5; f *= 2
  }
  return BASE_R[1] * (1 + edgeAmp * n / sum)
  }
}

// 光の粒の立ちのぼりの範囲（縁のギザギザの内側）に入るか。地面に EF のドット絵を貼る範囲にも使う（coccolith.js）
// center: 真ん中の向き / edgeSeed: createSparkleFountain と同じ種 / R: 地面の高さ（星の中心から m）/ scale: 縁の半径を何倍にするか
// edgeAmp: 縁のギザギザの伸び縮みの幅（既定は光の粒と同じ EDGE_AMP。大きいほどギザギザが強い）。返す関数は向き d を受け取る
export function sparkleAreaContainsFn(center, edgeSeed = EDGE_SEED, R, scale = 1, edgeAmp = EDGE_AMP) {
  const edgeRadius = edgeRadiusOf(edgeSeed, edgeAmp)
  const c = center.clone().normalize()
  const inv = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c).invert()
  const l = new THREE.Vector3()
  return d => {
    l.copy(d).normalize().applyQuaternion(inv)   // 立ちのぼりと同じ向き（地面の上が +y）にして、角度と真ん中からの距離を出す
    const r = Math.acos(THREE.MathUtils.clamp(l.y, -1, 1)) * R
    return r <= edgeRadius(Math.atan2(l.z, l.x)) * scale
  }
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uCurve;   // 1 / (2 × 星の半径)。真ん中から離れるほど星の丸みで地面が下がる分（r² × uCurve）
  uniform float uPixel;   // 画面の高さ / (2 tan(fov/2))。m の大きさを画面のピクセルにする
  attribute vec4 aSeed;   // x: 時刻のずれ, y: 寿命, z: 出る角度, w: 出る半径
  attribute vec4 aMove;   // x: 回る量（周）, y: のぼる高さ, z: 大きさ, w: 揺れの位相
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = fract((uTime + aSeed.x) / aSeed.y);
    float rise = 1.0 - pow(1.0 - t, 1.6);                       // のぼる勢いはだんだん弱まる
    float ang = aSeed.z + aMove.x * 6.2831853 * t;
    float r = aSeed.w * (1.0 + ${(SPREAD - 1).toFixed(2)} * rise);
    float ph = aMove.w * 6.2831853;
    vec2 wob = ${WOBBLE.toFixed(2)} * vec2(sin(uTime * 0.9 + ph), cos(uTime * 0.7 + ph * 1.3)) * t;
    float y0 = -${DEPTH.toFixed(2)} - aSeed.w * aSeed.w * uCurve;   // 出る所：地面（丸みで下がる分も）の DEPTH 下
    vec3 p = vec3(cos(ang) * r + wob.x, y0 + rise * (aMove.y + ${DEPTH.toFixed(2)}), sin(ang) * r + wob.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float fadeIn = smoothstep(0.0, 0.12, t), fadeOut = 1.0 - smoothstep(0.55, 1.0, t);
    vAlpha = fadeIn * fadeOut;
    vColor = aColor;
    gl_PointSize = aMove.z * (1.0 - 0.4 * t) * uPixel / -mv.z;
  }
`
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float d = dot(q, q);
    if (d > 1.0) discard;
    float glow = (1.0 - d) * (1.0 - d);                          // 真ん中ほど明るい丸いぼかし
    vec3 c = vColor * glow;
    gl_FragColor = vec4(c * vAlpha, 1.0);
  }
`

// dir: 置く向き（星の中心から）/ ground: その向きの地面の高さ（星の中心から m）/ edgeSeed: 縁のギザギザの形を決める乱数の種
export function createSparkleFountain({ scene, dir, ground, edgeSeed = EDGE_SEED }) {
  const edgeRadius = edgeRadiusOf(edgeSeed)
  const seed = new Float32Array(COUNT * 4), move = new Float32Array(COUNT * 4), color = new Float32Array(COUNT * 3)
  const c = new THREE.Color()
  for (let i = 0; i < COUNT; i++) {
    const life = rand(LIFE)
    // 縁がいちばん外へ出る所まで含む円の中に一様に散らし、その角度の縁より外なら選び直す
    const rMax = BASE_R[1] * (1 + EDGE_AMP)
    let a = 0, r = 0
    for (let n = 0; n < 50; n++) {
      a = Math.random() * Math.PI * 2
      r = Math.sqrt(BASE_R[0] ** 2 + Math.random() * (rMax ** 2 - BASE_R[0] ** 2))
      if (r <= edgeRadius(a)) break
    }
    seed.set([Math.random() * life, life, a, r], i * 4)
    move.set([rand(SPIN) * (Math.random() < 0.5 ? -1 : 1), rand(HEIGHT), rand(SIZE), Math.random()], i * 4)
    c.set(COLORS[i % COLORS.length])
    color.set([c.r, c.g, c.b], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))   // 使わない（位置はシェーダーで決める）
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  geo.setAttribute('aMove', new THREE.BufferAttribute(move, 4))
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
  // 位置はシェーダーで決めるので、見えるかどうかの判定用の球は手で入れる
  const top = HEIGHT[1]
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, top / 2, 0), top / 2 + BASE_R[1] * (1 + EDGE_AMP) * SPREAD + WOBBLE)

  const uniforms = { uTime: { value: 0 }, uPixel: { value: 500 }, uCurve: { value: 1 / (2 * ground) } }
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.name = '光の粒の立ちのぼり'
  // 地面の向きを上（+y）にして、地面の高さに置く
  points.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  points.position.copy(dir).normalize().multiplyScalar(ground)
  scene.add(points)

  const _size = new THREE.Vector2()
  // timeSec: 秒 / camera・renderer: 粒の大きさを画面に合わせる
  function update(timeSec, camera, renderer) {
    uniforms.uTime.value = timeSec
    renderer.getDrawingBufferSize(_size)
    uniforms.uPixel.value = _size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
  }
  return { points, update }
}
