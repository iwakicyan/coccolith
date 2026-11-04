import * as THREE from 'three'

// ============================================================
//  擬似的な影 — 足元の地面にダークグレーの板を置く（本物の影 castShadow の代わり）
//  同じ形の影を count 個、InstancedMesh 1 つで描く（何個でも描画 1 回）
//  板は地面と平行で、置くものと同じ向き（前 = +z）。地面から少し浮かせ、手前に描く設定でちらつきを防ぐ
//  光の当たり方は地面と同じ（Lambert）なので、昼は濃い影に、夜は暗く沈む
//  星じゅうに散らばるので、まとめて描く（frustumCulled = false。地平線の向こうを隠す処理からも外れる）
// ============================================================

export const BLOB_SHADOW_COLOR = 0x565656
const _m = new THREE.Matrix4()
const _right = new THREE.Vector3()

// pts: 板の形の点 [x, z]（m。前が +z）/ count: 数 / lift: 地面から浮かせる高さ (m)
export function createBlobShadows({ scene, pts, count, lift = 0.02, color = BLOB_SHADOW_COLOR, name = '影' }) {
  // Shape は xy 平面なので、z を -y にして作り、x 軸まわりに倒して xz 平面（法線が上）にする
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
  const mat = new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.name = name
  mesh.frustumCulled = false
  scene.add(mesh)

  // i 番目の影を、星の中心から見た向き dir（上）・前 fwd・地面の高さ ground（星の中心から m）に置く
  function set(i, dir, fwd, ground) {
    _m.makeBasis(_right.crossVectors(dir, fwd), dir, fwd)
    const r = ground + lift
    _m.setPosition(dir.x * r, dir.y * r, dir.z * r)
    mesh.setMatrixAt(i, _m)
  }
  // 全部置いたら呼ぶ
  function commit() { mesh.instanceMatrix.needsUpdate = true }

  return { set, commit, mesh }
}

// 幅 w・長さ l (m) の sides 角形（既定は 8 角形で楕円に近い形）。ずらす量 dz で前後に寄せる
export function polygonShadow(w, l, dz = 0, sides = 8) {
  const pts = []
  for (let i = 0; i < sides; i++) {
    const a = (i + 0.5) / sides * Math.PI * 2
    pts.push([Math.sin(a) * w / 2, Math.cos(a) * l / 2 + dz])
  }
  return pts
}
