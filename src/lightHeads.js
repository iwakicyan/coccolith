import * as THREE from 'three'
import { createLight01Head } from '../my-3d-parts/landmark/light01.js'

// ============================================================
//  ウロウロするライトの頭（light01 の頭だけ）
//  惑星の陸のランダムな位置から始めて、向きを少しずつ変えながら歩き回る（速さは main.js から渡す）
//  光らせない（頭の発光マテリアルを発光なしの Lambert に差し替える）
//  海に入りそうになったら向きを変える
// ============================================================

const COUNT      = 10
const HEAD_LIFT  = 1.96   // 地面から頭の中心までの高さ (m)。sabちゃんと同じ（地面 +1m に SAB_FOOT_OFFSET 0.96m）
const TURN_MAX   = 1.2    // 曲がる速さの上限 (rad/s)
const TURN_CHANGE = 0.8   // 曲がる速さが変わる時間のめやす (s)
const BOB        = 0.2    // ふわふわ上下する幅 (m)
// 地面を測る間隔 (m)。毎フレーム測ると重いので、この距離だけ先を 1 回測り、そこまでの高さは前に測った高さとのあいだをならす
// 海もこの距離だけ先で見つけて向きを変える（pixelSprite.js の歩くスプライトと同じ）
const PROBE_STEP = 0.5

const _right = new THREE.Vector3()
const _axis  = new THREE.Vector3()
const _next  = new THREE.Vector3()
const _m     = new THREE.Matrix4()

// scene: 頭を置く先 / speed: 歩く速さ (m/s) / radius: 惑星の半径 (m)
// getGround(dir): 単位ベクトル dir の地点の地面の高さ（惑星中心から m） / waterLevel: 地面がこれより低ければ海 (m)
export function createLightHeads({ scene, speed, radius, getGround, waterLevel }) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xC8E2EA })   // 頭の色はそのまま、発光だけなし
  const heads = []

  for (let i = 0; i < COUNT; i++) {
    const obj = createLight01Head()
    obj.traverse(o => { if (o.material?.emissive?.getHex()) o.material = mat })
    const lampY = obj.userData.lamp.y   // リングの中心（原点）から頭の中心までの高さ

    // 陸に当たるまでランダムな地点を引き直す
    const dir = new THREE.Vector3()
    let ground
    for (let n = 0; n < 50; n++) {
      dir.randomDirection()
      ground = getGround(dir)
      if (ground >= waterLevel) break
    }
    const fwd = new THREE.Vector3().randomDirection()
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize()

    scene.add(obj)
    // ground0: 前に測った地点の高さ / ground1: PROBE_STEP 先の高さ（null ならまだ測っていない） / travel: ground0 の地点から歩いた距離 (m)
    heads.push({ obj, lampY, dir, fwd, ground, ground0: ground, ground1: null, travel: 0, turn: 0, turnTarget: 0, phase: Math.random() * Math.PI * 2 })
  }

  function update(dt, now) {
    const da = speed / radius * dt
    for (const h of heads) {
      // 曲がる速さをときどき引き直し、そこへなめらかに寄せる
      if (Math.random() < dt / TURN_CHANGE) h.turnTarget = (Math.random() * 2 - 1) * TURN_MAX
      h.turn += (h.turnTarget - h.turn) * Math.min(1, dt * 2)
      h.fwd.applyAxisAngle(h.dir, h.turn * dt)

      // PROBE_STEP 先の地面を測る（dir を右向きの軸で回した先）。海なら進まずに後ろ寄りへ向きを変える（次のフレームで向きを変えた先を測り直す）
      _axis.crossVectors(h.dir, h.fwd).normalize()
      if (h.ground1 === null) {
        const ahead = getGround(_next.copy(h.dir).applyAxisAngle(_axis, PROBE_STEP / radius))
        if (ahead < waterLevel) h.fwd.applyAxisAngle(h.dir, Math.PI * (0.6 + Math.random() * 0.8))
        else h.ground1 = ahead
      }
      // 前へ進み、高さは測った 2 地点のあいだをならす。測った地点まで来たら次を測る
      if (h.ground1 !== null) {
        h.dir.applyAxisAngle(_axis, da).normalize()
        h.travel += speed * dt
        if (h.travel >= PROBE_STEP) {
          h.ground = h.ground0 = h.ground1
          h.ground1 = null
          h.travel = 0
        } else {
          h.ground = h.ground0 + (h.ground1 - h.ground0) * (h.travel / PROBE_STEP)
        }
      }
      h.fwd.addScaledVector(h.dir, -h.fwd.dot(h.dir)).normalize()

      // 置く: local Y = 上、local Z = 前
      h.obj.setRotationFromMatrix(_m.makeBasis(_right.crossVectors(h.dir, h.fwd), h.dir, h.fwd))
      const bob = Math.sin(now * 0.00035 + h.phase) * BOB
      h.obj.position.copy(h.dir).multiplyScalar(h.ground + HEAD_LIFT + bob - h.lampY)
    }
  }

  return { update }
}
