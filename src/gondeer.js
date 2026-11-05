import * as THREE from 'three'
import { createGondeer } from '../my-3d-parts/parts/gondeer.js'
import { dirOf } from './coccolith.js'

// ============================================================
//  gondeer（my-3d-parts/parts/gondeer.js）を、緯度 GONDEER_LAT の円の上でぐるぐる東へ周遊させる
//    速さは GONDEER_SPEED (m/s)。main.js から sabちゃんの移動速度の 0.5 倍を渡す
//    時刻は端末の時計（Date.now()）から決めるので、いつ開いても・だれが見ても同じ場所にいる
//    体（体と十二面体）の高さの半分を地面（海の上なら海面）に埋める。地面の高さは起動時に円に沿って測っておく
//    上は歩ける（userData.walkable を地形と同じレイキャスト対象にする。main.js）。乗っているものは update が返す回転で一緒に運ぶ
//    ティアラは通り抜けられない（userData.walls の線分を上下へ伸びた壁にして、collide で外へ押し戻す。橋の手すりと同じ考え方）
// ============================================================

export const GONDEER_LAT = 58
const GONDEER_SCALE = 9                 // モデル単位 → m（gondola と同じ）
const SAMPLES = 1200                    // 地面の高さを測っておく点の数（円 1 周ぶん。約 1m おき）
const SMOOTH = 6                        // 測った高さを前後この点数ずつでならす（細かいでこぼこで上下にがたつかないように）

// getGround(dir): 惑星中心から地面までの距離。waterLevel: 海面の高さ（惑星中心から）。speed: 進む速さ (m/s)
export function createGondeerRide({ scene, radius, getGround, waterLevel, speed }) {
  const latR = radius * Math.cos(THREE.MathUtils.degToRad(GONDEER_LAT))   // 円の半径 (m)
  const periodMs = (2 * Math.PI * latR / speed) * 1000                     // 1 周にかかる時間
  const lonAt = ms => ((((ms % periodMs) + periodMs) % periodMs) / periodMs) * 360   // 時刻 → 経度（0〜360°、増える向き = 東）

  const root = createGondeer()
  root.scale.setScalar(GONDEER_SCALE)
  const box = root.userData.bodyBox
  const mid = (box.min.y + box.max.y) / 2 * GONDEER_SCALE                   // 原点から体の高さの真ん中まで (m)
  const hx = Math.max(box.max.x, -box.min.x) * GONDEER_SCALE, hz = box.max.z * GONDEER_SCALE, tz = box.min.z * GONDEER_SCALE
  scene.add(root)

  // 経度 lon での向き（上・前）。前 = 東（経度が増える向き）
  const _d2 = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Matrix4()
  const frameAt = (lon, up, fwd) => {
    up.copy(dirOf(GONDEER_LAT, lon))
    _d2.copy(dirOf(GONDEER_LAT, lon + 0.05))
    fwd.subVectors(_d2, up)
    fwd.addScaledVector(up, -fwd.dot(up)).normalize()
  }

  // 円に沿って、真ん中と体の内側の四隅・前後の下の地面を測り、いちばん高いところに体の真ん中をそろえた原点の高さを入れておく
  const raw = new Float32Array(SAMPLES)
  const _p = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3()
  const groundAt = (up, fwd, x, z) => {
    _r.crossVectors(up, fwd)
    _p.copy(up).multiplyScalar(radius).addScaledVector(_r, x).addScaledVector(fwd, z).normalize()
    return Math.max(getGround(_p), waterLevel)
  }
  for (let i = 0; i < SAMPLES; i++) {
    frameAt((i / SAMPLES) * 360, _u, _f)
    let g = groundAt(_u, _f, 0, 0)
    for (const [x, z] of [[hx * 0.5, hz * 0.5], [-hx * 0.5, hz * 0.5], [hx * 0.5, tz * 0.5], [-hx * 0.5, tz * 0.5], [0, hz * 0.7], [0, tz * 0.7]]) g = Math.max(g, groundAt(_u, _f, x, z))
    raw[i] = g - mid
  }
  const heights = new Float32Array(SAMPLES + 1)
  for (let i = 0; i < SAMPLES; i++) {
    let s = 0
    for (let k = -SMOOTH; k <= SMOOTH; k++) s += raw[(i + k + SAMPLES) % SAMPLES]
    heights[i] = s / (2 * SMOOTH + 1)
  }
  heights[SAMPLES] = heights[0]
  const heightAt = lon => {
    const u = (lon / 360) * SAMPLES, i = Math.floor(u)
    return heights[i] + (heights[i + 1] - heights[i]) * (u - i)
  }

  const prevQuat = new THREE.Quaternion()
  const delta = new THREE.Quaternion()
  const _up = new THREE.Vector3(), _fw = new THREE.Vector3()
  let first = true

  // 毎フレーム呼ぶ。前のフレームからの回転（惑星中心まわり。乗っているものを一緒に運ぶ用）を返す
  function update(nowMs = Date.now()) {
    const lon = lonAt(nowMs)
    frameAt(lon, _up, _fw)
    _m.makeBasis(_r.crossVectors(_up, _fw), _up, _fw)                         // +x=右、+y=上（惑星の法線）、+z=前（顔の向き）
    root.quaternion.setFromRotationMatrix(_m)
    root.position.copy(_up).multiplyScalar(heightAt(lon))
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
    if (dir.angleTo(_up.copy(root.position).normalize()) * radius > reach) return false
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
  return { root, walkable: root.userData.walkable, update, delta, reach, collide }
}
