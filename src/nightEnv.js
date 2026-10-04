import * as THREE from 'three'

// ============================================================
//  金属の映り込み用の夜景（public/env/kanban.png, 2:1 正距円筒のパノラマ）
//  renderer ごとに 1 回だけ読み込み、roughness に合わせてぼかせるよう PMREM にする
//  読み込みは非同期なので、マテリアルを登録しておき、届いたら envMap を差し込む
// ============================================================

const URL = `${import.meta.env.BASE_URL}env/kanban.png`
const cache = new WeakMap()   // renderer → { tex, waiting }

export function applyNightEnv(renderer, material) {
  if (!renderer) return
  let entry = cache.get(renderer)
  if (!entry) {
    entry = { tex: null, waiting: [] }
    cache.set(renderer, entry)
    new THREE.TextureLoader().load(URL, img => {
      img.mapping = THREE.EquirectangularReflectionMapping
      img.colorSpace = THREE.SRGBColorSpace
      const pmrem = new THREE.PMREMGenerator(renderer)
      entry.tex = pmrem.fromEquirectangular(img).texture
      pmrem.dispose()
      img.dispose()
      entry.waiting.forEach(m => set(m, entry.tex))
      entry.waiting = null
    })
  }
  if (entry.tex) set(material, entry.tex)
  else entry.waiting.push(material)
}

function set(material, tex) {
  material.envMap = tex
  material.needsUpdate = true
}
