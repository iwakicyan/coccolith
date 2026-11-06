import * as THREE from 'three'
import { createSneaker, createSneakerFlap, sneakerFlapAngle, SNEAKER_HEIGHT, SNEAKER_HOP } from '../my-3d-parts/parts/sneaker.js'
import { createBlobShadows, polygonShadow } from './blobShadow.js'

// ============================================================
//  スニーカーの小鳥（my-3d-parts/parts/sneaker.js）を一足ずつ星の陸に出して、交互に飛ばす
//  右足（黒い小鳥）→ 左足（白い小鳥）の順に、羽ばたきながら一歩ずつ飛び、それぞれ相手より LEAD だけ前に着地する（作業台の「飛ぶ」と同じ）
//  何歩か飛んだら少し休む。一歩ごとに少しずつ向きを変え、着地点が海なら向きを変えて飛び直す
//  影は太陽の影を使わず、靴の真下の地面にダークグレーの板を置く（blobShadow.js。飛んでいる間も地面に張り付く）
// ============================================================

const HOPS       = [4, 10]      // 続けて飛ぶ歩数（右と左を合わせて）
const STOP_TIME  = [2, 6]       // 休む時間 (s)
const TURN_STEP  = 0.25         // 一歩ごとに向きを変える量の上限 (rad)
const SHADOW_W   = 4.2          // 影の幅・長さ（モデル単位）
const SHADOW_L   = 8.4
const NEAR_DIST  = [3, 6]       // near のとき、スポーン地点から離す距離 (m)

const rand = ([a, b]) => a + Math.random() * (b - a)
const ease = s => (1 - Math.cos(Math.PI * s)) / 2
const _axis = new THREE.Vector3()
const _side = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const X = new THREE.Vector3(1, 0, 0)

// dir（星の中心からの向き）から、接する向き v へ dist (m) 進んだ向き
function move(dir, v, dist, radius, out = new THREE.Vector3()) {
  _axis.crossVectors(dir, v).normalize()
  return out.copy(dir).applyAxisAngle(_axis, dist / radius).normalize()
}
// v を dir に接する向きにする
const tangent = (v, dir) => v.addScaledVector(dir, -v.dot(dir)).normalize()

// count: 足の組の数 / height: 高さ (m) / radius: 星の半径 (m)
// getGround(dir): その向きの地面の高さ（星の中心から m）/ waterLevel: これより低い地面は海
// colorsOf(i): i 組目の色の差し替え（SNEAKER_COLORS のキー。例 { upper: 0x3e5f9a }）。null ならそのまま
// spawn: { dir, fwd } スポーン地点 / near: true ならスポーン地点の正面 NEAR_DIST の所に出す（確かめる用）
export function createSneakerWalkers({ scene, count = 1, height = 1, radius, getGround, waterLevel, colorsOf = null, spawn, near = false }) {
  const isWater = g => g < waterLevel
  const k = height / SNEAKER_HEIGHT                 // モデル単位 → m
  const GAP = SNEAKER_HOP.GAP * k, LEAD = SNEAKER_HOP.LEAD * k, HOP_H = SNEAKER_HOP.HEIGHT * k
  const shadows = createBlobShadows({ scene, count: count * 2, name: 'スニーカーの影', pts: polygonShadow(SHADOW_W * k, SHADOW_L * k) })
  const pairs = []

  for (let i = 0; i < count; i++) {
    // 陸のランダムな地点と向き
    const dir = new THREE.Vector3()
    if (near && spawn) move(spawn.dir, spawn.fwd, rand(NEAR_DIST), radius, dir)
    else for (let n = 0; n < 200; n++) { dir.randomDirection(); if (!isWater(getGround(dir))) break }
    const heading = tangent(new THREE.Vector3().randomDirection(), dir)
    // 右足（-x 側。sign -1）は真ん中から右へ、左足（+x 側）は左へ GAP、さらに左足を LEAD だけ前に（右足から飛ぶ）
    const feet = [['dark', -1], ['white', 1]].map(([bird, sign]) => {
      const model = createSneaker({ bird, height, colors: colorsOf ? colorsOf(i) : null })
      const holder = new THREE.Group(); holder.name = bird === 'dark' ? 'スニーカー（右）' : 'スニーカー（左）'
      holder.add(model); scene.add(holder)
      _side.crossVectors(dir, heading).normalize()
      let d = move(dir, _side, sign * GAP, radius)
      if (sign > 0) d = move(d, tangent(heading.clone(), d), LEAD, radius)
      const ground = getGround(d)
      return { holder, flap: createSneakerFlap(model), sign, dir: d, fwd: tangent(heading.clone(), d), ground,
        from: null, to: null, fwd0: null, g0: 0, g1: 0 }
    })
    pairs.push({ feet, heading, next: 0, phase: 'rest', timer: rand(STOP_TIME), t: 0, left: 0 })
  }

  // 足 f を、相手 o より LEAD 前・横に GAP×2 の所へ飛ばす準備。着地点が海なら向きを変えて探し直す（見つからなければ false）
  function plan(p, f, o) {
    for (let n = 0; n < 6; n++) {
      if (n === 0) p.heading.applyAxisAngle(o.dir, (Math.random() * 2 - 1) * TURN_STEP)
      else p.heading.applyAxisAngle(o.dir, Math.PI * (0.6 + Math.random() * 0.8))
      tangent(p.heading, o.dir)
      const ahead = move(o.dir, p.heading, LEAD, radius)
      _side.crossVectors(ahead, p.heading).normalize()
      const to = move(ahead, _side, f.sign * 2 * GAP, radius)
      const g = getGround(to)
      if (isWater(g)) continue
      f.from = f.dir.clone(); f.to = to; f.fwd0 = f.fwd.clone(); f.g0 = f.ground; f.g1 = g
      return true
    }
    return false
  }

  function place(f, lift, pitch, index) {
    f.holder.setRotationFromMatrix(_m.makeBasis(_axis.crossVectors(f.dir, f.fwd), f.dir, f.fwd))
    if (pitch) f.holder.quaternion.multiply(_q.setFromAxisAngle(X, pitch))
    f.holder.position.copy(f.dir).multiplyScalar(f.ground + lift)
    shadows.set(index, f.dir, f.fwd, f.ground)
  }

  // 組ごとの状態：rest（休む）→ wait（次の足が飛ぶまで待つ）→ hop（next の足が飛んでいる）→ wait → … → rest
  function update(dt) {
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]
      if (p.phase === 'rest') {
        p.timer -= dt
        if (p.timer <= 0) { p.phase = 'wait'; p.timer = 0; p.left = Math.round(rand(HOPS)) }
      }
      if (p.phase === 'wait') {
        p.timer -= dt
        if (p.timer <= 0) {
          if (plan(p, p.feet[p.next], p.feet[1 - p.next])) { p.phase = 'hop'; p.t = 0 }
          else { p.phase = 'rest'; p.timer = rand(STOP_TIME) }
        }
      }
      let lift = 0, pitch = 0
      if (p.phase === 'hop') {
        const f = p.feet[p.next]
        p.t += dt
        const s = Math.min(1, p.t / SNEAKER_HOP.HOP), e = ease(s)
        f.dir.lerpVectors(f.from, f.to, e).normalize()
        f.ground = f.g0 + (f.g1 - f.g0) * e
        f.fwd.lerpVectors(f.fwd0, p.heading, e); tangent(f.fwd, f.dir)
        if (s < 1) {
          lift = HOP_H * Math.sin(Math.PI * s)
          pitch = -SNEAKER_HOP.PITCH * Math.sin(2 * Math.PI * s)
          f.flap.update(sneakerFlapAngle(s))
        } else {
          // 着地：次は相手の足。REST だけ待ってから飛ぶ（歩数を使い切ったら休む）
          f.flap.stop()
          p.next = 1 - p.next
          if (--p.left > 0) { p.phase = 'wait'; p.timer = SNEAKER_HOP.REST }
          else { p.phase = 'rest'; p.timer = rand(STOP_TIME) }
          place(f, 0, 0, i * 2 + p.feet.indexOf(f))
          place(p.feet[p.next], 0, 0, i * 2 + p.next)
          continue
        }
      }
      for (let j = 0; j < 2; j++) {
        const hopping = p.phase === 'hop' && j === p.next
        place(p.feet[j], hopping ? lift : 0, hopping ? pitch : 0, i * 2 + j)
      }
    }
    shadows.commit()
  }

  return { update, pairs }
}
