import * as THREE from 'three'
import { R_C } from './constants.js'

// ============================================================
//  光の粒のクラゲ：光の粒の立ちのぼり（sparkleFountain.js）の 2 か所（from・to）の宙に、光でできたクラゲが漂い、ゆっくり行ったり来たりする
//  1 匹 = かさの粒 1 つ（ドームの形に描く）＋ かさの下に垂れる触手 STRANDS 本 × DOTS 粒
//  動きはぜんぶ頂点シェーダーで時刻から計算する（粒ごとの乱数を属性に持たせるだけ。毎フレーム JS で動かさない）
//    旅：from で DWELL 秒漂う → 2 か所を結ぶ大円に沿って SPEED (m/s) でゆっくり to へ → to で漂う → from へ戻る …（1 匹ずつ時刻をずらす）
//        漂っている所では半径 AREA_R に散らばり、旅のあいだは道の幅 TRAVEL_R に寄って、ゆるい列になる
//    泳ぎ：PULSE 秒ごとに、かさがキュッとすぼまってスッとのぼり、ふわっと開きながらゆっくり沈む（1 回ごとに元の高さへ戻る）
//    触手：かさの少し前の時刻の位置をなぞるので、のぼるときは遅れてついてきて、波が下へ伝わる
//    高さ：道に沿って GROUND_N 点、道の幅ぶんの地面のいちばん高い所を測っておき、その上 HEIGHT (m) を漂う
//    色を足し合わせて光らせる（AdditiveBlending）
// ============================================================

const COUNT    = 72             // クラゲの数
const STRANDS  = 4              // 触手の本数
const DOTS     = 6              // 触手 1 本の粒の数
const AREA_R   = 45             // 漂っている所で散らばる半径 (m)
const TRAVEL_R = 16             // 旅のあいだに散らばる半径 (m)
const HEIGHT   = [5, 20]        // 地面からの高さ (m)
const SIZE     = [0.9, 1.7]     // かさの大きさ (m)
const PULSE    = [2.6, 3.8]     // ひと泳ぎの周期 (s)
const THRUST   = 0.28           // 周期のうち、すぼまってのぼる時間の割合
const LIFT     = 0.9            // ひと泳ぎでのぼる高さ（かさの大きさに対して）
const DWELL    = [300, 600]     // 1 か所で漂っている時間 (s)
const SPEED    = [0.6, 1.0]     // 旅の速さ (m/s)
const WANDER   = 6              // 漂いながらふらふらする幅 (m)
const LAG      = 0.16           // 触手の粒 1 つごとの遅れ (s)
const SPACING  = 0.32           // 触手の粒の間隔（かさの大きさに対して）
const GROUND_N = 64             // 道に沿って地面の高さを測る点の数
const COLORS   = [0xbfeeff, 0xffd0f0, 0xdcd0ff, 0xc8fff0, 0xfff0d8]   // クラゲの色（順番に使う）

const rand = ([a, b]) => a + Math.random() * (b - a)
const f2 = v => v.toFixed(3)

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixel;   // 画面の高さ / (2 tan(fov/2))。m の大きさを画面のピクセルにする
  uniform vec3 uFrom, uTo;  // 2 か所の向き（星の中心から。長さ 1）
  uniform float uArc;       // 2 か所のあいだの角度 (rad)
  uniform float uGround[${GROUND_N}];   // 道に沿った地面の高さ（星の中心から m）
  attribute vec4 aJelly;  // x, y: クラゲごとの乱数, z: かさの大きさ, w: ふらふらの位相
  attribute vec3 aTrip;   // x: 漂っている時間 (s), y: 旅の時間 (s), z: 時刻のずれ（0〜1）
  attribute vec3 aPart;   // x: 0 = かさ / 1〜 = 触手の何粒目, y: 触手の向き (rad), z: 未使用
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;    // 0: かさ, 1: 触手
  varying float vSquash;  // かさのすぼまり具合 0〜1
  varying float vRound;   // 真下・真上から見ているほど 1（かさをまん丸に描く）
  varying vec2 vUp;       // クラゲの上の向きを画面に映した向き（かさのドームをこの向きに立てる）

  const float TAU = 6.2831853;
  // 周期の中の位置 f での、ひと泳ぎの持ち上がり（0 → 1 → 0）
  float lift(float f) {
    return f < ${f2(THRUST)} ? 1.0 - pow(1.0 - f / ${f2(THRUST)}, 2.0) : 1.0 - smoothstep(${f2(THRUST)}, 1.0, f);
  }
  // 道の上の位置 s（0 = from, 1 = to）の地面の高さ
  float groundAt(float s) {
    float x = clamp(s, 0.0, 1.0) * ${f2(GROUND_N - 1)};
    int i = int(floor(x));
    int j = int(min(floor(x) + 1.0, ${f2(GROUND_N - 1)}));
    return mix(uGround[i], uGround[j], fract(x));
  }
  // 時刻 tt での、旅の進み具合 s（0 = from, 1 = to）
  float tripAt(float tt) {
    float dw = aTrip.x, tr = aTrip.y, cyc = 2.0 * (dw + tr);
    float u = fract(tt / cyc + aTrip.z) * cyc;
    if (u < dw) return 0.0;
    if (u < dw + tr) return smoothstep(0.0, 1.0, (u - dw) / tr);
    if (u < 2.0 * dw + tr) return 1.0;
    return 1.0 - smoothstep(0.0, 1.0, (u - 2.0 * dw - tr) / tr);
  }
  // 時刻 tt での、かさの位置（星の中心から）。fwd・side：その所の、道の向きと横の向き
  vec3 jellyPos(float tt, float period, out vec3 fwd, out vec3 side) {
    float s = tripAt(tt);
    vec3 d = normalize(sin((1.0 - s) * uArc) * uFrom + sin(s * uArc) * uTo);
    side = normalize(cross(uFrom, uTo));
    fwd = cross(side, d);
    // 散らばる所：漂っている所では広く、旅のあいだは道に寄る
    float spread = mix(${f2(AREA_R)}, ${f2(TRAVEL_R)}, sin(3.14159 * s));
    float ang = aJelly.x * TAU, r = sqrt(aJelly.y);
    vec2 off = vec2(cos(ang), sin(ang)) * r * spread;
    off += ${f2(WANDER)} * vec2(sin(tt * 0.031 + aJelly.w * TAU), cos(tt * 0.027 + aJelly.w * 5.1));
    off += 0.5 * vec2(sin(tt * 0.23 + aJelly.x * TAU), cos(tt * 0.19 + aJelly.y * TAU));
    float h = mix(${f2(HEIGHT[0])}, ${f2(HEIGHT[1])}, fract(aJelly.x * 7.31 + aJelly.y * 3.17)) + 1.2 * sin(tt * 0.05 + aJelly.w * TAU);
    h += lift(fract(tt / period + aJelly.y)) * ${f2(LIFT)} * aJelly.z;
    float R = groundAt(s) + h;
    return normalize(d * R + fwd * off.x + side * off.y) * R;
  }
  void main() {
    float period = mix(${f2(PULSE[0])}, ${f2(PULSE[1])}, aJelly.x);
    float k = aPart.x;
    float tt = uTime - k * ${f2(LAG)};
    vec3 fwd, side;
    vec3 p = jellyPos(tt, period, fwd, side);
    vec3 up = normalize(p);
    float size = aJelly.z;
    float f = fract(tt / period + aJelly.y);
    float squash = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.15, 0.45, f));
    if (k > 0.5) {
      // 触手：かさの下のふちから垂れる。すぼまるときは内へ寄る
      float rr = size * (0.24 - 0.08 * squash) * (1.0 + 0.04 * k);
      float sway = 0.06 * size * k * sin(uTime * 1.3 - k * 0.7 + aJelly.x * TAU);
      p += fwd * (cos(aPart.y) * rr + sway) + side * (sin(aPart.y) * rr + sway * 0.6);
      p -= up * size * (0.18 + ${f2(SPACING)} * k);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vAlpha = 1.0;
    vColor = aColor;
    vSquash = squash;
    vKind = k > 0.5 ? 1.0 : 0.0;
    // 見ている向きとクラゲの上の向きとのなす角で、横から見たドームと真下・真上から見た丸を混ぜる
    vec3 upV = normalize((modelViewMatrix * vec4(up, 0.0)).xyz);
    vRound = smoothstep(0.55, 0.9, abs(dot(normalize(mv.xyz), upV)));
    vUp = length(upV.xy) > 1e-3 ? normalize(upV.xy) : vec2(0.0, 1.0);
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
  varying float vRound;
  varying vec2 vUp;
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
    // かさ：横から見ると下が平らなドーム、真下・真上から見るとまん丸。すぼまると細く（丸のときは小さく）なる。ふちが明るく、中はうっすら
    q.y = -q.y;                                       // 画面の上を +
    q = vec2(dot(q, vec2(vUp.y, -vUp.x)), dot(q, vUp));   // クラゲの上の向きを +y にする
    // 横から見たドーム
    float w = 0.62 * (1.0 - 0.22 * vSquash), h = 0.5 * (1.0 + 0.12 * vSquash), yb = -0.18;
    float dy = q.y - yb;
    float eS = dy > 0.0 ? length(vec2(q.x / w, dy / h)) : length(vec2(q.x / w, dy / (h * 0.22)));
    float capS = exp(-pow(length(vec2(q.x / w, (dy - h * 0.55) / h)) / 0.35, 2.0)) * 0.35;   // てっぺんの少し明るい所
    // 真下・真上から見た丸（てっぺんが真ん中に来る）
    float eR = length(q) / w;
    float capR = exp(-pow(eR / 0.35, 2.0)) * 0.3;
    float e = mix(eS, eR, vRound), cap = mix(capS, capR, vRound);
    if (e > 1.6) discard;
    float rim  = exp(-pow((e - 0.9) / 0.1, 2.0));                       // ふちの光
    float fill = (1.0 - smoothstep(0.2, 1.0, e)) * 0.28;                 // 中のうっすらした光
    float halo = (1.0 - smoothstep(0.9, 1.6, e)) * 0.12;                 // まわりのぼんやりした光
    float glow = rim * (0.8 + 0.3 * vSquash) + fill + cap + halo;
    gl_FragColor = vec4(vColor * glow * vAlpha, 1.0);
  }
`

// from・to: 2 か所の向き（星の中心から）/ groundAt(dir): その向きの地面の高さ（星の中心から m。海なら海面）
export function createKurage({ scene, from, to, groundAt }) {
  const A = from.clone().normalize(), B = to.clone().normalize()
  const arc = A.angleTo(B)
  const side = new THREE.Vector3().crossVectors(A, B).normalize()

  // 道に沿って、道の幅（漂う所の広さ）ぶんの地面のいちばん高い所を測る
  const ground = []
  const d = new THREE.Vector3(), fwd = new THREE.Vector3(), q = new THREE.Vector3()
  for (let n = 0; n < GROUND_N; n++) {
    const s = n / (GROUND_N - 1)
    d.copy(A).multiplyScalar(Math.sin((1 - s) * arc)).addScaledVector(B, Math.sin(s * arc)).normalize()
    fwd.crossVectors(side, d)
    let g = 0
    for (const a of [-1, 0, 1]) for (const b of [-1, -0.5, 0, 0.5, 1]) {
      q.copy(d).multiplyScalar(R_C).addScaledVector(fwd, a * AREA_R).addScaledVector(side, b * AREA_R).normalize()
      g = Math.max(g, groundAt(q))
    }
    ground.push(g)
  }
  const arcLen = arc * ground.reduce((a, b) => a + b, 0) / GROUND_N

  const per = 1 + STRANDS * DOTS
  const total = COUNT * per
  const jelly = new Float32Array(total * 4), trip = new Float32Array(total * 3)
  const part = new Float32Array(total * 3), color = new Float32Array(total * 3)
  const c = new THREE.Color()
  let i = 0
  for (let j = 0; j < COUNT; j++) {
    const J = [Math.random(), Math.random(), rand(SIZE), Math.random()]
    const T = [rand(DWELL), arcLen / rand(SPEED), Math.random()]
    c.set(COLORS[j % COLORS.length])
    const a0 = Math.random() * Math.PI * 2
    const put = (k, ang) => {
      jelly.set(J, i * 4)
      trip.set(T, i * 3)
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
  geo.setAttribute('aTrip', new THREE.BufferAttribute(trip, 3))
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))

  const uniforms = {
    uTime: { value: 0 }, uPixel: { value: 500 },
    uFrom: { value: A }, uTo: { value: B }, uArc: { value: arc }, uGround: { value: ground },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.name = '光の粒のクラゲ'
  points.frustumCulled = false   // 2 か所のあいだに広がっていて、位置はシェーダーで決めるので、見えるかどうかの判定はしない（地平線カリングも外れる）
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
