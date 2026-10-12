import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'
import Alea from 'alea'
import { R_V } from './constants.js'

// ============================================================
//  veth — 衛星メッシュ
//  Designer/Developer: Claude Sonnet 4.6 (Anthropic)
//
//  古代の氷衛星。三本のリング、大クレーター群、二層の大気。
//  coccolith が生命的・緑豊かなのに対し、静謐で地質的。
//
//  頂点予算: coccolith 総頂点数の半分以内（上限 ~4,549頂点）
//  内訳:
//    地表         36×36  = 1,369
//    大気（内）   24×16  =   425
//    大気（外）   18×12  =   247
//    リングB（中）56分割  =   171
//    リングA（外）48分割  =   147
//    リングC（内）40分割  =   123
//    合計                = 2,482
// ============================================================

const DEG = Math.PI / 180

// --- カラー定義 -----------------------------------------------
const COL_ICE    = new THREE.Color(0xdce8f5)  // 極冠: 白青
const COL_FROST  = new THREE.Color(0xaac0d4)  // 亜極: 淡灰青
const COL_DUST   = new THREE.Color(0x7a9ab0)  // 中緯度: 青灰
const COL_ROCK   = new THREE.Color(0x4a6272)  // 赤道: 暗岩
const COL_CRATER = new THREE.Color(0x38505f)  // クレーター床

// --- クレーター定義 -------------------------------------------
function makeCrater(lat, lon, radiusDeg, depth, rimH) {
  const phi = (90 - lat) * DEG, theta = (lon + 180) * DEG
  return {
    nx: Math.sin(phi) * Math.cos(theta),
    ny: Math.cos(phi),
    nz: Math.sin(phi) * Math.sin(theta),
    cosR:   Math.cos(radiusDeg        * DEG),
    cosRim: Math.cos(radiusDeg * 1.25 * DEG),
    depth, rimH,
  }
}

const CRATERS = [
  makeCrater(-28,  48, 18, 5.5, 2.0),  // 大型: 南半球正面
  makeCrater( 22, -75, 10, 3.2, 1.2),  // 中型: 北半球
  makeCrater( 58, 130,  7, 2.0, 0.8),  // 小型: 高緯度
  makeCrater(-55, -40,  5, 1.5, 0.6),  // 小型: 南高緯度
]

export function createVeth() {
  const group   = new THREE.Group()
  const noise3D = createNoise3D(Alea('veth'))

  // --- 地表 (36×36 = 1,369頂点) ----------------------------
  const geo    = new THREE.SphereGeometry(R_V, 36, 36)
  const pos    = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const len = Math.sqrt(x*x + y*y + z*z)
    const nx = x/len, ny = y/len, nz = z/len

    // 多オクターブノイズ
    const n = noise3D(nx*2.5, ny*2.5, nz*2.5) * 0.55
            + noise3D(nx*6.0, ny*6.0, nz*6.0) * 0.30
            + noise3D(nx*14,  ny*14,  nz*14 ) * 0.15

    // クレーター変形（凹み＋リム）
    let craterDisp = 0
    let craterBowl = 0  // 0→なし、正→碗底の深さ割合
    for (const c of CRATERS) {
      const dot = nx*c.nx + ny*c.ny + nz*c.nz
      if (dot < c.cosRim) continue
      if (dot < c.cosR) {
        // リム帯: sin カーブで盛り上がり
        const t = (dot - c.cosRim) / (c.cosR - c.cosRim)
        craterDisp += c.rimH * Math.sin(t * Math.PI)
      } else {
        // 碗底: 中心に向かって深くなる
        const t = (dot - c.cosR) / (1 - c.cosR)
        craterDisp -= c.depth * Math.pow(t, 0.7)
        craterBowl  = Math.max(craterBowl, t)
      }
    }

    const r = (R_V + n * 4 + craterDisp) / len
    pos.setXYZ(i, x*r, y*r, z*r)

    // カラー（緯度 + ノイズ + クレーター）
    const absLat     = Math.abs(ny)
    const iceBlend   = Math.pow(Math.max(0, (absLat - 0.60) / 0.40), 1.6)
    const frostBlend = Math.max(0, Math.min(1, (absLat - 0.28) / 0.32)) * (1 - iceBlend)
    const rockBlend  = Math.max(0, (0.28 - absLat) / 0.28) * (n * 0.4 + 0.5) * 0.65 * (1 - iceBlend)

    const c = new THREE.Color().copy(COL_DUST)
      .lerp(COL_FROST,  frostBlend)
      .lerp(COL_ICE,    iceBlend)
      .lerp(COL_ROCK,   rockBlend)
      .lerp(COL_CRATER, craterBowl * 0.75)

    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })))

  // --- リング系（赤道面・X軸90°回転でXZ平面に） -------------
  const RINGS = [
    { inner: R_V * 1.30, outer: R_V * 1.52, seg: 56, color: 0xb0c4d8, opacity: 0.38 },  // 中リング（明）
    { inner: R_V * 1.58, outer: R_V * 1.72, seg: 48, color: 0x90aabf, opacity: 0.20 },  // 外リング
    { inner: R_V * 1.18, outer: R_V * 1.27, seg: 40, color: 0x8aaabe, opacity: 0.14 },  // 内リング（暗）
  ]
  for (const { inner, outer, seg, color, opacity } of RINGS) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, seg, 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
    )
    mesh.rotation.x = Math.PI / 2
    group.add(mesh)
  }

  // --- 大気（内層）24×16 = 425頂点 -------------------------
  // flatShading: ほぼ透明で面の段差は見えない。ほかの半透明の flat なものとシェーダーを共有でき、起動時のコンパイルが 1 本減る
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(R_V * 1.035, 24, 16),
    new THREE.MeshLambertMaterial({ color: 0xb8d4e8, transparent: true, opacity: 0.10, side: THREE.FrontSide, flatShading: true })
  ))

  // --- 大気（外層・散乱光）18×12 = 247頂点 -----------------
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(R_V * 1.10, 18, 12),
    new THREE.MeshLambertMaterial({ color: 0x9ab8cf, transparent: true, opacity: 0.04, side: THREE.BackSide })
  ))

  return group
}

// veth 球面上にオブジェクトを配置するユーティリティ
export function placeOnVeth(group, object, lat, lon) {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  const x = R_V * Math.sin(phi) * Math.cos(theta)
  const y = R_V * Math.cos(phi)
  const z = R_V * Math.sin(phi) * Math.sin(theta)

  object.position.set(x, y, z)
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize())
  group.add(object)
}
