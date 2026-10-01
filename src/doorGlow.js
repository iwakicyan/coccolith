import * as THREE from 'three'

// ============================================================
//  ドアの光る輪郭（近づくと点灯 → タップで出入り）
//  扉の板（BoxGeometry）の子として、ひと回り大きい発光板と輪郭線を付ける
// ============================================================

const GLOW_COLOR = 0xBFF4FF
const PAD = 0.12   // 扉の外にはみ出す光の幅 (m)

export function addDoorGlow(door) {
  const { width, height, depth } = door.geometry.parameters
  // 扉の面方向は PAD ぶん広げ、厚み方向は扉より薄くして扉の中に隠す → 縁だけ光って見える
  const grow = (v) => (v > 0.3 ? v + PAD * 2 : v * 0.5)
  const halo = new THREE.Mesh(
    new THREE.BoxGeometry(grow(width), grow(height), grow(depth)),
    new THREE.MeshBasicMaterial({ color: GLOW_COLOR, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(door.geometry),
    new THREE.LineBasicMaterial({ color: GLOW_COLOR, transparent: true }),
  )
  const glow = new THREE.Group()
  glow.add(halo, edges)
  glow.visible = false
  door.add(glow)
  door.userData.glow = { group: glow, halo, edges }
}

// on: 点灯するか、t: 経過秒（ゆっくり明滅）
export function setDoorGlow(door, on, t) {
  const g = door.userData.glow
  if (!g) return
  g.group.visible = on
  if (!on) return
  const k = 0.5 + 0.5 * Math.sin(t * 3.0)
  g.halo.material.opacity  = 0.35 + 0.4 * k
  g.edges.material.opacity = 0.6 + 0.4 * k
}
