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

// 置き物の地面との接地ライン（BoxGeometry の台の、地面に入るところ）を光らせる
// ドアと同じく setDoorGlow で点灯する。y: 接地ラインの高さ、pad: 外にはみ出す光の幅、band: 光の帯の高さ（どれも mesh のローカル単位）
export function addGroundGlow(mesh, { y, pad, band }) {
  const { width, depth } = mesh.geometry.parameters
  // 台よりひと回り大きい薄い箱。内側は台に隠れるので、台のまわりに光の帯が出る
  const haloGeo = new THREE.BoxGeometry(width + pad * 2, band, depth + pad * 2)
  haloGeo.translate(0, y, 0)
  const halo = new THREE.Mesh(
    haloGeo,
    new THREE.MeshBasicMaterial({ color: GLOW_COLOR, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  // 台の側面が地面に入るところの四角い線
  const w = width / 2, d = depth / 2
  const lineGeo = new THREE.BufferGeometry().setFromPoints([[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => new THREE.Vector3(x, y, z)))
  const edges = new THREE.LineLoop(lineGeo, new THREE.LineBasicMaterial({ color: GLOW_COLOR, transparent: true }))
  const glow = new THREE.Group()
  glow.add(halo, edges)
  glow.visible = false
  mesh.add(glow)
  mesh.userData.glow = { group: glow, halo, edges }
}

// on: 点灯するか、t: 経過秒（明滅。弱いときはほとんど消える）
export function setDoorGlow(door, on, t) {
  const g = door.userData.glow
  if (!g) return
  g.group.visible = on
  if (!on) return
  const k = 0.5 + 0.5 * Math.sin(t * 5.0)
  g.halo.material.opacity  = 0.05 + 0.7 * k
  g.edges.material.opacity = 0.15 + 0.85 * k
}
