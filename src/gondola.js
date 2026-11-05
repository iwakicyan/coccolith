import * as THREE from 'three'
import { createGondola, GONDOLA_BOUNDS } from '../my-3d-parts/parts/gondola.js'
import { dirOf } from './coccolith.js'

// ============================================================
//  gondola（my-3d-parts/parts/gondola.js）を、2 つの停留所のあいだの細い楕円の上で行き来させる
//    A（GONDOLA_A）で 15 分停泊 → 楕円の片側を 2 分で B へ → B で 15 分停泊 → もう片側を 2 分で A へ（1 周 34 分）
//    時刻は端末の時計（Date.now()）から決めるので、いつ開いても・だれが見ても同じ場所にいる
//    体の下半分を地面に埋め、天面（いちばん高いところ）を地表（海の上なら海面）と同じ高さにする。地面の高さは起動時に軌道に沿って測っておく
//    上は歩ける（userData.walkable を地形と同じレイキャスト対象にする。main.js）。乗っている sabちゃんは update が返す回転で一緒に運ぶ
// ============================================================

export const GONDOLA_A = { lat: -83, lon: -133 }
export const GONDOLA_B = { lat: -73, lon: -133 }
const GONDOLA_SCALE = 9                 // モデル単位 → m（幅 27m・長さ 36m・高さ 14.3m）
const GONDOLA_HALF_W = 8                // 楕円の短いほうの半径 (m)。行きと帰りの道が 16m 離れる（長いほうは A〜B の約 64m）
const GONDOLA_SINK = 0                  // 天面を地表からさらに沈める量 (m)。0 で天面と地表が同じ高さ
const STOP_MS = 15 * 60 * 1000          // 停泊
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
    heights[i] = g - top - GONDOLA_SINK
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

  return { root, walkable: root.userData.walkable, update }
}
