import * as THREE from 'three'
import { createKani, createKaniMotion } from '../my-3d-parts/parts/kani.js'

// ============================================================
//  海辺のカニ（my-3d-parts/parts/kani.js）：置いた所のまわり ROAM_R (m) を縦歩きでうろうろする
//    歩く WALK 秒・休む REST 秒をくり返し、歩くあいだはゆっくり向きを変える（ふらふら）
//    置いた所から ROAM_R より離れたら置いた所へ向かい、少し先が海（地面が海面 + SHORE より低い）なら向きを変えて陸へ戻る
//    sabちゃんが NEAR (m) まで近づくと止まって sabちゃんのほうを向き、はさみを上げてチョキチョキする（NEAR + 1m より離れたらまた歩く）
//    地面の高さは毎フレーム測る（1 匹だけなので）
// ============================================================

const HEIGHT = 0.8          // カニの高さ (m)。sabちゃん（1.2m）の 3 分の 2 くらい
const ROAM_R = 6            // 置いた所からこれより離れたら戻ってくる (m)
const SHORE  = 0.3          // 地面が海面からこれより低い所へは行かない (m)
const LOOK   = 1.2          // 海かどうかを見る、進む向きの少し先 (m)
const NEAR   = 3            // sabちゃんがこれより近いとチョキチョキする (m)
const WALK   = [4, 9]       // 1 回に歩く時間 (s)
const REST   = [1.5, 4]     // 1 回に休む時間 (s)
const TURN   = 0.6          // ふらふら向きを変える速さ (rad/s)
const FACE   = 3            // sabちゃんや置いた所のほうへ向きを変える速さ (rad/s)

const rand = ([a, b]) => a + Math.random() * (b - a)

// home: 置く所の向き（星の中心から。長さ 1）
// groundAt(dir): その向きの地面の高さ（星の中心から m）/ seaAt(dir): その向きの海面の高さ（潮で変わる）
export function createKaniWalker({ scene, home, groundAt, seaAt }) {
  const root = createKani({ height: HEIGHT })
  root.traverse(o => { if (o.isMesh) o.receiveShadow = true })
  scene.add(root)
  const motion = createKaniMotion(root)

  const dir = home.clone().normalize()
  const ref = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const fwd = new THREE.Vector3().crossVectors(dir, ref).normalize().applyAxisAngle(dir, Math.random() * Math.PI * 2)
  let ground = groundAt(dir)
  let walking = true, timer = rand(WALK), turn = 0, near = false

  const _t = new THREE.Vector3(), _x = new THREE.Vector3(), _ahead = new THREE.Vector3(), _m = new THREE.Matrix4()
  // fwd を target（接平面の向き）のほうへ最大 rate*dt (rad) 回す
  const turnToward = (target, rate, dt) => {
    _t.copy(target).addScaledVector(dir, -target.dot(dir))
    if (_t.lengthSq() < 1e-10) return
    _t.normalize()
    const ang = Math.atan2(_x.crossVectors(fwd, _t).dot(dir), fwd.dot(_t))
    fwd.applyAxisAngle(dir, Math.sign(ang) * Math.min(Math.abs(ang), rate * dt))
  }
  const isSea = d => groundAt(d) < seaAt(d) + SHORE

  // sabDir: sabちゃんの足元の向き（星の中心から。長さ 1）
  function update(dt, sabDir) {
    const dSab = sabDir ? dir.angleTo(sabDir) * ground : Infinity
    near = near ? dSab < NEAR + 1 : dSab < NEAR
    if (near) {
      turnToward(_t.copy(sabDir).sub(dir), FACE, dt)   // sabちゃんのほうを向く
    } else {
      timer -= dt
      if (timer <= 0) { walking = !walking; timer = rand(walking ? WALK : REST); turn = (Math.random() * 2 - 1) * TURN }
      if (walking) {
        if (Math.random() < dt * 0.5) turn = (Math.random() * 2 - 1) * TURN   // ときどきふらふらの向きを変える
        fwd.applyAxisAngle(dir, turn * dt)
        if (dir.angleTo(home) * ground > ROAM_R) turnToward(_t.copy(home).sub(dir), FACE, dt)   // 離れすぎたら置いた所へ
      }
    }
    // 前の少し先が海なら、陸のほうへ向き直る（進まずにその場で回る）
    _ahead.copy(dir).multiplyScalar(ground).addScaledVector(fwd, LOOK).normalize()
    const blocked = !near && walking && isSea(_ahead)
    if (blocked) fwd.applyAxisAngle(dir, FACE * dt * (turn >= 0 ? 1 : -1))
    const v = motion.update(dt, { walk: !near && walking, snip: near })
    if (!blocked && v > 0) {
      // 前へ進む（大円に沿って）
      _x.crossVectors(dir, fwd).normalize()
      const a = v * dt / ground
      dir.applyAxisAngle(_x, a).normalize()
      fwd.applyAxisAngle(_x, a).addScaledVector(dir, -fwd.dot(dir)).normalize()
    }
    // 地面に立たせる（上 = 星の外向き、前 = fwd）
    ground += (groundAt(dir) - ground) * Math.min(1, 10 * dt)
    _x.crossVectors(dir, fwd).normalize()
    _m.makeBasis(_x, dir, fwd)
    root.quaternion.setFromRotationMatrix(_m)
    root.position.copy(dir).multiplyScalar(ground)
  }
  return { root, update }
}
