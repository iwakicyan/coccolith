import * as THREE from 'three'

// ============================================================
//  金属の映り込み用の夜景（public/env/kanban.png, 2:1 正距円筒のパノラマ）
//  roughness に合わせてぼかせる PMREM（CubeUV）は scripts/bake-env.mjs で作っておいた画像を読むだけ
//  （ページで PMREMGenerator を回すと、スマホの起動が 1 秒近く止まる）
//  読み込みは非同期なので、マテリアルを登録しておき、届いたら envMap を差し込む
// ============================================================

const URL = `${import.meta.env.BASE_URL}env/kanban_pmrem.png`
let tex = null
let waiting = null   // 読み込み中: 届いたら envMap を差し込むマテリアル
let ready = null     // 読み込みが済んだら（失敗しても）解決する Promise

function load() {
  waiting = []
  ready = new Promise(resolve => {
    new THREE.TextureLoader().load(URL, t => {
      t.mapping = THREE.CubeUVReflectionMapping
      t.colorSpace = THREE.SRGBColorSpace
      t.generateMipmaps = false   // ぼかした段は画像の中に並んでいる
      t.minFilter = THREE.LinearFilter
      tex = t
      waiting.forEach(m => set(m, tex))
      waiting = []
      resolve()
    }, undefined, () => resolve())
  })
}

export function applyNightEnv(renderer, material) {
  if (!renderer) return
  if (!ready) load()
  if (tex) set(material, tex)
  else waiting.push(material)
}

// 夜景が届くまで待つ（使うマテリアルがなければすぐ解決）。届いてからシェーダーを作れば、あとで作り直さずに済む
export function whenNightEnvReady() {
  return ready ?? Promise.resolve()
}

function set(material, tex) {
  material.envMap = tex
  material.needsUpdate = true
}
