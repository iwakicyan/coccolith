import * as THREE from 'three'

// ============================================================
//  壁に貼るドット絵（販売所の奥の壁のねうさぎ など）
//  art = { front: [コマ…], left: [コマ…], right: [コマ…] }（各コマは書き出しの { palette, width, height, grid }）
//    left = 壁に向かって左側から見た絵、right = 壁に向かって右側から見た絵
//  見る向きを、壁の正面から ±30° の内なら front、その外は left / right に切り替える（60° ずつ）
//  コマは 1 → 2 → 3 → 2 → 1 → 2 → 3 … と往復させる
//  絵は 1 枚のテクスチャに並べ、テクスチャの offset だけを毎フレーム変える（マテリアルは pixelSprite.js と同じ設定）
// ============================================================

const SELF_LIGHT = 0.4   // pixelSprite.js と同じ（日の当たらないところでも絵が見えるよう、絵の色を少し自分で光らせる）
const SIDE_ANGLE = Math.PI / 6   // 正面の絵を出す範囲（壁の正面から左右それぞれ 30°）
const VIEWS = ['front', 'left', 'right']

const walls = []
const _cam = new THREE.Vector3()

// height: 絵 1 マスの高さ (m、parent のローカル単位)。返す板の原点は絵の下端の真ん中、+Z が壁から手前
export function createWallSprite(art, height, { fps = 1 / 0.4 } = {}) {   // 1 コマ 0.4 秒
  const f0 = art.front[0]
  const cw = f0.width, ch = f0.height
  const frames = art.front.length
  // 横にコマ、縦に向き。絵と絵の間は 1 px 空けて、隣の絵のドットがにじまないようにする
  const cv = document.createElement('canvas')
  cv.width = frames * (cw + 1)
  cv.height = VIEWS.length * (ch + 1)
  const ctx = cv.getContext('2d')
  VIEWS.forEach((v, row) => art[v].forEach((f, i) => {
    f.grid.forEach((line, y) => line.forEach((n, x) => {
      if (!f.palette[n]) return
      ctx.fillStyle = f.palette[n]
      ctx.fillRect(i * (cw + 1) + x, row * (ch + 1) + y, 1, 1)
    }))
  }))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.repeat.set(cw / cv.width, ch / cv.height)
  const mat = new THREE.MeshLambertMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: SELF_LIGHT, alphaTest: 0.5, side: THREE.DoubleSide,
  })
  const w = height * cw / ch
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, height).translate(0, height / 2, 0), mat)
  mesh.name = '壁のドット絵'
  // 往復の並び（3 コマなら 0,1,2,1）
  const order = [...Array(frames).keys(), ...[...Array(Math.max(frames - 2, 0)).keys()].map(i => frames - 2 - i)]
  walls.push({ mesh, tex, order, fps, cw, ch, cvW: cv.width, cvH: cv.height })
  return mesh
}

// 毎フレーム: 見る向きで絵を選び、時間でコマを進める
export function updateWallSprites(t, camera) {
  for (const s of walls) {
    if (!s.mesh.visible) continue
    _cam.setFromMatrixPosition(camera.matrixWorld)
    s.mesh.worldToLocal(_cam)
    const a = Math.atan2(_cam.x, _cam.z)   // 0 = 正面、+ = 壁に向かって右側（ローカル +X）から
    const row = a > SIDE_ANGLE ? 2 : a < -SIDE_ANGLE ? 1 : 0
    const col = s.order[Math.floor(t * s.fps) % s.order.length]
    // テクスチャは上下反転して貼られるので、v は下から数える
    s.tex.offset.set(col * (s.cw + 1) / s.cvW, 1 - (row * (s.ch + 1) + s.ch) / s.cvH)
  }
}
