import * as THREE from 'three'
import { createCoin } from './coin.js'

// ============================================================
//  起動演出: sabちゃんの周りにコインが散らばり、
//  クルクル回りながら sabちゃんに吸い寄せられて消える
//  あわせて道に並べたコイン（placeLine）は、sabちゃんが近づくと同じように吸い寄せられる
// ============================================================

const COIN_COUNT  = 3
export const COIN_RADIUS = 0.3    // コインの半径 (m)（コイン箱に入れるコインの大きさ）
const FIELD_COIN_R = COIN_RADIUS * 2   // 地面に出るコイン（起動演出・道に並べたもの）の半径 (m)
const SCATTER_MIN = 2      // sabちゃんからの散らばり距離 (m)
const SCATTER_MAX = 5
export const POP_TIME    = 0.35   // 地面から飛び出して着地するまで (s)
export const POP_HEIGHT  = 0.8    // 飛び出しの高さ (m)
const WAIT_TIME   = 0.5    // 吸い寄せ開始までの待ち (s)
const STAGGER     = 0.1    // コインごとの吸い寄せ開始のずれ (s)
export const SPIN_IDLE   = 5      // 待機中の回転速度 (rad/s)
const SPIN_PULL   = 22     // 吸い寄せ中の最大回転速度 (rad/s)
const PULL_SPEED0 = 1.5    // 吸い寄せの初速 (m/s)
const PULL_ACCEL  = 28     // 吸い寄せの加速度 (m/s²)
const SHRINK_DIST = 1.2    // この距離から縮み始める (m)
const VANISH_DIST = 0.25   // この距離まで来たら消える (m)
const PICKUP_DIST = 5      // 道に並べたコインを拾う sabちゃんとの距離 (m)
const PICKUP_SPEED0 = 15   // 道に並べたコインの吸い寄せの初速 (m/s)。近づいたらすぐ回収されるよう速め

const _up    = new THREE.Vector3()
const _fwd   = new THREE.Vector3()
const _right = new THREE.Vector3()
const _to    = new THREE.Vector3()
const _mat   = new THREE.Matrix4()
const _spinQ = new THREE.Quaternion()
const _yAxis = new THREE.Vector3(0, 1, 0)

// getGround(dir): 惑星中心から dir 方向の地表までの距離 (m)
// onCollect(): コインが sabちゃんに吸い込まれるたびに呼ばれる
export function createCoinIntro({ scene, renderer, getGround, onCollect = () => {} }) {
  const coins = []

  function start(pDir, pFwd) {
    const right = new THREE.Vector3().crossVectors(pDir, pFwd)
    const base  = Math.random() * Math.PI * 2
    for (let i = 0; i < COIN_COUNT; i++) {
      // 円周上にほぼ均等 + ゆらぎで散らす
      const a = base + (i / COIN_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
      const r = SCATTER_MIN + Math.random() * (SCATTER_MAX - SCATTER_MIN)
      const dir = pDir.clone().multiplyScalar(getGround(pDir))
        .addScaledVector(pFwd, Math.cos(a) * r)
        .addScaledVector(right, Math.sin(a) * r)
        .normalize()
      const mesh = createCoin({ renderer, radius: FIELD_COIN_R })
      mesh.scale.setScalar(0)
      scene.add(mesh)
      coins.push({
        mesh,
        groundPos: dir.clone().multiplyScalar(getGround(dir) + FIELD_COIN_R + 0.05),
        ref: pFwd.clone(),                  // 向きの基準（接平面に投影して使う）
        spin: Math.random() * Math.PI * 2,
        age: 0,
        delay: POP_TIME + WAIT_TIME + i * STAGGER,
        speed: PULL_SPEED0,
      })
    }
    // 吸い寄せの順番をばらばらに
    const delays = coins.map(c => c.delay).sort(() => Math.random() - 0.5)
    coins.forEach((c, i) => { c.delay = delays[i] })
  }

  // dirs: コインを置く地点（惑星中心からの単位ベクトル）。sabちゃんが近づくまでその場で回る
  function placeLine(dirs) {
    for (const dir of dirs) {
      const mesh = createCoin({ renderer, radius: FIELD_COIN_R })
      scene.add(mesh)
      const groundPos = dir.clone().multiplyScalar(getGround(dir) + FIELD_COIN_R + 0.05)
      mesh.position.copy(groundPos)
      // 向きの基準は北極向き（経線に沿って並ぶので、道の先から見て正面になる）
      const ref = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize()
      coins.push({
        mesh, groundPos, ref,
        spin: Math.random() * Math.PI * 2,
        age: POP_TIME,          // 飛び出しの演出はせず、最初から置いてある
        delay: Infinity,        // 拾われるまで待つ（update で近づいたら今に縮める）
        speed: PULL_SPEED0,
      })
    }
  }

  function remove(c) {
    scene.remove(c.mesh)
    c.mesh.traverse(o => {
      o.geometry?.dispose()
      o.material?.dispose()
    })
  }

  // target: sabちゃんの位置（ワールド）
  function update(dt, target) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i]
      const { mesh } = c
      c.age += dt
      let scale = 1
      let spinSpd = SPIN_IDLE

      if (c.age < POP_TIME) {
        // 地面からポンと飛び出す
        const t = c.age / POP_TIME
        scale = 1 - Math.pow(1 - t, 3)
        _up.copy(c.groundPos).normalize()
        mesh.position.copy(c.groundPos).addScaledVector(_up, Math.sin(Math.PI * t) * POP_HEIGHT)
      } else if (c.age < c.delay) {
        mesh.position.copy(c.groundPos)
        if (c.delay === Infinity && mesh.position.distanceTo(target) < PICKUP_DIST) {
          c.delay = c.age
          c.speed = PICKUP_SPEED0
        }
      } else {
        // sabちゃんへ加速しながら吸い寄せられる
        c.speed += PULL_ACCEL * dt
        _to.copy(target).sub(mesh.position)
        const dist = _to.length()
        const step = c.speed * dt
        if (dist <= VANISH_DIST || step >= dist) {
          remove(c)
          coins.splice(i, 1)
          onCollect()
          continue
        }
        mesh.position.addScaledVector(_to, step / dist)
        scale = Math.min(1, dist / SHRINK_DIST)
        spinSpd = SPIN_IDLE + (SPIN_PULL - SPIN_IDLE) * Math.min(1, (c.age - c.delay) / 0.4)
      }

      // 惑星の法線を上にして立て、その軸でクルクル回す
      c.spin += spinSpd * dt
      _up.copy(mesh.position).normalize()
      _fwd.copy(c.ref).addScaledVector(_up, -c.ref.dot(_up)).normalize()
      _right.crossVectors(_up, _fwd)
      _mat.makeBasis(_right, _up, _fwd)
      mesh.quaternion.setFromRotationMatrix(_mat).multiply(_spinQ.setFromAxisAngle(_yAxis, c.spin))
      mesh.scale.setScalar(Math.max(scale, 0.001))
    }
  }

  return { start, placeLine, update }
}
