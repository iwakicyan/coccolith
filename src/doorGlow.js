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

// アーチ形の扉（下が四角で上が半円）の輪郭を光らせる。addDoorGlow と同じく setDoorGlow で点灯する
// door: 原点 = 扉の下端の真ん中（厚みの真ん中）、+y が上、+z が外の Object3D
// width: 幅、height: 下端からアーチの頂点まで、depth: 厚み、pad: 外にはみ出す光の幅（どれも door のローカル単位）
export function addArchDoorGlow(door, { width, height, depth, pad = PAD, curveSegments = 2 }) {
  // アーチは扉の板と同じく 1/4 円を2つつなぐ（分割の位置を板に合わせる）
  const arch = (hw) => {
    const s = new THREE.Shape()
    s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, height - width / 2)
    s.absarc(0, height - width / 2, hw, 0, Math.PI / 2, false)
    s.absarc(0, height - width / 2, hw, Math.PI / 2, Math.PI, false)
    s.lineTo(-hw, 0)
    return s
  }
  // 扉よりひと回り大きく、厚みは扉の半分にして扉の中に隠す → 縁だけ光って見える
  const haloGeo = new THREE.ExtrudeGeometry(arch(width / 2 + pad), { depth: depth * 0.5, bevelEnabled: false, curveSegments })
  haloGeo.translate(0, 0, -depth * 0.25)
  const halo = new THREE.Mesh(
    haloGeo,
    new THREE.MeshBasicMaterial({ color: GLOW_COLOR, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  // 扉の表の面の輪郭線
  const pts = arch(width / 2).getPoints(curveSegments).map(p => new THREE.Vector3(p.x, p.y, depth / 2 + 0.005))
  const edges = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: GLOW_COLOR, transparent: true }))
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
