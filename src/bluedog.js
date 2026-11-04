import * as THREE from 'three'
import { createBluedog, createBluedogWalk, BLUEDOG_HEIGHT } from '../my-3d-parts/parts/bluedog.js'
import { createBlobShadows } from './blobShadow.js'

// ============================================================
//  bluedog（my-3d-parts/parts/bluedog.js）を星の陸に出して歩き回らせる
//  歩き方はドット絵の生き物（pixelSprite.js の createPixelSpriteWalkers）と同じ:
//    歩く・立ち止まるを交互にくり返し、歩くあいだは少しずつ曲がる。PROBE_STEP 先の地面を測り、海なら向きを変える
//  歩いているあいだは脚・体・しっぽを動かし（createBluedogWalk）、立ち止まるときはなめらかに元の形へ戻す
//  影は太陽の影（castShadow）を使わず、体の真下の地面にダークグレーの板を置く（頭と胴の形の 2 つの五角形をつないだ 8 角形）
//    全員ぶんを 1 回で描く（blobShadow.js）。板は体の上下や脚の動きにはつられず、足元の地面に張り付く
// ============================================================

const TURN_MAX    = 1.0         // 曲がる速さの上限 (rad/s)
const TURN_CHANGE = 1.0         // 曲がる速さが変わる時間のめやす (s)
const WALK_TIME   = [3, 7]      // 歩く時間 (s)
const STOP_TIME   = [2, 6]      // 立ち止まる時間 (s)
const PROBE_STEP  = 0.5         // 先の地面を測る間隔 (m)
const NEAR_DIST   = [3, 6]      // near のとき、スポーン地点から離す距離 (m)
const NEAR_SPREAD = THREE.MathUtils.degToRad(40)   // near のとき、スポーンの正面から左右にこの角度までの範囲に出す
const AMP_RATE    = 4           // 歩き出し・立ち止まりで動きの大きさが変わる速さ（1 秒あたり）
const STEP_RATE   = 2.0         // 脚を振る速さ（歩く速さ ÷ 高さ に掛けてモーションの時間を進める。歩幅と足の運びが合うように。高さ 1m・0.8m/s で 1 秒に約 2.6 歩）

// 影の板の形：前（+z）が頭側。幅 1 のときの点（x, z）。2 つの五角形（頭と胴）を腰でつないだ 8 角形
const SHADOW_PTS   = [[0, 0.803], [0.5, 0.437], [0.355, 0], [0.5, -0.443], [0, -0.803], [-0.5, -0.443], [-0.355, 0], [-0.5, 0.437]]
const SHADOW_W     = 2.0        // 影の幅（モデル単位。BLUEDOG_HEIGHT が全体の高さ）
const SHADOW_Z     = -0.05      // 影の中心を前後にずらす量（モデル単位）

const rand = ([a, b]) => a + Math.random() * (b - a)
const _right = new THREE.Vector3()
const _axis  = new THREE.Vector3()
const _next  = new THREE.Vector3()
const _m     = new THREE.Matrix4()

// count: 数 / height: 高さ (m) / speed: 歩く速さ (m/s) / radius: 星の半径 (m)
// getGround(dir): その向きの地面の高さ（星の中心から m）/ waterLevel: これより低い地面は海
// spawn: { dir, fwd } スポーン地点（near のとき、この正面寄りに出す）/ near: true ならスポーン地点の近くに出す
export function createBluedogWalkers({ scene, count = 1, height = 1, speed = 0.8, radius, getGround, waterLevel, spawn, near = false }) {
  const isWater = g => g < waterLevel
  const dogs = []

  // 影の板（全員ぶんを 1 回で描く）
  const k = height / BLUEDOG_HEIGHT
  const shadows = createBlobShadows({ scene, count, name: 'bluedog の影',
    pts: SHADOW_PTS.map(([x, z]) => [x * SHADOW_W * k, (z * SHADOW_W + SHADOW_Z) * k]) })

  for (let i = 0; i < count; i++) {
    const model = createBluedog({ height, merge: true })   // 動く部分ごとに 1 メッシュ＋輪郭線（1 匹で描画 12 回）
    const holder = new THREE.Group()   // 星の上での位置と向き（local Y = 上、local Z = 前、原点 = 足元）
    holder.name = 'bluedog'
    holder.add(model)
    model.traverse(o => { if (o.isMesh) o.castShadow = false })   // 影は下の板で出す
    scene.add(holder)
    const walk = createBluedogWalk(model)

    const dir = new THREE.Vector3()
    let ground
    if (near && spawn) {
      const a = (Math.random() * 2 - 1) * NEAR_SPREAD
      const toward = _next.copy(spawn.fwd).applyAxisAngle(spawn.dir, a)
      _axis.crossVectors(spawn.dir, toward).normalize()
      dir.copy(spawn.dir).applyAxisAngle(_axis, rand(NEAR_DIST) / radius).normalize()
      ground = getGround(dir)
    } else {
      for (let n = 0; n < 200; n++) {
        dir.randomDirection()
        ground = getGround(dir)
        if (!isWater(ground)) break
      }
    }
    // 最初はスポーン地点のほうを向かせる（near のとき）。そうでなければランダム
    const fwd = near && spawn
      ? new THREE.Vector3().copy(spawn.dir).sub(dir)
      : new THREE.Vector3().randomDirection()
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize()
    dogs.push({ holder, walk, dir, fwd, ground, ground0: ground, ground1: null, travel: 0, turn: 0, turnTarget: 0,
      walking: false, timer: rand(STOP_TIME), animT: 0, amp: 0 })
  }

  function update(dt) {
    const da = speed / radius * dt
    for (let i = 0; i < dogs.length; i++) {
      const d = dogs[i]
      d.timer -= dt
      if (d.timer <= 0) {
        d.walking = !d.walking
        d.timer = rand(d.walking ? WALK_TIME : STOP_TIME)
      }
      if (d.walking) {
        if (Math.random() < dt / TURN_CHANGE) d.turnTarget = (Math.random() * 2 - 1) * TURN_MAX
        d.turn += (d.turnTarget - d.turn) * Math.min(1, dt * 2)
        d.fwd.applyAxisAngle(d.dir, d.turn * dt)

        // PROBE_STEP 先の地面を測る。海なら進まずに後ろ寄りへ向きを変える
        _axis.crossVectors(d.dir, d.fwd).normalize()
        if (d.ground1 === null) {
          const ahead = getGround(_next.copy(d.dir).applyAxisAngle(_axis, PROBE_STEP / radius))
          if (isWater(ahead)) d.fwd.applyAxisAngle(d.dir, Math.PI * (0.6 + Math.random() * 0.8))
          else d.ground1 = ahead
        }
        // 前へ進み、高さは測った 2 地点のあいだをならす
        if (d.ground1 !== null) {
          d.dir.applyAxisAngle(_axis, da).normalize()
          d.travel += speed * dt
          if (d.travel >= PROBE_STEP) {
            d.ground = d.ground0 = d.ground1
            d.ground1 = null
            d.travel = 0
          } else {
            d.ground = d.ground0 + (d.ground1 - d.ground0) * (d.travel / PROBE_STEP)
          }
        }
        d.fwd.addScaledVector(d.dir, -d.fwd.dot(d.dir)).normalize()
      }

      // 脚の動き：歩いているあいだは大きさを 1 へ、止まったら 0 へ寄せる（0 になったら元の形に戻して止める）
      const target = d.walking ? 1 : 0
      d.amp += Math.sign(target - d.amp) * Math.min(Math.abs(target - d.amp), dt * AMP_RATE)
      if (d.amp > 0) {
        d.animT += dt * speed * STEP_RATE / height
        d.walk.update(d.animT, d.amp)
      } else if (d.animT) {
        d.walk.stop()
        d.animT = 0
      }

      // 置く: local Y = 上、local Z = 前、原点 = 足元
      d.holder.setRotationFromMatrix(_m.makeBasis(_right.crossVectors(d.dir, d.fwd), d.dir, d.fwd))
      d.holder.position.copy(d.dir).multiplyScalar(d.ground)

      // 影：足元の地面に、体と同じ向きで置く
      shadows.set(i, d.dir, d.fwd, d.ground)
    }
    shadows.commit()
  }

  return { update, dogs }
}
