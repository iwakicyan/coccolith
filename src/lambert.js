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
