import * as THREE from 'three'
import { R_C } from './constants.js'

// ============================================================
//  光の粒のクラゲ：光の粒の立ちのぼり（sparkleFountain.js）の 2 か所（from・to）の宙に、光でできたクラゲが漂い、ゆっくり行ったり来たりする
//  1 匹 = かさの粒 1 つ（ドームの形に描く）＋ かさの下に垂れる触手 STRANDS 本 × DOTS 粒
//  動きはぜんぶ頂点シェーダーで時刻から計算する（粒ごとの乱数を属性に持たせるだけ。毎フレーム JS で動かさない）
//    旅：from で DWELL 秒漂う → 2 か所を結ぶ大円に沿って SPEED (m/s) でゆっくり to へ → to で漂う → from へ戻る …（1 匹ずつ時刻をずらす）
//        漂っている所では半径 AREA_R に散らばり、道は 2 か所の真ん中で半径 TRAVEL_R・高さ TRAVEL_H に膨らむ
//    泳ぎ：PULSE 秒ごとに、かさがキュッとすぼまってスッとのぼり、ふわっと開きながらゆっくり沈む（1 回ごとに元の高さへ戻る）
//    触手：かさの少し前の時刻の位置をなぞるので、のぼるときは遅れてついてきて、波が下へ伝わる
//    高さ：道に沿って GROUND_N 点、道の幅ぶんの地面のいちばん高い所を測っておき、その上 HEIGHT（真ん中では TRAVEL_H）(m) を漂う
//    色を足し合わせて光らせる（AdditiveBlending）
//  うろうろするクラゲ（createKurageWander）：星のあちこちのランダムな所で、地面から ROAM_H (m) の低い所をうろうろする
//    動きは JS で毎フレーム進める（地面の高さを測りながら進むので）。泳ぎ・触手・形はシェーダーで同じに描く
//    花壇の花を持った sabちゃんが MEET_DIST 以内に近づくと、そのクラゲが 1 匹だけついてくるようになる（ページを開き直すと戻る）
// ============================================================

const COUNT    = 100            // クラゲの数
const STRANDS  = 4              // 触手の本数
const DOTS     = 6              // 触手 1 本の粒の数
const AREA_R   = 45             // 漂っている所で散らばる半径 (m)
const TRAVEL_R = 50             // 2 か所の真ん中で散らばる半径 (m)。そこまでなめらかに膨らむ
const HEIGHT   = [5, 20]        // 漂っている所での、地面からの高さ (m)
const TRAVEL_H = [2, 100]       // 2 か所の真ん中での、地面からの高さ (m)
const SIZE     = [1.1, 2.0]     // かさの大きさ (m)
const PULSE    = [2.6, 3.8]     // ひと泳ぎの周期 (s)
const THRUST   = 0.28           // 周期のうち、すぼまってのぼる時間の割合
const LIFT     = 0.9            // ひと泳ぎでのぼる高さ（かさの大きさに対して）
const DWELL    = [120, 300]     // 1 か所で漂っている時間 (s)
const SPEED    = [0.6, 1.0]     // 旅の速さ (m/s)
const WANDER   = 6              // 漂いながらふらふらする幅 (m)
const LAG      = 0.16           // 触手の粒 1 つごとの遅れ (s)
const HALO     = 2.2            // かさのまわりのぼんやりした光が届く所（ドームの大きさに対して。ふちが 0.9）
const SPACING  = 0.32           // 触手の粒の間隔（かさの大きさに対して）
const GROUND_N = 64             // 道に沿って地面の高さを測る点の数
const ROAM_H   = 2              // うろうろするクラゲの、地面からのかさの高さ (m)
const ROAM_V   = [0.3, 0.6]     // うろうろする速さ (m/s)
const ROAM_R   = 25             // 出た所からこれより離れたら戻ってくる (m)
const MEET_DIST   = 5           // 花を持った sabちゃんがこれより近づくと、そのクラゲが 1 匹ついてくるようになる (m)
const FOLLOW_DIST = 4           // ついてくるクラゲは、sabちゃんからこれより離れたら追いかけ、内側ではふわふわうろうろする (m)
const FOLLOW_GAIN = 2           // FOLLOW_DIST より離れた分 × これ (m/s) で追いかける（FOLLOW_V まで）
const FOLLOW_V    = 23          // 追いかける速さの上限 (m/s)。sabちゃん（20 m/s）より少し速い
const FOLLOW_WARP = 200         // これより離れたら（JUMP したときなど）、sabちゃんのそばへ移る (m)
const TRAIL_V     = 1.5         // 触手がなびく長さに使う速さの上限 (m/s)。速く追いかけても触手が伸びすぎないように
const COLORS   = [0xbfeeff, 0xffd0f0, 0xdcd0ff, 0xc8fff0, 0xfff0d8]   // クラゲの色（順番に使う）

const rand = ([a, b]) => a + Math.random() * (b - a)
const f2 = v => v.toFixed(3)

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixel;   // 画面の高さ / (2 tan(fov/2))。m の大きさを画面のピクセルにする
#ifdef WANDER
  attribute vec3 aCenter; // かさの位置（星の中心から。JS で毎フレーム動かす）
  attribute vec3 aVel;    // かさの進む速さ (m/s)。触手はこの逆へ遅れてなびく
#else
  uniform vec3 uFrom, uTo;  // 2 か所の向き（星の中心から。長さ 1）
  uniform float uArc;       // 2 か所のあいだの角度 (rad)
  uniform float uGround[${GROUND_N}];   // 道に沿った地面の高さ（星の中心から m）
  attribute vec3 aTrip;   // x: 漂っている時間 (s), y: 旅の時間 (s), z: 時刻のずれ（0〜1）
#endif
  attribute vec4 aJelly;  // x, y: クラゲごとの乱数, z: かさの大きさ, w: ふらふらの位相
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
#ifdef WANDER
  // 時刻 tt での、かさの位置（星の中心から）。fwd・side：その所の横向きの 2 方向
  vec3 jellyPos(float tt, float period, out vec3 fwd, out vec3 side) {
    vec3 d = normalize(aCenter);
    vec3 ref = abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    side = normalize(cross(d, ref));
    fwd = cross(side, d);
    float h = 0.25 * sin(tt * 0.4 + aJelly.w * TAU) + lift(fract(tt / period + aJelly.y)) * ${f2(LIFT)} * aJelly.z;
    return aCenter + d * h - aVel * (uTime - tt);   // 少し前の時刻ほど、進んできた向きの後ろ
  }
#else
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
    float mid = sin(3.14159 * s);   // 2 か所の真ん中ほど 1
    float spread = mix(${f2(AREA_R)}, ${f2(TRAVEL_R)}, mid);
    float ang = aJelly.x * TAU, r = sqrt(aJelly.y);
    vec2 off = vec2(cos(ang), sin(ang)) * r * spread;
    off += ${f2(WANDER)} * vec2(sin(tt * 0.031 + aJelly.w * TAU), cos(tt * 0.027 + aJelly.w * 5.1));
    off += 0.5 * vec2(sin(tt * 0.23 + aJelly.x * TAU), cos(tt * 0.19 + aJelly.y * TAU));
    float h = mix(mix(${f2(HEIGHT[0])}, ${f2(TRAVEL_H[0])}, mid), mix(${f2(HEIGHT[1])}, ${f2(TRAVEL_H[1])}, mid), fract(aJelly.x * 7.31 + aJelly.y * 3.17)) + 1.2 * sin(tt * 0.05 + aJelly.w * TAU);
    h += lift(fract(tt / period + aJelly.y)) * ${f2(LIFT)} * aJelly.z;
    float R = groundAt(s) + h;
    return normalize(d * R + fwd * off.x + side * off.y) * R;
  }
#endif
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
      gl_PointSize = size * ${f2(1.4 * HALO / 1.6)} * uPixel / -mv.z;   // ドームのまわりのぼんやりした光の分も含めて大きめに
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
    q *= ${f2(HALO / 1.6)};                           // 粒を光の届く所まで大きくした分、ドームの大きさは変えない
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
    if (e > ${f2(HALO)}) discard;
    float rim  = exp(-pow((e - 0.9) / 0.1, 2.0));                       // ふちの光
    float fill = (1.0 - smoothstep(0.2, 1.0, e)) * 0.28;                 // 中のうっすらした光
    float halo = pow(1.0 - smoothstep(0.9, ${f2(HALO)}, e), 1.5) * 0.14;                 // まわりのぼんやりした光
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
    const WIDE = Math.max(AREA_R, TRAVEL_R) + WANDER
    for (const a of [-1, 0, 1]) for (const b of [-1, -0.5, 0, 0.5, 1]) {
      q.copy(d).multiplyScalar(R_C).addScaledVector(fwd, a * WIDE).addScaledVector(side, b * WIDE).normalize()
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

// 星のあちこちのランダムな所で、地面から ROAM_H (m) の低い所をうろうろするクラゲ
// count: 数 / groundAt(dir): その向きの地面の高さ（星の中心から m。海なら海面）
export function createKurageWander({ scene, count, groundAt }) {
  const per = 1 + STRANDS * DOTS
  const total = count * per
  const jelly = new Float32Array(total * 4), part = new Float32Array(total * 3), color = new Float32Array(total * 3)
  const center = new Float32Array(total * 3), vel = new Float32Array(total * 3)
  const c = new THREE.Color()
  const ref = new THREE.Vector3()
  const jellies = []
  let i = 0
  for (let j = 0; j < count; j++) {
    const J = [Math.random(), Math.random(), rand(SIZE), Math.random()]
    c.set(COLORS[j % COLORS.length])
    const a0 = Math.random() * Math.PI * 2
    for (let k = 0; k <= STRANDS * DOTS; k++) {
      jelly.set(J, i * 4)
      part.set(k === 0 ? [0, 0, 0] : [1 + (k - 1) % DOTS, a0 + Math.floor((k - 1) / DOTS) * Math.PI * 2 / STRANDS, 0], i * 3)
      color.set([c.r, c.g, c.b], i * 3)
      i++
    }
    // 出る所：星の上に一様に散らす。進む向きはランダム
    const home = new THREE.Vector3().randomDirection()
    ref.set(0, 1, 0); if (Math.abs(home.y) > 0.9) ref.set(1, 0, 0)
    const fwd = new THREE.Vector3().crossVectors(home, ref).normalize().applyAxisAngle(home, Math.random() * Math.PI * 2)
    jellies.push({ home, dir: home.clone(), fwd, speed: rand(ROAM_V), ph: Math.random() * 100, ground: groundAt(home), target: 0 })
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3))   // 使わない（位置はシェーダーで決める）
  geo.setAttribute('aJelly', new THREE.BufferAttribute(jelly, 4))
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
  const centerAttr = new THREE.BufferAttribute(center, 3).setUsage(THREE.DynamicDrawUsage)
  const velAttr = new THREE.BufferAttribute(vel, 3).setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aCenter', centerAttr)
  geo.setAttribute('aVel', velAttr)
  for (const J of jellies) J.target = J.ground

  const uniforms = { uTime: { value: 0 }, uPixel: { value: 500 } }
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, defines: { WANDER: '' },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.name = '光の粒のクラゲ（うろうろ）'
  points.frustumCulled = false   // 星のあちこちに散らばっていて、位置はシェーダーで決めるので、見えるかどうかの判定はしない
  scene.add(points)

  const _size = new THREE.Vector2(), _toHome = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3()
  const _toSab = new THREE.Vector3(), _axis = new THREE.Vector3()
  let last = null, next = 0
  let follower = null   // ついてきているクラゲ（1 匹だけ）
  // timeSec: 秒 / camera・renderer: 粒の大きさを画面に合わせる
  // sab: { dir, flower }（sabちゃんの足元の向き・花を持っているか）。なければ見ない
  function update(timeSec, camera, renderer, sab = null) {
    const dt = last === null ? 0 : Math.min(timeSec - last, 0.1)
    last = timeSec
    // 地面の高さは、毎フレーム 2 匹ずつ測り直す（あいだはなめらかに追いかける）
    for (let n = 0; n < 2; n++) { const J = jellies[next]; J.target = groundAt(J.dir); next = (next + 1) % jellies.length }
    // 花を持った sabちゃんが近づいたら、いちばん近いクラゲが 1 匹ついてくるようになる
    if (sab?.flower && !follower) {
      let best = MEET_DIST
      for (const J of jellies) { const d = J.dir.angleTo(sab.dir) * J.ground; if (d < best) { best = d; follower = J } }
    }
    jellies.forEach((J, j) => {
      let speed = J.speed
      if (J === follower) {
        // ついていく: sabちゃんのまわりをうろうろし（出た所を sabちゃんの所にする）、FOLLOW_DIST より離れたら追いかける（離れているほど速く）
        J.home.copy(sab.dir)
        let over = J.dir.angleTo(sab.dir) * J.ground - FOLLOW_DIST
        if (over > FOLLOW_WARP) {   // 遠すぎる（JUMP したなど）: sabちゃんのそばへ移る
          _axis.randomDirection().cross(sab.dir).normalize()
          J.dir.copy(sab.dir).applyAxisAngle(_axis, FOLLOW_DIST / J.ground)
          J.ground = J.target = groundAt(J.dir)
          over = 0
        }
        if (over > 0) {
          _toSab.copy(sab.dir).addScaledVector(J.dir, -sab.dir.dot(J.dir)).normalize()
          J.fwd.lerp(_toSab, Math.min(1, 8 * dt)).normalize()
          speed = Math.max(J.speed, Math.min(FOLLOW_V, over * FOLLOW_GAIN))
        }
        J.target = groundAt(J.dir)   // 速く動くので毎フレーム測る
      }
      // ゆっくり向きを変えながら進む。出た所から ROAM_R より離れたら、戻る向きへ曲がる
      const turn = 0.5 * Math.sin(timeSec * 0.23 + J.ph) + 0.3 * Math.sin(timeSec * 0.071 + J.ph * 2.3)
      J.fwd.applyAxisAngle(J.dir, turn * dt)
      const away = J.dir.angleTo(J.home) * J.ground
      if (away > (J === follower ? FOLLOW_DIST - 1 : ROAM_R)) {
        _toHome.copy(J.home).addScaledVector(J.dir, -J.home.dot(J.dir)).normalize()
        J.fwd.lerp(_toHome, Math.min(1, 0.4 * dt)).normalize()
      }
      J.dir.addScaledVector(J.fwd, speed * dt / J.ground).normalize()
      J.fwd.addScaledVector(J.dir, -J.fwd.dot(J.dir)).normalize()
      J.ground += (J.target - J.ground) * Math.min(1, (J === follower ? 8 : 2) * dt)
      _p.copy(J.dir).multiplyScalar(J.ground + ROAM_H)
      _v.copy(J.fwd).multiplyScalar(Math.min(speed, TRAIL_V))
      for (let k = 0; k < per; k++) {
        const o = (j * per + k) * 3
        center[o] = _p.x; center[o + 1] = _p.y; center[o + 2] = _p.z
        vel[o] = _v.x; vel[o + 1] = _v.y; vel[o + 2] = _v.z
      }
    })
    centerAttr.needsUpdate = true
    velAttr.needsUpdate = true
    uniforms.uTime.value = timeSec
    renderer.getDrawingBufferSize(_size)
    uniforms.uPixel.value = _size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
  }
  return { points, update }
}
