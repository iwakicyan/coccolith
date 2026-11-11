import * as THREE from 'three'
import { createGondola, GONDOLA_BOUNDS } from '../my-3d-parts/parts/gondola.js'
import { dirOf } from './coccolith.js'

// ============================================================
//  gondola（my-3d-parts/parts/gondola.js）を、2 つの停留所のあいだの細い楕円の上で行き来させる
//    A（GONDOLA_A）で 3 分停泊 → 楕円の片側を 2 分で B へ → B で 3 分停泊 → もう片側を 2 分で A へ（1 周 10 分）
//    時刻は端末の時計（Date.now()）から決めるので、いつ開いても・だれが見ても同じ場所にいる
//    体の下半分を地面に埋め、天面（いちばん高いところ）を地表（海の上なら海面）から GONDOLA_LIFT だけ上にする（海の上で全身が水に沈まないように）。地面の高さは起動時に軌道に沿って測っておく
//    上は歩ける（userData.walkable を地形と同じレイキャスト対象にする。main.js）。乗っている sabちゃんは update が返す回転で一緒に運ぶ
// ============================================================

export const GONDOLA_A = { lat: -83, lon: -133 }
export const GONDOLA_B = { lat: -73, lon: -133 }
const GONDOLA_SCALE = 9                 // モデル単位 → m（幅 27m・長さ 36m・高さ 14.3m）
const GONDOLA_HALF_W = 8                // 楕円の短いほうの半径 (m)。行きと帰りの道が 16m 離れる（長いほうは A〜B の約 64m）
const GONDOLA_LIFT = 2                  // 天面を地表（海の上は海面）より浮かせる量 (m)。0 で天面と地表が同じ高さ
const STOP_MS = 3 * 60 * 1000           // 停泊
const MOVE_MS = 2 * 60 * 1000           // 片道
const PERIOD_MS = 2 * (STOP_MS + MOVE_MS)
const SAMPLES = 240                     // 地面の高さを測っておく点の数（楕円 1 周ぶん。約 1m おき）

const smooth = t => t * t * (3 - 2 * t)   // 動き出しと着く前はゆっくり

// 時刻 → 楕円の上の角度 θ（0 = A、π = B。θ が増える向きに進む）と、動いているか
function thetaAt(ms) {
  const t = ((ms % PERIOD_MS) + PERIOD_MS) % PERIOD_MS
  if (t < STOP_MS) return { theta: 0, moving: false }
  if (t < STOP_MS + MOVE_MS) return { theta: Math.PI * smooth((t - STOP_MS) / MOVE_MS), moving: true }
  if (t < 2 * STOP_MS + MOVE_MS) return { theta: Math.PI, moving: false }
  return { theta: Math.PI * (1 + smooth((t - 2 * STOP_MS - MOVE_MS) / MOVE_MS)), moving: true }
}

// getGround(dir): 惑星中心から地面までの距離。waterLevel: 海面の高さ（惑星中心から）
export function createGondolaRide({ scene, radius, getGround, waterLevel }) {
  const a = dirOf(GONDOLA_A.lat, GONDOLA_A.lon), b = dirOf(GONDOLA_B.lat, GONDOLA_B.lon)
  const half = a.angleTo(b) / 2
  const mid = a.clone().add(b).normalize()                                    // 楕円の中心
  const side = new THREE.Vector3().crossVectors(a, b).normalize()             // 短いほうの軸（A→B の大円に垂直）
  const along = new THREE.Vector3().crossVectors(side, mid).normalize()       // 長いほうの軸（中心から B へ）
  const sideAng = GONDOLA_HALF_W / radius

  // θ → 球面上の向き（out に入れる）
  const dirAt = (theta, out) => {
    const al = -Math.cos(theta) * half                                         // A で -half、B で +half
    out.copy(mid).multiplyScalar(Math.cos(al)).addScaledVector(along, Math.sin(al))
    return out.addScaledVector(side, Math.sin(theta) * sideAng).normalize()
  }

  const root = createGondola()
  root.scale.setScalar(GONDOLA_SCALE)
  const top = GONDOLA_BOUNDS.max[1] * GONDOLA_SCALE                           // 原点から天面まで (m)
  const hx = GONDOLA_BOUNDS.max[0] * GONDOLA_SCALE, hz = GONDOLA_BOUNDS.max[2] * GONDOLA_SCALE, tz = GONDOLA_BOUNDS.min[2] * GONDOLA_SCALE
  scene.add(root)

  // θ での向き（上・前）
  const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3()
  const _m = new THREE.Matrix4()
  const frameAt = (theta, up, fwd) => {
    dirAt(theta, up)
    dirAt(theta + 0.01, _d2)
    fwd.subVectors(_d2, up)
    fwd.addScaledVector(up, -fwd.dot(up)).normalize()
  }

  // 軌道に沿って、真ん中と四隅・前後の下の地面を測り、いちばん高いところに天面をそろえた原点の高さを入れておく（天面が地面より下に潜らない）
  const heights = new Float32Array(SAMPLES + 1)
  const _p = new THREE.Vector3()
  const groundAt = (up, fwd, x, z) => {
    _r.crossVectors(up, fwd)
    _p.copy(up).multiplyScalar(radius).addScaledVector(_r, x).addScaledVector(fwd, z).normalize()
    return Math.max(getGround(_p), waterLevel)
  }
  for (let i = 0; i <= SAMPLES; i++) {
    frameAt((i / SAMPLES) * Math.PI * 2, _d1, _f)
    let g = groundAt(_d1, _f, 0, 0)
    for (const [x, z] of [[hx * 0.7, hz * 0.7], [-hx * 0.7, hz * 0.7], [hx * 0.7, tz * 0.7], [-hx * 0.7, tz * 0.7], [0, hz], [0, tz]]) g = Math.max(g, groundAt(_d1, _f, x, z))
    heights[i] = g - top + GONDOLA_LIFT
  }
  const heightAt = (theta) => {
    const u = (((theta / (Math.PI * 2)) % 1 + 1) % 1) * SAMPLES, i = Math.floor(u)
    return heights[i] + (heights[i + 1] - heights[i]) * (u - i)
  }

  const prevQuat = new THREE.Quaternion()
  const delta = new THREE.Quaternion()
  let first = true

  // 毎フレーム呼ぶ。前のフレームからの回転（惑星中心まわり。乗っているものを一緒に運ぶ用）を返す
  function update(nowMs = Date.now()) {
    const { theta } = thetaAt(nowMs)
    frameAt(theta, _d1, _f)
    _m.makeBasis(_r.crossVectors(_d1, _f), _d1, _f)                           // +x=右、+y=上（惑星の法線）、+z=前（顔の向き）
    root.quaternion.setFromRotationMatrix(_m)
    root.position.copy(_d1).multiplyScalar(heightAt(theta))
    root.updateMatrixWorld(true)
    if (first) { delta.identity(); first = false }
    else delta.copy(root.quaternion).multiply(prevQuat.invert())
    prevQuat.copy(root.quaternion)
    return delta
  }
  update()

  // reach: 中心からこの距離 (m) より離れていれば gondola の上ではない（体のいちばん遠い端＋余裕）
  const reach = Math.hypot(hx, Math.max(hz, -tz)) + 3
  // delta: update が返すのと同じ回転（いちばん最後のフレームのぶん）
  return { root, walkable: root.userData.walkable, update, delta, reach }
}

// ============================================================
//  2 台目からの gondola：道（地点を大円で結んだ線）を speed (m/s) で始点から終点まで進み、終点で TOUR_TURN_MS かけてその場で 180° 振り返って
//    同じ道を始点まで戻る。始点でもまた振り返る（gondeer の往復と同じ）
//    高さの決め方（天面を地表・海面から GONDOLA_LIFT 上にする）は上の往復するのと同じ。道の曲がり角では前後 TOUR_TURN 点ぶんを結んだ向きを前にする
// ============================================================

const TOUR_STEP = 1                     // 道に沿って向きと地面の高さを持っておく間隔 (m)
const TOUR_TURN = 12                    // 曲がり角で向きを急に変えないよう、前後この点数ぶんを結んだ向きを前にする
const TOUR_SMOOTH = 6                   // 測った高さを前後この点数ずつでならす
const TOUR_TURN_MS = 80 * 1000          // 道の端で 180° 振り返るのにかける時間

export function createGondolaTourRide({ scene, radius, getGround, waterLevel, speed, path }) {
  // 道を TOUR_STEP (m) おきの点に分ける（pts[i] は単位ベクトル）
  const ways = path.map(p => dirOf(p.lat, p.lon))
  const pts = []
  for (let i = 0; i < ways.length - 1; i++) {
    const a = ways[i], b = ways[i + 1], ang = a.angleTo(b)
    const n = Math.max(1, Math.round(ang * radius / TOUR_STEP))
    for (let k = 0; k < n; k++) {
      const t = k / n
      pts.push(new THREE.Vector3().addScaledVector(a, Math.sin((1 - t) * ang)).addScaledVector(b, Math.sin(t * ang)).divideScalar(Math.sin(ang)))   // 大円の上
    }
  }
  pts.push(ways[ways.length - 1].clone())
  const N = pts.length
  const idx = i => Math.max(0, Math.min(N - 1, i))
  const seg = new Float32Array(N), cum = new Float32Array(N)
  for (let i = 0; i < N - 1; i++) { seg[i] = pts[i].angleTo(pts[i + 1]) * radius; cum[i + 1] = cum[i] + seg[i] }
  const L = cum[N - 1]
  const fwds = pts.map((p, i) => {
    const f = new THREE.Vector3().subVectors(pts[idx(i + TOUR_TURN)], pts[idx(i - TOUR_TURN)])
    return f.addScaledVector(p, -f.dot(p)).normalize()
  })

  const root = createGondola()
  root.scale.setScalar(GONDOLA_SCALE)
  const top = GONDOLA_BOUNDS.max[1] * GONDOLA_SCALE
  const hx = GONDOLA_BOUNDS.max[0] * GONDOLA_SCALE, hz = GONDOLA_BOUNDS.max[2] * GONDOLA_SCALE, tz = GONDOLA_BOUNDS.min[2] * GONDOLA_SCALE
  scene.add(root)

  // 道に沿って、真ん中と四隅・前後の下の地面を測り、いちばん高いところに天面をそろえた原点の高さを入れておく
  const _r = new THREE.Vector3(), _p = new THREE.Vector3()
  const groundAt = (up, fwd, x, z) => {
    _r.crossVectors(up, fwd)
    _p.copy(up).multiplyScalar(radius).addScaledVector(_r, x).addScaledVector(fwd, z).normalize()
    return Math.max(getGround(_p), waterLevel)
  }
  //   道の端（振り返るところ）では、回っていく途中の向きでも測っておく
  const FOOT = [[0, 0], [hx * 0.7, hz * 0.7], [-hx * 0.7, hz * 0.7], [hx * 0.7, tz * 0.7], [-hx * 0.7, tz * 0.7], [0, hz], [0, tz]]
  const footMax = (up, fwd) => { let g = -Infinity; for (const [x, z] of FOOT) g = Math.max(g, groundAt(up, fwd, x, z)); return g }
  const _f = new THREE.Vector3()
  const raw = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let g = footMax(pts[i], fwds[i])
    if (i === 0 || i === N - 1) for (const deg of [45, 90, 135]) g = Math.max(g, footMax(pts[i], _f.copy(fwds[i]).applyAxisAngle(pts[i], THREE.MathUtils.degToRad(deg))))
    raw[i] = g - top + GONDOLA_LIFT
  }
  const top2 = new Float32Array(N), heights = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let m = -Infinity                                                          // 天面が地面に潜らないよう、まず前後の最大を取り
    for (let k = -2 * TOUR_SMOOTH; k <= 2 * TOUR_SMOOTH; k++) m = Math.max(m, raw[idx(i + k)])
    top2[i] = m
  }
  for (let i = 0; i < N; i++) {
    let sum = 0                                                                // それを前後でならして、段差をなだらかな坂にする
    for (let k = -TOUR_SMOOTH; k <= TOUR_SMOOTH; k++) sum += top2[idx(i + k)]
    heights[i] = sum / (2 * TOUR_SMOOTH + 1)
  }

  // 道のり s (m) → 位置の向き up・前 fwd・原点の高さ
  function frameAt(s, up, fwd) {
    let lo = 0, hi = N - 1
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1 }
    const j = idx(lo + 1), t = seg[lo] > 0 ? Math.min(1, (s - cum[lo]) / seg[lo]) : 0
    up.copy(pts[lo]).lerp(pts[j], t).normalize()
    fwd.copy(fwds[lo]).lerp(fwds[j], t)
    fwd.addScaledVector(up, -fwd.dot(up)).normalize()
    return heights[lo] + (heights[j] - heights[lo]) * t
  }

  // 時刻 → 道のり s と、道の進む向きから回した角度 yaw（戻り道は π。端では TOUR_TURN_MS かけて回る）
  const moveMs = L / speed * 1000
  const periodMs = 2 * (moveMs + TOUR_TURN_MS)
  function stateAt(ms) {
    const u = ((ms % periodMs) + periodMs) % periodMs
    if (u < moveMs) return { s: L * u / moveMs, yaw: 0 }                                                   // 行き
    if (u < moveMs + TOUR_TURN_MS) return { s: L, yaw: Math.PI * smooth((u - moveMs) / TOUR_TURN_MS) }     // 終点で振り返る
    if (u < 2 * moveMs + TOUR_TURN_MS) return { s: L * (1 - (u - moveMs - TOUR_TURN_MS) / moveMs), yaw: Math.PI } // 帰り
    return { s: 0, yaw: Math.PI * (1 + smooth((u - 2 * moveMs - TOUR_TURN_MS) / TOUR_TURN_MS)) }       // 始点で振り返る
  }
  const prevQuat = new THREE.Quaternion()
  const delta = new THREE.Quaternion()
  const _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _m = new THREE.Matrix4()
  let first = true

  // 毎フレーム呼ぶ。前のフレームからの回転（惑星中心まわり。乗っているものを一緒に運ぶ用）を返す
  function update(nowMs = Date.now()) {
    const { s, yaw } = stateAt(nowMs)
    const h = frameAt(Math.min(s, L), _up, _fw)
    if (yaw) _fw.applyAxisAngle(_up, yaw)
    _m.makeBasis(_r.crossVectors(_up, _fw), _up, _fw)                         // +x=右、+y=上（惑星の法線）、+z=前（顔の向き）
    root.quaternion.setFromRotationMatrix(_m)
    root.position.copy(_up).multiplyScalar(h)
    root.updateMatrixWorld(true)
    if (first) { delta.identity(); first = false }
    else delta.copy(root.quaternion).multiply(prevQuat.invert())
    prevQuat.copy(root.quaternion)
    return delta
  }
  update()

  const reach = Math.hypot(hx, Math.max(hz, -tz)) + 3
  return { root, walkable: root.userData.walkable, update, delta, reach, length: L }
}
