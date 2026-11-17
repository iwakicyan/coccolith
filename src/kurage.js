import * as THREE from 'three'

// ============================================================
//  光の粒のクラゲ：光の粒の立ちのぼり（sparkleFountain.js）のあたりの宙に、光でできたクラゲがふわふわ漂う
//  1 匹 = かさの粒 1 つ（ドームの形に描く）＋ かさの下に垂れる触手 STRANDS 本 × DOTS 粒
//  動きはぜんぶ頂点シェーダーで時刻から計算する（粒ごとの乱数を属性に持たせるだけ。毎フレーム JS で動かさない）
//    泳ぎ：PULSE 秒ごとに、かさがキュッとすぼまってスッとのぼり、ふわっと開きながらゆっくり沈む（1 回ごとに元の高さへ戻る）
//    触手：かさの少し前の時刻の位置をなぞるので、のぼるときは遅れてついてきて、波が下へ伝わる
//    一生：LIFE 秒ごとにふわっと出て、ゆっくり流され、ふわっと消える。次の一生は別の場所に出る（場所は一生の番号から乱数で決める）
//    色を足し合わせて光らせる（AdditiveBlending）。地面の向きを上にした向きで置く
// ============================================================

const COUNT    = 36             // クラゲの数
const STRANDS  = 4              // 触手の本数
const DOTS     = 6              // 触手 1 本の粒の数
const AREA_R   = 45             // 出る所の、真ん中からの半径 (m)
const HEIGHT   = [5, 20]        // 地面からの高さ (m)
const SIZE     = [0.9, 1.7]     // かさの大きさ (m)
const PULSE    = [2.6, 3.8]     // ひと泳ぎの周期 (s)
const THRUST   = 0.28           // 周期のうち、すぼまってのぼる時間の割合
const LIFT     = 0.9            // ひと泳ぎでのぼる高さ（かさの大きさに対して）
const LIFE     = [24, 40]       // 1 匹の一生 (s)
const DRIFT    = 3              // 一生のあいだに流される距離 (m)
const LAG      = 0.16           // 触手の粒 1 つごとの遅れ (s)
const SPACING  = 0.32           // 触手の粒の間隔（かさの大きさに対して）
const COLORS   = [0xbfeeff, 0xffd0f0, 0xdcd0ff, 0xc8fff0, 0xfff0d8]   // クラゲの色（順番に使う）

const rand = ([a, b]) => a + Math.random() * (b - a)
const f2 = v => v.toFixed(3)

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uCurve;   // 1 / (2 × 星の半径)。真ん中から離れるほど星の丸みで地面が下がる分（r² × uCurve）
  uniform float uPixel;   // 画面の高さ / (2 tan(fov/2))。m の大きさを画面のピクセルにする
  attribute vec4 aJelly;  // x, y: クラゲごとの乱数, z: かさの大きさ, w: 時刻のずれ
  attribute vec3 aPart;   // x: 0 = かさ / 1〜 = 触手の何粒目, y: 触手の向き (rad), z: 未使用
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;    // 0: かさ, 1: 触手
  varying float vSquash;  // かさのすぼまり具合 0〜1

  const float TAU = 6.2831853;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // 周期の中の位置 f での、ひと泳ぎの持ち上がり（0 → 1 → 0）
  float lift(float f) {
    return f < ${f2(THRUST)} ? 1.0 - pow(1.0 - f / ${f2(THRUST)}, 2.0) : 1.0 - smoothstep(${f2(THRUST)}, 1.0, f);
  }
  // 時刻 tt での、一生 n のかさの位置
  vec3 jellyPos(float tt, float n, float life, float period) {
    float h1 = hash(vec2(n, aJelly.x * 91.7)), h2 = hash(vec2(n + 3.1, aJelly.y * 57.3)), h3 = hash(vec2(n + 7.7, aJelly.x * 13.1 + aJelly.y));
    float ang = h1 * TAU, r = ${f2(AREA_R)} * sqrt(h2);
    float age = (tt + aJelly.w) / life - n;
    vec2 xz = vec2(cos(ang), sin(ang)) * r;
    xz += vec2(cos(h3 * TAU), sin(h3 * TAU)) * ${f2(DRIFT)} * age;
    xz += 0.5 * vec2(sin(tt * 0.23 + aJelly.x * TAU), cos(tt * 0.19 + aJelly.y * TAU));
    float y = mix(${f2(HEIGHT[0])}, ${f2(HEIGHT[1])}, h3) + 1.2 * sin(age * 3.14159) - r * r * uCurve;
    y += lift(fract(tt / period + aJelly.y)) * ${f2(LIFT)} * aJelly.z;
    return vec3(xz.x, y, xz.y);
  }
  void main() {
    float life = mix(${f2(LIFE[0])}, ${f2(LIFE[1])}, aJelly.y);
    float period = mix(${f2(PULSE[0])}, ${f2(PULSE[1])}, aJelly.x);
    float n = floor((uTime + aJelly.w) / life);
    float k = aPart.x;
    float tt = uTime - k * ${f2(LAG)};
    vec3 p = jellyPos(tt, n, life, period);
    float size = aJelly.z;
    float f = fract(tt / period + aJelly.y);
    float squash = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.15, 0.45, f));
    if (k > 0.5) {
      // 触手：かさの下のふちから垂れる。すぼまるときは内へ寄る
      float rr = size * (0.24 - 0.08 * squash) * (1.0 + 0.04 * k);
      float sway = 0.06 * size * k * sin(uTime * 1.3 - k * 0.7 + aJelly.x * TAU);
      p.x += cos(aPart.y) * rr + sway;
      p.z += sin(aPart.y) * rr + sway * 0.6;
      p.y -= size * (0.18 + ${f2(SPACING)} * k);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float age = (uTime + aJelly.w) / life - n;
    vAlpha = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.85, 1.0, age));
    vColor = aColor;
    vSquash = squash;
    vKind = k > 0.5 ? 1.0 : 0.0;
    if (k > 0.5) {
      vAlpha *= (1.0 - 0.75 * k / ${f2(DOTS + 1)}) * 0.8;
      gl_PointSize = size * 0.16 * (1.0 - 0.05 * k) * uPixel / -mv.z;
    } else {
      gl_PointSize = size * 1.4 * uPixel / -mv.z;   // ドームのまわりのぼんやりした光の分も含めて大きめに
    }
  }
`
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;
  varying float vSquash;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    if (vKind > 0.5) {
      // 触手の粒：真ん中ほど明るい丸いぼかし
      float d = dot(q, q);
      if (d > 1.0) discard;
      float glow = (1.0 - d) * (1.0 - d);
      gl_FragColor = vec4(vColor * glow * vAlpha, 1.0);
      return;
    }
    // かさ：下が平らなドーム。すぼまると細く縦長になる。ふちが明るく、中はうっすら
    q.y = -q.y;                                       // 上を +
    float w = 0.62 * (1.0 - 0.22 * vSquash), h = 0.5 * (1.0 + 0.12 * vSquash), yb = -0.18;
    float dy = q.y - yb;
    float e = dy > 0.0 ? length(vec2(q.x / w, dy / h)) : length(vec2(q.x / w, dy / (h * 0.22)));
    if (e > 1.6) discard;
    float rim  = exp(-pow((e - 0.9) / 0.1, 2.0));                       // ふちの光
    float fill = (1.0 - smoothstep(0.2, 1.0, e)) * 0.28;                 // 中のうっすらした光
    float cap  = exp(-pow(length(vec2(q.x / w, (dy - h * 0.55) / h)) / 0.35, 2.0)) * 0.35;   // てっぺんの少し明るい所
    float halo = (1.0 - smoothstep(0.9, 1.6, e)) * 0.12;                 // まわりのぼんやりした光
    float glow = rim * (0.8 + 0.3 * vSquash) + fill + cap + halo;
    gl_FragColor = vec4(vColor * glow * vAlpha, 1.0);
  }
`

// dir: 置く向き（星の中心から）/ ground: その向きの地面の高さ（星の中心から m）
export function createKurage({ scene, dir, ground }) {
  const per = 1 + STRANDS * DOTS
  const total = COUNT * per
  const jelly = new Float32Array(total * 4), part = new Float32Array(total * 3), color = new Float32Array(total * 3)
  const c = new THREE.Color()
  let i = 0
  for (let j = 0; j < COUNT; j++) {
    const J = [Math.random(), Math.random(), rand(SIZE), Math.random() * 100]
    c.set(COLORS[j % COLORS.length])
    const a0 = Math.random() * Math.PI * 2
    const put = (k, ang) => {
      jelly.set(J, i * 4)
      part.set([k, ang, 0], i * 3)
      color.set([c.r, c.g, c.b], i * 3)
      i++
    }
    put(0, 0)
    for (let s = 0; s < STRANDS; s++) for (let k = 1; k <= DOTS; k++) put(k, a0 + s * Math.PI * 2 / STRANDS)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3))   // 使わない（位置はシェーダーで決める）
  geo.setAttribute('aJelly', new THREE.BufferAttribute(jelly, 4))
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
  // 位置はシェーダーで決めるので、見えるかどうかの判定用の球は手で入れる
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (HEIGHT[0] + HEIGHT[1]) / 2, 0), AREA_R + DRIFT + HEIGHT[1])

  const uniforms = { uTime: { value: 0 }, uPixel: { value: 500 }, uCurve: { value: 1 / (2 * ground) } }
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.name = '光の粒のクラゲ'
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
