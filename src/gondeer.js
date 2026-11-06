import * as THREE from 'three'
import { createGondeer } from '../my-3d-parts/parts/gondeer.js'
import { dirOf } from './coccolith.js'

// ============================================================
//  gondeer（my-3d-parts/parts/gondeer.js）を、道（地点を大円で結んだ線）に沿って動かす
//    loop: true  … 閉じた道をぐるぐる周遊する（緯度 58° の円。gondeerLatPath）
//    loop: false … 道の端から端へ往復する。端に着くと TURN_MS（2 分）かけてその場で 180° 振り返り、来た道を戻る（Route1・Route2）
//    速さは speed (m/s)。main.js から sabちゃんの移動速度の 0.5 倍を渡す
//    時刻は端末の時計（Date.now()）から決めるので、いつ開いても・だれが見ても同じ場所にいる
//    体（体と十二面体）の高さの GONDEER_BURY（70%）を地面（海の上なら海面）に埋める。地面の高さは起動時に道に沿って測っておく
//    上は歩ける（userData.walkable を地形と同じレイキャスト対象にする。main.js）。乗っているものは update が返す回転で一緒に運ぶ
//    ティアラは通り抜けられない（userData.walls の線分を上下へ伸びた壁にして、collide で外へ押し戻す。橋の手すりと同じ考え方）
// ============================================================

const GONDEER_SCALE = 9                 // モデル単位 → m（gondola と同じ）
const GONDEER_BURY = 0.7                // 体の高さのうち地面に埋める割合（0.5 で半分、1 で全部）
const STEP = 1                          // 道に沿って向きと地面の高さを持っておく間隔 (m)
const SMOOTH = 6                        // 測った高さを前後この点数ずつでならす（細かいでこぼこで上下にがたつかないように）
const TURN_SMOOTH = 10                  // 道の曲がり角で向きを急に変えないよう、前後この点数ぶん先と後ろを結んだ向きを前にする
const TURN_MS = 2 * 60 * 1000           // 往復の端で 180° 振り返るのにかける時間

const smooth = t => t * t * (3 - 2 * t)   // 回り始めと回り終わりはゆっくり

// 緯度 lat の円（閉じた道。経度が増える向き = 東へ進む）
export function gondeerLatPath(lat) {
  return Array.from({ length: 720 }, (_, i) => ({ lat, lon: i / 2 - 180 }))
}

// path: { lat, lon } の並び（道の中心線。隣どうしを大円で結ぶ）・loop: 閉じた道を周遊するか（false なら往復）
// getGround(dir): 惑星中心から地面までの距離。waterLevel: 海面の高さ（惑星中心から）。speed: 進む速さ (m/s)
export function createGondeerRide({ scene, radius, getGround, waterLevel, speed, path, loop = false }) {
  // 道を STEP (m) おきの点に分ける（pts[i] は単位ベクトル）
  const ways = path.map(p => dirOf(p.lat, p.lon))
  if (loop) ways.push(ways[0].clone())
  const pts = [ways[0].clone()]
  for (let i = 0; i < ways.length - 1; i++) {
    const a = ways[i], b = ways[i + 1], ang = a.angleTo(b)
    const n = Math.max(1, Math.round(ang * radius / STEP))
    for (let k = 1; k <= n; k++) pts.push(new THREE.Vector3().copy(a).lerp(b, k / n).normalize())   // 短い区間なので lerp→normalize で大円とほぼ同じ
  }
  if (loop) pts.pop()   // 最後の点は最初の点と同じ
  const N = pts.length
  const seg = new Float32Array(N)   // 点 i から点 i+1 までの長さ (m)
  for (let i = 0; i < N; i++) seg[i] = (loop || i < N - 1) ? pts[i].angleTo(pts[(i + 1) % N]) * radius : 0
  const cum = new Float32Array(N + 1)   // 点 i までの道のり (m)。cum[N] は閉じた道の 1 周（往復の道では最後の点まで）
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + seg[i]
  const L = loop ? cum[N] : cum[N - 1]
  const idx = i => loop ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i))

  // 点ごとの前の向き（道の進む向き。曲がり角では前後 TURN_SMOOTH 点を結んでならす）
  const fwds = pts.map((p, i) => {
    const f = new THREE.Vector3().subVectors(pts[idx(i + TURN_SMOOTH)], pts[idx(i - TURN_SMOOTH)])
    return f.addScaledVector(p, -f.dot(p)).normalize()
  })

  const root = createGondeer()
  root.scale.setScalar(GONDEER_SCALE)
  const box = root.userData.bodyBox
  const mid = (box.min.y + (box.max.y - box.min.y) * GONDEER_BURY) * GONDEER_SCALE   // 原点から、地面の高さに合わせるところ（体の下から GONDEER_BURY の高さ）まで (m)
  const hx = Math.max(box.max.x, -box.min.x) * GONDEER_SCALE, hz = box.max.z * GONDEER_SCALE, tz = box.min.z * GONDEER_SCALE
  scene.add(root)

  // 道に沿って、真ん中と体の内側の四隅・前後の下の地面を測り、いちばん高いところに体の下から GONDEER_BURY の高さをそろえた原点の高さを入れておく
  //   往復の端（振り返るところ）では、回っていく途中の向きでも測っておく
  const _r = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3()
  const groundAt = (up, fwd, x, z) => {
    _r.crossVectors(up, fwd)
    _p.copy(up).multiplyScalar(radius).addScaledVector(_r, x).addScaledVector(fwd, z).normalize()
    return Math.max(getGround(_p), waterLevel)
  }
  const FOOT = [[0, 0], [hx * 0.5, hz * 0.5], [-hx * 0.5, hz * 0.5], [hx * 0.5, tz * 0.5], [-hx * 0.5, tz * 0.5], [0, hz * 0.7], [0, tz * 0.7]]
  const footMax = (up, fwd) => { let g = -Infinity; for (const [x, z] of FOOT) g = Math.max(g, groundAt(up, fwd, x, z)); return g }
  const raw = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let g = footMax(pts[i], fwds[i])
    if (!loop && (i === 0 || i === N - 1)) for (const deg of [45, 90, 135]) g = Math.max(g, footMax(pts[i], _f.copy(fwds[i]).applyAxisAngle(pts[i], THREE.MathUtils.degToRad(deg))))
    raw[i] = g - mid
  }
  const heights = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let s = 0
    for (let k = -SMOOTH; k <= SMOOTH; k++) s += raw[idx(i + k)]
    heights[i] = s / (2 * SMOOTH + 1)
  }

  // 道のり s (m) → 位置の向き up・前 fwd（道の進む向き）・原点の高さ
  const _a = new THREE.Vector3()
  function frameAt(s, up, fwd) {
    let lo = 0, hi = N - 1                      // cum[lo] <= s < cum[lo+1] になる lo を二分探索
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1 }
    const j = idx(lo + 1), t = seg[lo] > 0 ? Math.min(1, (s - cum[lo]) / seg[lo]) : 0
    up.copy(pts[lo]).lerp(pts[j], t).normalize()
    fwd.copy(fwds[lo]).lerp(fwds[j], t)
    fwd.addScaledVector(up, -fwd.dot(up)).normalize()
    return heights[lo] + (heights[j] - heights[lo]) * t
  }

  // 時刻 → 道のり s と、道の進む向きから回した角度 yaw（往復の戻り道は π。端では 2 分かけて回る）
  const moveMs = L / speed * 1000
  const periodMs = loop ? moveMs : 2 * (moveMs + TURN_MS)
  function stateAt(ms) {
    const u = ((ms % periodMs) + periodMs) % periodMs
    if (loop) return { s: L * u / moveMs, yaw: 0 }
    if (u < moveMs) return { s: L * u / moveMs, yaw: 0 }                                              // 行き
    if (u < moveMs + TURN_MS) return { s: L, yaw: Math.PI * smooth((u - moveMs) / TURN_MS) }          // 終点で振り返る
    if (u < 2 * moveMs + TURN_MS) return { s: L * (1 - (u - moveMs - TURN_MS) / moveMs), yaw: Math.PI } // 帰り
    return { s: 0, yaw: Math.PI * (1 + smooth((u - 2 * moveMs - TURN_MS) / TURN_MS)) }              // 始点で振り返る
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

  // ティアラの壁：dir（sabちゃんのいる向き。単位ベクトル）が壁の線分から pad (m) より近ければ、線分から pad 離れたところへ押し戻す（dir を書き換える）
  //   判定は gondeer の原点の座標の XZ（モデル単位）で行う。線分の両端は丸く（カプセル）して、角で引っかからないようにする
  const walls = root.userData.walls
  const _inv = new THREE.Matrix4(), _q = new THREE.Vector3()
  function collide(dir, pad) {
    if (dir.angleTo(_a.copy(root.position).normalize()) * radius > reach) return false
    _inv.copy(root.matrixWorld).invert()
    _q.copy(dir).multiplyScalar(radius).applyMatrix4(_inv)
    const pr = pad / GONDEER_SCALE
    let hit = false
    for (const [x1, z1, x2, z2] of walls) {
      const ex = x2 - x1, ez = z2 - z1
      const t = Math.max(0, Math.min(1, ((_q.x - x1) * ex + (_q.z - z1) * ez) / (ex * ex + ez * ez)))
      const cx = x1 + ex * t, cz = z1 + ez * t
      let dx = _q.x - cx, dz = _q.z - cz
      const d = Math.hypot(dx, dz)
      if (d >= pr) continue
      if (d < 1e-6) { dx = -ez; dz = ex }   // 線の真上なら横へ
      const k = pr / Math.hypot(dx, dz)
      _q.x = cx + dx * k; _q.z = cz + dz * k
      hit = true
    }
    if (hit) dir.copy(_q.applyMatrix4(root.matrixWorld)).normalize()
    return hit
  }

  // reach: 中心からこの距離 (m) より離れていれば gondeer の上ではない（体のいちばん遠い端＋余裕）
  const reach = Math.hypot(hx, Math.max(hz, -tz)) + 3
  return { root, walkable: root.userData.walkable, update, delta, reach, collide, length: L }
}
