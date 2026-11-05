import * as THREE from 'three'

// ============================================================
//  Phong / Standard のマテリアルを Lambert に置き換える
//  マテリアルの種類が多いほど、初回に作るシェーダーが増えてスマホの起動が遅くなる。照り返しが目立たないものは Lambert にそろえる
//  my-3d-parts の部品はほかでも使うのでそのままにして、coccolith に置いてからここで置き換える
//
//  keep(material): true を返したマテリアルは置き換えない（金属の映り込みなど）
//  同じマテリアルを使うメッシュは、置き換えたあとも同じマテリアルを共有する
//  戻り値: 元のマテリアル → 置き換えたマテリアル（ほかで元のマテリアルを持っているところを差し替えるのに使う）
// ============================================================

export function toLambert(root, keep = () => false) {
  const done = new Map()
  const convert = (m) => {
    if (!m || !(m.isMeshPhongMaterial || m.isMeshStandardMaterial) || keep(m)) return m
    if (!done.has(m)) done.set(m, m.isMeshPhongMaterial ? new THREE.MeshLambertMaterial().copy(m) : fromStandard(m))
    return done.get(m)
  }
  root.traverse(o => {
    if (!o.isMesh) return
    o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material)
  })
  return done
}

// Standard は持っている項目が違うので、共通の項目だけ写す
function fromStandard(s) {
  const m = new THREE.MeshLambertMaterial()
  THREE.Material.prototype.copy.call(m, s)   // 透明・両面・深度などマテリアル共通の設定
  // Standard の拡散反射は metalness のぶん暗くなるので、色に掛けて明るさを合わせる
  m.color.copy(s.color).multiplyScalar(1 - s.metalness)
  for (const k of ['map', 'lightMap', 'lightMapIntensity', 'aoMap', 'aoMapIntensity', 'emissiveMap', 'emissiveIntensity',
    'bumpMap', 'bumpScale', 'normalMap', 'normalMapType', 'displacementMap', 'displacementScale', 'displacementBias',
    'alphaMap', 'wireframe', 'wireframeLinewidth', 'flatShading', 'fog']) m[k] = s[k]
  m.emissive.copy(s.emissive)
  m.normalScale.copy(s.normalScale)
  return m
}

// ============================================================
//  太陽の光を受けないようにする（夜の側に置いたもの用）
//  夜の側では、惑星の反対側の太陽が下から当たって、地面を向いた面が明るくなる
//  面の向き（法線）をぜんぶ惑星の外向き（root の位置の向き）にそろえると、太陽は面の裏から当たることになって光らない
//  シェーダーは増やさない（平らな陰影 flatShading をやめ、ほかの Lambert と同じシェーダーを使う。半透明のものは対象外）
//  環境光と sabちゃんのライト・街灯は受ける（面ごとの陰影はつかず、近いほど明るい）
//  root は置いたあと（行列が決まったあと）に渡す
// ============================================================

export function ignoreSun(root) {
  root.updateMatrixWorld(true)
  const up = root.getWorldPosition(new THREE.Vector3()).normalize()
  const mats = new Map()
  const m3 = new THREE.Matrix3()
  const n = new THREE.Vector3()
  root.traverse(o => {
    // 半透明のものは、平らな陰影をやめるとほかと共有できないシェーダーになるので、そのままにする
    if (!o.isMesh || [o.material].flat().some(m => m.transparent)) return
    // 法線は M^-T で写るので、ローカルの法線を M^T・up にすると、ワールドで up を向く
    n.copy(up).applyMatrix3(m3.setFromMatrix4(o.matrixWorld).transpose()).normalize()
    const g = o.geometry = o.geometry.clone()
    const count = g.attributes.position.count
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) arr.set([n.x, n.y, n.z], i * 3)
    g.setAttribute('normal', new THREE.BufferAttribute(arr, 3))
    const conv = (m) => {
      if (!m?.flatShading) return m
      if (!mats.has(m)) { const c = m.clone(); c.flatShading = false; mats.set(m, c) }
      return mats.get(m)
    }
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material)
  })
}
