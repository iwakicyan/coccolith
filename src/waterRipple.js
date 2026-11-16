import * as THREE from 'three'

// ============================================================
//  水面の波紋 — 明るい水色のローポリのトーラスが、少しずつ遅れて 3 つ水面に広がって消える
//  createWaterRipples({ scene })
//    spawn(point): point（ワールド座標。水面の上の点）を中心に波紋を出す。水面は星の中心から point への向きに垂直
//  update(dt) を毎フレーム呼ぶ
// ============================================================

const COLOR    = 0x9fefff   // 明るい水色
const RINGS    = 3          // 1 回に広がる輪の数
const GAP      = 0.3        // 輪どうしが出る間隔 (s)
const LIFE     = 1.6        // 1 つの輪が広がりきって消えるまで (s)
const R_START  = 0.15       // 出たときの半径 (m)
const R_END    = 2.4        // 広がりきったときの半径 (m)
const TUBE     = 0.06       // 輪の太さ (m)
const LIFT     = 0.03       // 水面から浮かせる高さ (m)。水面とちらつかないように

// ローポリ（断面 3 角・周り 14 角）。半径 1 の輪を、水面に沿う向き（xy）だけ広げて使う（広がるほど輪の幅も少し太くなる。高さ（z）は変えない）
const geo = new THREE.TorusGeometry(1, TUBE, 3, 14)

const easeOut = s => 1 - (1 - s) ** 2
const _z = new THREE.Vector3(0, 0, 1)

export function createWaterRipples({ scene }) {
  const rings = []   // { mesh, mat, age }（age が負の間はまだ出ていない）

  function spawn(point) {
    const up = point.clone().normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(_z, up)   // トーラスの軸（+Z）を水面の法線へ
    const pos = point.clone().addScaledVector(up, LIFT)
    for (let i = 0; i < RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, depthWrite: false })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = '波紋'
      mesh.position.copy(pos)
      mesh.quaternion.copy(q)
      mesh.visible = false
      scene.add(mesh)
      rings.push({ mesh, mat, age: -i * GAP })
    }
  }

  function update(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.age += dt
      if (r.age < 0) continue
      const s = r.age / LIFE
      if (s >= 1) {
        scene.remove(r.mesh)
        r.mat.dispose()
        rings.splice(i, 1)
        continue
      }
      const R = R_START + (R_END - R_START) * easeOut(s)
      r.mesh.scale.set(R, R, 1)
      r.mat.opacity = 0.9 * (1 - s)
      r.mesh.visible = true
    }
  }

  return { spawn, update }
}
