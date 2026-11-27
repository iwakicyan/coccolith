import * as THREE from 'three'
import { createKaniSwarm, createKaniPoser } from '../my-3d-parts/parts/kani.js'
import { createBlobShadows } from './blobShadow.js'

// ============================================================
//  カニ（my-3d-parts/parts/kani.js）を星の x プラス側（昼側）の陸に count 匹出して、縦歩きでうろうろさせる
//  歩き方は bluedog（bluedog.js）と同じ：歩く・休むを交互にくり返し、歩くあいだは少しずつ曲がる。PROBE_STEP 先の地面を測り、海なら向きを変える
//    昼側から出そうになったら（向きの x が DAY_X より小さい）、x プラスのほうへ向きを変える
//  sabちゃんが NEAR (m) まで近づいたカニは止まって sabちゃんのほうを向き、はさみを上げてチョキチョキする（NEAR + 1m より離れたらまた歩く）
//  全員をまとめて描く（createKaniSwarm。何匹でも描画 11 回）。影は足元の地面に板を置く（blobShadow.js。全員で描画 1 回）
// ============================================================

const DAY_X       = 0.15        // 向き（星の中心から。長さ 1）の x がこれより大きい所にいる
const TURN_MAX    = 0.8         // 曲がる速さの上限 (rad/s)
const TURN_CHANGE = 1.0         // 曲がる速さが変わる時間のめやす (s)
const WALK_TIME   = [4, 9]      // 歩く時間 (s)
const REST_TIME   = [1.5, 4]    // 休む時間 (s)
const PROBE_STEP  = 0.5         // 先の地面を測る間隔 (m)
const NEAR        = 3           // sabちゃんがこれより近いとチョキチョキする (m)
const FACE        = 3           // sabちゃんや昼側のほうへ向きを変える速さ (rad/s)

// 影の板の形：前（+z）がはさみ側。高さ 1 のときの点（x, z）
const SHADOW_PTS = [[0, 0.4], [0.45, 0.3], [0.7, 0], [0.45, -0.3], [0, -0.38], [-0.45, -0.3], [-0.7, 0], [-0.45, 0.3]]

const rand = ([a, b]) => a + Math.random() * (b - a)
const _right = new THREE.Vector3(), _axis = new THREE.Vector3(), _next = new THREE.Vector3(), _t = new THREE.Vector3()
const PLUS_X = new THREE.Vector3(1, 0, 0)

// fwd を、dir の接平面に映した target のほうへ最大 rate*dt (rad) 回す
function turnToward(dir, fwd, target, rate, dt) {
  _t.copy(target).addScaledVector(dir, -target.dot(dir))
  if (_t.lengthSq() < 1e-10) return
  _t.normalize()
  const ang = Math.atan2(_right.crossVectors(fwd, _t).dot(dir), fwd.dot(_t))
  fwd.applyAxisAngle(dir, Math.sign(ang) * Math.min(Math.abs(ang), rate * dt))
}

// count: 数 / height: 高さ (m) / radius: 星の半径 (m)
// getGround(dir): その向きの地面の高さ（星の中心から m）/ waterLevel: これより低い地面は海
export function createKaniWalkers({ scene, count = 20, height = 0.8, radius, getGround, waterLevel }) {
  const isWater = g => g < waterLevel
  const shadows = createBlobShadows({ scene, count, name: 'カニの影', pts: SHADOW_PTS.map(([x, z]) => [x * height, z * height]) })
  const swarm = createKaniSwarm(count, { height })
  swarm.group.children.forEach(m => { m.castShadow = false })   // 影は足元の板で出す
  scene.add(swarm.group)

  const crabs = []
  for (let i = 0; i < count; i++) {
    // 昼側の陸のランダムな所
    const dir = new THREE.Vector3()
    let ground
    for (let n = 0; n < 200; n++) {
      dir.randomDirection()
      if (dir.x < DAY_X + 0.1) continue
      ground = getGround(dir)
      if (!isWater(ground)) break
    }
    const fwd = new THREE.Vector3().randomDirection()
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize()
    crabs.push({ dir, fwd, ground, ground0: ground, ground1: null, travel: 0, turn: 0, turnTarget: 0,
      walking: Math.random() < 0.5, timer: rand(REST_TIME), near: false, poser: createKaniPoser(), matrix: new THREE.Matrix4() })
  }

  // sabDir: sabちゃんの足元の向き（星の中心から。長さ 1）
  function update(dt, sabDir) {
    for (let i = 0; i < crabs.length; i++) {
      const c = crabs[i]
      const dSab = sabDir ? c.dir.angleTo(sabDir) * c.ground : Infinity
      c.near = c.near ? dSab < NEAR + 1 : dSab < NEAR
      if (c.near) turnToward(c.dir, c.fwd, _next.copy(sabDir).sub(c.dir), FACE, dt)   // sabちゃんのほうを向く
      else {
        c.timer -= dt
        if (c.timer <= 0) { c.walking = !c.walking; c.timer = rand(c.walking ? WALK_TIME : REST_TIME) }
        if (c.walking) {
          if (Math.random() < dt / TURN_CHANGE) c.turnTarget = (Math.random() * 2 - 1) * TURN_MAX
          c.turn += (c.turnTarget - c.turn) * Math.min(1, dt * 2)
          c.fwd.applyAxisAngle(c.dir, c.turn * dt)
          if (c.dir.x < DAY_X) turnToward(c.dir, c.fwd, PLUS_X, FACE, dt)   // 夜側へ出そうなら昼側へ
        }
      }
      // 姿勢を進める（返り値の速さで前へ進む）
      const v = swarm.speedOf(c.poser.update(dt, { walk: !c.near && c.walking, snip: c.near }))
      if (v > 0) {
        // PROBE_STEP 先の地面を測る。海なら進まずに後ろ寄りへ向きを変える
        _axis.crossVectors(c.dir, c.fwd).normalize()
        if (c.ground1 === null) {
          const ahead = getGround(_next.copy(c.dir).applyAxisAngle(_axis, PROBE_STEP / radius))
          if (isWater(ahead)) c.fwd.applyAxisAngle(c.dir, Math.PI * (0.6 + Math.random() * 0.8))
          else c.ground1 = ahead
        }
        // 前へ進み、高さは測った 2 地点のあいだをならす
        if (c.ground1 !== null) {
          c.dir.applyAxisAngle(_axis, v * dt / radius).normalize()
          c.travel += v * dt
          if (c.travel >= PROBE_STEP) { c.ground = c.ground0 = c.ground1; c.ground1 = null; c.travel = 0 }
          else c.ground = c.ground0 + (c.ground1 - c.ground0) * (c.travel / PROBE_STEP)
        }
      }
      c.fwd.addScaledVector(c.dir, -c.fwd.dot(c.dir)).normalize()
      // 置く: local Y = 上、local Z = 前、原点 = 足元
      c.matrix.makeBasis(_right.crossVectors(c.dir, c.fwd), c.dir, c.fwd).setPosition(_next.copy(c.dir).multiplyScalar(c.ground))
      swarm.set(i, c.matrix, c.poser)
      shadows.set(i, c.dir, c.fwd, c.ground)
    }
    swarm.commit()
    shadows.commit()
  }
  return { update, crabs }
}
