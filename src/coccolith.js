import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'
import Alea from 'alea'
import { R_C, LAND_LIFT } from './constants.js'
import { createTORCH } from '../my-3d-parts/landmark/TORCH.js'
import { createChairTree } from '../my-3d-parts/landmark/chairtree.js'
import { createTou } from '../my-3d-parts/landmark/tou.js'
import { createTreehouse } from '../my-3d-parts/landmark/treehouse.js'
import { createKanban } from '../my-3d-parts/landmark/kanban.js'
import { createSaku1, createSaku1Corner, SAKU1 } from '../my-3d-parts/landmark/saku_1.js'
import { createKaidanPalace } from '../my-3d-parts/landmark/kaidan_palace.js'
import { createEasel } from '../my-3d-parts/landmark/easel.js'
import { createBridge01 } from '../my-3d-parts/landmark/bridge01.js'
import { createCoinbox } from '../my-3d-parts/landmark/coinbox.js'
import { createSShall } from '../my-3d-parts/landmark/sshall.js'
import { createDote } from '../my-3d-parts/landmark/dote.js'
import { createLight01 } from '../my-3d-parts/landmark/light01.js'
import { createHoisun, createHoason } from '../my-3d-parts/landmark/hoisun.js'
import { mergeStatic } from '../my-3d-parts/parts/mergeStatic.js'
import { addDoorGlow, addGroundGlow, addArchDoorGlow } from './doorGlow.js'
import { openPixelScene } from './pixelScene.js'
import { TREEHOUSE_PIXEL_LAYERS, TREEHOUSE_PIXEL_TEXT } from './pixelArt/treehouse.js'
import { createFlowerGeometry, openFlowerCut } from './flowerCut.js'
import { addLedBoard } from './ledBoard.js'
import { applyNightEnv } from './nightEnv.js'
import { createForest1 } from '../my-3d-parts/parts/forest1.jsx'
import { createFrame64 } from '../my-3d-parts/parts/Frame_6-4.jsx'
import { createFrameM, createFrameL } from '../my-3d-parts/parts/Frame.jsx'
import { createMateris1 } from '../my-3d-parts/parts/Materis1.jsx'
import { createMateris2 } from '../my-3d-parts/parts/Materis2.jsx'
import { createMateris3 } from '../my-3d-parts/parts/Materis3.jsx'
import { createMateris4 } from '../my-3d-parts/parts/Materis4.jsx'
import { createMateris5 } from '../my-3d-parts/parts/Materis5.jsx'
import { createGrassTuftGeometry, createGrassMaterial } from '../my-3d-parts/parts/2dgrass.js'
import { createGrass2TuftGeometry, createGrass2Material } from '../my-3d-parts/parts/2dgrass2.js'
import { createEB_v87 } from '../my-3d-parts/parts/EB_v87.jsx'

// ============================================================
//  coccolith — 惑星メッシュ
// ============================================================

const LAND_COLOR      = 0x3d6b30
const LAND_COLOR_N    = 0x337367 // y軸+側（北半球）陸地色
const ISLAND_GF_COLOR = 0x90876D // 島[GF] (lat 0-36°N, lon 72-108°E)
const SEA_COLOR       = 0x1a4a52 // 海底色
const MOUNTAIN_COLOR  = 0x9D9899 // 山頂（hillLift最大値）
export const R_OCEAN = 364      // 海面球の半径 (m)
const SEA_FLOOR_DROP = 2        // 海底を R_C からさらに下げる量 (m)  → 海底半径 356m、海の深さ 8m
const OCEAN_COLOR_A = 0x629ec1
const OCEAN_COLOR_B = 0x5782B8

// ---- 道路 -------------------------------------------------------
const ROAD_HALF_WIDTH = 17.5   // 道幅35m の半分 (m)

// 複数の道を座標リストで定義する。各 waypoints は {lat, lon} の配列。
// dotLat: [最小, 最大] を付けると、道沿いの dots をその緯度の範囲だけに出す（省略時は道全体）
const ROUTES = [
  {
    name: 'Route1',
    color: 0x6D7058,
    waypoints: [
      { lat:  8.4, lon: -133.0 },
      { lat: 16.0, lon: -143.0 },
      { lat: 27.0, lon: -143.0 },
      { lat: 51.0, lon:  178.0 },
      { lat: 44.0, lon:  165.4 },
      { lat: 21.0, lon:  156.0 },
      { lat:  4.7, lon:  156.0 },
      { lat:  4.7, lon: -171.8 },
      { lat: -4.5, lon: -171.8 },
      { lat: -4.5, lon:  122.7 },
      { lat:-25.8, lon:  122.7 },
      { lat:-46.6, lon:   93.0 },
      { lat:-58.0, lon:   93.0 },
      { lat:-64.2, lon:  127.0 },
      { lat:-64.4, lon:  155.5 },
      { lat:-54.4, lon:  177.5 },
      { lat:-48.6, lon: -169.9 },
      { lat:-48.6, lon: -149.3 },
      { lat:-29.0, lon: -140.0 },
      { lat:-14.0, lon: -133.0 },
    ],
  },
  {
    name: 'Route2',
    color: 0x7A8E8E,
    waypoints: [
      { lat: 23.5, lon:  57.0 },
      { lat:  4.0, lon:  18.0 },
      { lat:  4.0, lon:  -1.0 },
      { lat: 33.5, lon:  -1.0 },
      { lat: 46.0, lon:  25.0 },
      { lat: 49.4, lon:  51.4 },
      { lat: 40.0, lon: 107.7 },
      { lat: 20.3, lon: 117.0 },
    ],
  },
  {
    name: 'Route3',   // スポーン地点（北極）から lon -180 に沿ってまっすぐ南へ
    color: 0x6D7058,
    dotLat: [54, 66],   // 道沿いの dots はこの緯度の範囲だけ（スポーン地点のまわりは暗いので出さない）
    waypoints: [
      { lat: 90.0, lon: -180.0 },
      { lat: 54.0, lon: -180.0 },
    ],
  },
]

// ノイズ閾値: 正規分布に近い simplex noise で陸地 ~60% になる値
// simplex-noise の出力範囲は [-1, 1]。
// 面積比は閾値を下げると陸地が増える。経験的に -0.08 付近で ~60%。
const LAND_THRESHOLD = -0.08

// 単位ベクトル (px,py,pz) から大円弧セグメント {ax,ay,az,bx,by,bz,gnx,gny,gnz} への
// 球面距離 (m) を返す。セグメント外なら端点への距離を返す。
function arcDistToSeg(px, py, pz, { ax, ay, az, bx, by, bz, gnx, gny, gnz }) {
  const sinXt = px*gnx + py*gny + pz*gnz
  const dXt   = Math.abs(Math.asin(Math.max(-1, Math.min(1, sinXt)))) * R_C
  // 大円上の最近点（垂線の足）
  const fpx = px - sinXt*gnx, fpy = py - sinXt*gny, fpz = pz - sinXt*gnz
  const flen = Math.sqrt(fpx*fpx + fpy*fpy + fpz*fpz)
  if (flen < 1e-10) {
    const dA = R_C * Math.acos(Math.max(-1, Math.min(1, px*ax + py*ay + pz*az)))
    const dB = R_C * Math.acos(Math.max(-1, Math.min(1, px*bx + py*by + pz*bz)))
    return Math.min(dA, dB)
  }
  const fux = fpx/flen, fuy = fpy/flen, fuz = fpz/flen
  // 垂線の足が弧 A→B の内側にあるか確認
  const afN = (ay*fuz - az*fuy)*gnx + (az*fux - ax*fuz)*gny + (ax*fuy - ay*fux)*gnz
  const fbN = (fuy*bz - fuz*by)*gnx + (fuz*bx - fux*bz)*gny + (fux*by - fuy*bx)*gnz
  if (afN >= 0 && fbN >= 0) return dXt
  const dA = R_C * Math.acos(Math.max(-1, Math.min(1, px*ax + py*ay + pz*az)))
  const dB = R_C * Math.acos(Math.max(-1, Math.min(1, px*bx + py*by + pz*bz)))
  return Math.min(dA, dB)
}

// 緯度経度（度）→ 球面上の単位ベクトル
function dirOf(lat, lon) {
  const phi   = (90 - lat)  * Math.PI / 180
  const theta = (lon + 180) * Math.PI / 180
  return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
}

// 陸地判定のノイズ（LAND_THRESHOLD 以上が陸）。地形・岩・草地で同じ式を使う
// オクターブ重ね: 低周波で大陸形状、高周波で細かい起伏
function landNoise(noise3D, nx, ny, nz) {
  return noise3D(nx * 1.8, ny * 1.8, nz * 1.8) * 0.7
       + noise3D(nx * 4.2, ny * 4.2, nz * 4.2) * 0.2
       + noise3D(nx * 9.0, ny * 9.0, nz * 9.0) * 0.1
}

// --- 山: 中心から 1段=HILL_STEP m 幅の同心円ごとに steps[i] m 持ち上げる ---
const HILL_STEP = 35
const HILLS = [
  { lat: -13.4, lon: -137.4, steps: [20, 6] },       // 山A
  { lat: -10.5, lon: -171.0, steps: [9, 6] },        // 山B
  { lat: -53.0, lon:  -44.8, steps: [20, 20, 10] },  // 山C
  { lat:  67.9, lon: -123.2, steps: [12, 6] },       // 山D
  { lat:  62.0, lon: -101.4, steps: [16, 8, 6] },    // 山E
  { lat: -12.2, lon:  -32.7, steps: [16, 8] },       // 山F
  { lat: -28.2, lon:  -40.6, steps: [10] },          // 山G
].map(h => ({ ...h, dir: dirOf(h.lat, h.lon) }))

// 単位ベクトル (nx,ny,nz) の地点の山の持ち上げ量 (m)。山が重なるところは高い方
function hillLiftAt(nx, ny, nz) {
  let lift = 0
  for (const { dir, steps } of HILLS) {
    const arc = R_C * Math.acos(Math.max(-1, Math.min(1, nx * dir.x + ny * dir.y + nz * dir.z)))
    lift = Math.max(lift, steps[Math.floor(arc / HILL_STEP)] ?? 0)
  }
  return lift
}

// placeOnSurface で置いた wrapper の中で、ローカル +Z を北（緯度+方向）へ向ける Y 回転の角度
function northAngle(wrapper) {
  const n = wrapper.position.clone().normalize()
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y)
    .applyQuaternion(wrapper.quaternion.clone().invert())
  return Math.atan2(north.x, north.z)
}

// placeOnSurface で置いた wrapper の中で、ローカル +Z を (lat, lon) の地点へ向ける Y 回転の角度
// 新しく置くランドマークの影の設定。placeOnSurface の後に呼ぶ
// 影を受けない（太陽の影が平らな面にギザギザに出るので）。影を落とすのは、太陽（+X）の当たる側（wrapper が x > 0）に置いたときだけ
function landmarkShadow(object, wrapper) {
  const cast = wrapper.position.x > 0
  object.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = false } })
}

function headingTo(wrapper, lat, lon) {
  const p = new THREE.Object3D()
  placeOnSurface(new THREE.Group(), p, lat, lon, wrapper.position.length())
  const to = p.position.sub(wrapper.position).applyQuaternion(wrapper.quaternion.clone().invert())
  return Math.atan2(to.x, to.z)
}

// { group, terrainMeshes } を返す
// terrainMeshes: レイキャスト対象メッシュ（山などを追加する時はここに push する）
// renderer: 金属の映り込み用 envMap を作るのに使う（省略時は映り込みなし）
export function createCoccolith({ renderer = null } = {}) {
  const group = new THREE.Group()
  const terrainMeshes = []
  const colliders = []   // sabちゃんが侵入できない建物（userData.footprint を持つ Object3D）
  const lamps = []       // ライト { pos: 光の位置（group のローカル座標）, glow: 頭の発光マテリアル }。main.js が近いものだけ点ける

  const noise3D = createNoise3D(Alea('coccolith'))

  // --- 地表メッシュ -------------------------------------------
  const geo = new THREE.SphereGeometry(R_C, 64, 64)
  const pos = geo.attributes.position

  // 道路セグメントを事前計算 (大円法線 gnx,gny,gnz + ルート色 付き)
  const roadSegs = []
  for (const route of ROUTES) {
    const rgb = new THREE.Color(route.color)
    for (let si = 0; si < route.waypoints.length - 1; si++) {
      const wA = route.waypoints[si], wB = route.waypoints[si + 1]
      const phiA = (90 - wA.lat) * Math.PI / 180, thetaA = (wA.lon + 180) * Math.PI / 180
      const phiB = (90 - wB.lat) * Math.PI / 180, thetaB = (wB.lon + 180) * Math.PI / 180
      const ax = Math.sin(phiA)*Math.cos(thetaA), ay = Math.cos(phiA), az = Math.sin(phiA)*Math.sin(thetaA)
      const bx = Math.sin(phiB)*Math.cos(thetaB), by = Math.cos(phiB), bz = Math.sin(phiB)*Math.sin(thetaB)
      const cx = ay*bz - az*by, cy = az*bx - ax*bz, cz = ax*by - ay*bx
      const clen = Math.sqrt(cx*cx + cy*cy + cz*cz)
      if (clen < 1e-10) continue
      roadSegs.push({ ax, ay, az, bx, by, bz, gnx: cx/clen, gny: cy/clen, gnz: cz/clen, r: rgb.r, g: rgb.g, b: rgb.b })
    }
  }

  // 頂点ごとにノイズを評価して押し出し & 頂点カラーを設定
  const colors = new Float32Array(pos.count * 3)
  const landRGB      = new THREE.Color(LAND_COLOR)
  const landNRGB     = new THREE.Color(LAND_COLOR_N)
  const islandGFRGB  = new THREE.Color(ISLAND_GF_COLOR)
  const seaRGB       = new THREE.Color(SEA_COLOR)
  const mountainRGB  = new THREE.Color(MOUNTAIN_COLOR)
  const _tmpC        = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const nx = x / R_C, ny = y / R_C, nz = z / R_C

    const n = landNoise(noise3D, nx, ny, nz)

    // 赤道面(y=0)から±5m 以内は川として強制的に海扱い
    const isRiver = Math.abs(y) < 6
    // 北極・南極から半径5m（10×10相当）は強制的に陸地
    const dNorth = Math.sqrt(x*x + (y-R_C)*(y-R_C) + z*z)
    const dSouth = Math.sqrt(x*x + (y+R_C)*(y+R_C) + z*z)
    const isPole = dNorth < 50 || dSouth < 50
    const hillLift = hillLiftAt(nx, ny, nz)

    const isLand = (n >= LAND_THRESHOLD && !isRiver) || isPole || hillLift > 0
    const lift   = isLand ? LAND_LIFT : -SEA_FLOOR_DROP
    const len    = Math.sqrt(x * x + y * y + z * z)
    const scale  = (R_C + lift + hillLift) / len

    pos.setXYZ(i, x * scale, y * scale, z * scale)

    const lat = Math.asin(Math.max(-1, Math.min(1, ny))) * 180 / Math.PI
    let lonTheta = Math.atan2(nz, nx)
    if (lonTheta < 0) lonTheta += Math.PI * 2
    const lon = lonTheta * 180 / Math.PI - 180
    const inIslandGF = isLand && lat >= 0 && lat <= 36 && lon >= 72 && lon <= 108

    const baseC = inIslandGF ? islandGFRGB : isLand ? (y > 0 ? landNRGB : landRGB) : seaRGB
    const c = hillLift > 0 ? _tmpC.lerpColors(baseC, mountainRGB, hillLift / 20) : baseC
    colors[i * 3]     = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b

    // 道路オーバーレイ: 陸地かつ道中心線から ROAD_HALF_WIDTH 以内なら道色に上書き
    if (isLand) {
      for (const seg of roadSegs) {
        if (arcDistToSeg(nx, ny, nz, seg) < ROAD_HALF_WIDTH) {
          colors[i * 3]     = seg.r
          colors[i * 3 + 1] = seg.g
          colors[i * 3 + 2] = seg.b
          break
        }
      }
    }
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
  const surface = new THREE.Mesh(geo, mat)
  group.add(surface)
  terrainMeshes.push(surface)

  // --- 海面球 -------------------------------------------------
  const oceanGeo = new THREE.SphereGeometry(R_OCEAN, 48, 24)
  const oceanOPos = oceanGeo.attributes.position
  const oceanColArr = new Float32Array(oceanOPos.count * 3)
  const oceanCA = new THREE.Color(OCEAN_COLOR_A)
  const oceanCB = new THREE.Color(OCEAN_COLOR_B)
  for (let i = 0; i < oceanOPos.count; i++) {
    const c = (Math.floor(i / 49) % 2 === 0) ? oceanCA : oceanCB
    oceanColArr[i * 3]     = c.r
    oceanColArr[i * 3 + 1] = c.g
    oceanColArr[i * 3 + 2] = c.b
  }
  oceanGeo.setAttribute('color', new THREE.Float32BufferAttribute(oceanColArr, 3))
  const oceanMat  = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat)
  group.add(oceanMesh)

  // --- 緯度経度グリッド ----------------------------------------
  group.add(createLatLonGrid())

  // --- 島[GF] 岩散布 ------------------------------------------
  group.add(createIslandGFRocks(noise3D))

  // --- 道路マーカー (10m間隔 Points) ---------------------------
  group.add(createRoutePoints(ROUTES))

  // --- ランドマーク #01: TORCH (-X軸頂点, lat=0 lon=0) -------
  // scale=115/16でy高さ115m。TI先端がwrapper原点より-12.4m下なので
  // radius=364で地表367mから約15m埋まる位置になる。
  const torchWrapper = new THREE.Group()
  torchWrapper.add(createTORCH())
  torchWrapper.scale.setScalar(115 / 16)
  placeOnSurface(group, torchWrapper, 0, 0, 364)

  // --- ランドマーク #02: forest1 (lat=45.0, lon=-20.0) --------
  const forest1Wrapper = new THREE.Group()
  forest1Wrapper.add(createForest1())
  forest1Wrapper.scale.setScalar(8)
  placeOnSurface(group, forest1Wrapper, 45.0, -20.0, R_C + LAND_LIFT)

  // --- ランドマーク #03: forest1 (lat=54.6, lon=-36.6) --------
  const forest1Wrapper2 = new THREE.Group()
  const forest1b = createForest1()
  forest1b.rotation.y = Math.PI
  forest1Wrapper2.add(forest1b)
  forest1Wrapper2.scale.setScalar(8)
  placeOnSurface(group, forest1Wrapper2, 54.6, -36.6, R_C + LAND_LIFT - 0.5)

  // --- ランドマーク #04: forest1 (lat=62.5, lon=5.0) ----------
  const forest1Wrapper3 = new THREE.Group()
  const forest1c = createForest1()
  forest1c.rotation.y = Math.PI / 2
  forest1Wrapper3.add(forest1c)
  forest1Wrapper3.scale.setScalar(8)
  placeOnSurface(group, forest1Wrapper3, 62.5, 5.0, R_C + LAND_LIFT)

  // --- ランドマーク #05: Frame_6-4 (lat=8.6, lon=7.0) ----------
  const frame64Wrapper = new THREE.Group()
  frame64Wrapper.add(createFrame64())
  frame64Wrapper.scale.setScalar(3)
  placeOnSurface(group, frame64Wrapper, 8.6, 7.0, R_C + LAND_LIFT)

  // --- ランドマーク #06: Frame 中×4 + 大×4 (中心 lat=8.0 lon=-8.0) -----
  // 中(M): 十字方向 ±4° (≈25m), 大(L): 斜め方向 ±7° (≈44m)
  const FRAME_GROUP_CENTER = { lat: 8.0, lon: -8.0 }
  const frameMLConfigs = [
    // 中 (M) — 十字
    { create: createFrameM, lat: FRAME_GROUP_CENTER.lat + 2, lon: FRAME_GROUP_CENTER.lon       },
    { create: createFrameM, lat: FRAME_GROUP_CENTER.lat - 2, lon: FRAME_GROUP_CENTER.lon       },
    { create: createFrameM, lat: FRAME_GROUP_CENTER.lat,     lon: FRAME_GROUP_CENTER.lon + 2   },
    { create: createFrameM, lat: FRAME_GROUP_CENTER.lat,     lon: FRAME_GROUP_CENTER.lon - 2   },
    // 大 (L) — 斜め
    { create: createFrameL, lat: FRAME_GROUP_CENTER.lat + 3.5, lon: FRAME_GROUP_CENTER.lon + 3.5 },
    { create: createFrameL, lat: FRAME_GROUP_CENTER.lat + 3.5, lon: FRAME_GROUP_CENTER.lon - 3.5 },
    { create: createFrameL, lat: FRAME_GROUP_CENTER.lat - 3.5, lon: FRAME_GROUP_CENTER.lon + 3.5 },
    { create: createFrameL, lat: FRAME_GROUP_CENTER.lat - 3.5, lon: FRAME_GROUP_CENTER.lon - 3.5 },
  ]
  for (const { create, lat, lon } of frameMLConfigs) {
    const w = new THREE.Group()
    w.add(create())
    w.scale.setScalar(3)
    placeOnSurface(group, w, lat, lon, R_C + LAND_LIFT)
  }

  // --- ランドマーク #07: Frame_6-4 × 2 + FrameM × 1 -----------
  ;[
    { lat:  -6.4, lon: -4.8 },
    { lat:  16.8, lon: -4.4 },
  ].forEach(({ lat, lon }) => {
    const w = new THREE.Group()
    w.add(createFrame64())
    w.scale.setScalar(3)
    placeOnSurface(group, w, lat, lon, R_C + LAND_LIFT)
  })

  const frameMW = new THREE.Group()
  frameMW.add(createFrameM())
  frameMW.scale.setScalar(3)
  placeOnSurface(group, frameMW, 10.6, 4.0, R_C + LAND_LIFT)

  // --- ランドマーク #08: 多角形ドーム (lat=-45.0, lon=150.0) -----
  // 直径100m の半球。少ない頂点（10×4）でもスムースシェーディングで丸く見せる
  // 15m 沈めて置く（半径50m分の球面の丸みで縁が約3.5m 浮く分も含めて埋める）
  // 色は頂点カラーで上 #6657BA → 下 #BA6057 のグラデーション（地上に見えている範囲で変化させる）
  const DOME_R    = 50
  const DOME_SINK = 15
  const domeGeo = new THREE.SphereGeometry(DOME_R, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2)
  {
    const top = new THREE.Color(0x6657BA), bottom = new THREE.Color(0xBA6057), c = new THREE.Color()
    const pos = domeGeo.attributes.position
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, (DOME_R - pos.getY(i)) / (DOME_R - DOME_SINK))  // 頂上0 → 地面の高さ1
      c.copy(top).lerp(bottom, t).toArray(col, i * 3)
    }
    domeGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshLambertMaterial({ vertexColors: true }))
  dome.castShadow = false   // 地面に大きな影を落とさない
  dome.receiveShadow = true
  // 内壁: 太陽光が届かず真っ暗になるので、ライティングなしで頂点カラーをそのまま出す
  dome.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })))
  placeOnSurface(group, dome, -45.0, 150.0, R_C + LAND_LIFT - DOME_SINK)

  // --- ランドマーク #09: 豆腐ハウス（ドーム中央, lat=-45.0, lon=150.0） -----
  // 白い天面＋薄紫の壁の直方体。正面（玄関ホール側）を北（緯度+方向）に向ける
  const tofuWrapper = new THREE.Group()
  const tofu = createTofuHouse()
  tofuWrapper.add(tofu)
  placeOnSurface(group, tofuWrapper, -45.0, 150.0, R_C + LAND_LIFT - 0.3)
  tofu.rotation.y = northAngle(tofuWrapper)
  colliders.push(tofu)

  // --- ランドマーク: Materis 1〜5 × 各2 ---------------------
  // Route1/2 ウェイポイント（陸地確定）をアンカーに、シード文字列で ±1° ジッター

  const materisDefs = [
    { n: 1, seeds: ['materis-1a', 'materis-1b'], anchors: [{ lat:  4.0, lon:  18.0 }, { lat: 33.5, lon:  -1.0 }] },
    { n: 2, seeds: ['materis-2a', 'materis-2b'], anchors: [{ lat: 46.0, lon:  25.0 }, { lat: 49.4, lon:  51.4 }] },
    { n: 3, seeds: ['materis-3a', 'materis-3b'], anchors: [{ lat: 23.5, lon:  57.0 }, { lat: 40.0, lon: 107.7 }] },
    { n: 4, seeds: ['materis-4a', 'materis-4b'], anchors: [{ lat: 20.3, lon: 117.0 }, { lat: 27.0, lon:-143.0 }] },
    { n: 5, seeds: ['materis-5a', 'materis-5b'], anchors: [{ lat:-13.4, lon:-137.4 }, { lat:-10.5, lon:-171.0 }] },
  ]
  const _materisCreators = [null, createMateris1, createMateris2, createMateris3, createMateris4, createMateris5]
  for (const { n, seeds, anchors } of materisDefs) {
    for (let i = 0; i < 2; i++) {
      const rng = Alea(seeds[i])
      const lat = anchors[i].lat + (rng() - 0.5) * 2
      const lon = anchors[i].lon + (rng() - 0.5) * 2
      const w = new THREE.Group()
      w.add(_materisCreators[n]())
      const d = dirOf(lat, lon)
      placeOnSurface(group, w, lat, lon, R_C + LAND_LIFT + hillLiftAt(d.x, d.y, d.z) + 5.0)
    }
  }

  // --- 草地フィールド ---
  const GRASS_AREAS = [
    [{lat:11.2,lon:-43.2},{lat:11.0,lon:-46.8},{lat:6.9,lon:-46.8},{lat:6.9,lon:-43.2}],
    [{lat:50,lon:-100},{lat:50,lon:-114.6},{lat:30,lon:-114.6},{lat:22.7,lon:-132},{lat:12,lon:-125},{lat:26.5,lon:-100}],
    [{lat:66,lon:-145},{lat:56,lon:-176.5},{lat:42,lon:-145},{lat:53.6,lon:-128.4}],
    [{lat:73.3,lon:7.2},{lat:42.4,lon:-33.8},{lat:42.4,lon:-16.6},{lat:56.3,lon:62.4}],
    [{lat:59.9,lon:157.6},{lat:59.9,lon:80.2},{lat:44.4,lon:117.3}],
  ]
  for (const poly of GRASS_AREAS) group.add(createGrassField(poly, noise3D, GRASS_KIND_1))

  const FIELD01_AREAS = [
    [{lat:-60,lon:30},{lat:-37,lon:62},{lat:-43,lon:82},{lat:-60,lon:82}],
    [{lat:-21.7,lon:23.4},{lat:-37.7,lon:15},{lat:-20.5,lon:10.6}],
    [{lat:-44,lon:-134},{lat:-67,lon:-114},{lat:-67,lon:-151.6}],
  ]
  for (const poly of FIELD01_AREAS) group.add(createGrassField(poly, noise3D, GRASS_KIND_2))

  // --- ランドマーク: ChairTree (lat=65, lon=-180) ---------------
  const chairTreeWrapper = new THREE.Group()
  const chairTree = createChairTree()
  chairTree.rotation.y = Math.PI / 2
  chairTreeWrapper.add(chairTree)
  chairTreeWrapper.scale.setScalar(6)
  placeOnSurface(group, chairTreeWrapper, 65, -180, R_C + LAND_LIFT)

  // --- ランドマーク: 塔 tou (lat=-8.4, lon=113.8) -----------------
  // 2倍で幅18m × 高さ25.2m。扉のある角（ローカル +X+Z 方向）を北（緯度+方向）から 90° 回した向きにする
  const touWrapper = new THREE.Group()
  const tou = createTou()
  touWrapper.add(tou)
  touWrapper.scale.setScalar(2)
  placeOnSurface(group, touWrapper, -8.4, 113.8, R_C + LAND_LIFT - 0.8)
  tou.rotation.y = northAngle(touWrapper) - Math.PI / 4 + Math.PI / 2
  colliders.push(tou)
  mergeStatic(tou)   // 動かない部品をマテリアルごとにまとめて描画の回数を減らす

  // --- ランドマーク: ツリーハウス (lat=53.0, lon=-171.0) -----------
  // 2倍で高さ約22m。当たり判定は幹のまわりだけ（部屋は頭上なので下をくぐれる）
  const treehouseWrapper = new THREE.Group()
  const treehouse = createTreehouse()
  treehouse.rotation.y = Math.PI   // 正面（扉・はしご側）の向きを 180° 回す
  // 逆光で暗く見えるので、それぞれの面を自分の色で少しだけ自発光させる
  treehouse.traverse(o => {
    if (o.material?.emissive) { o.material.emissive.copy(o.material.color); o.material.emissiveIntensity = 0.1 }
  })
  treehouseWrapper.add(treehouse)
  treehouseWrapper.scale.setScalar(2)
  placeOnSurface(group, treehouseWrapper, 53.0, -171.0, R_C + LAND_LIFT - 0.3)
  colliders.push(treehouse)
  // 近づくと扉の輪郭が光り、タップでドット絵のページを開く（main.js の _glowSpots、pixelScene.js）。扉は頭上なので、地面に落とした位置から測る
  {
    const door = treehouse.userData.doorPanel
    addDoorGlow(door)
    const local = door.getWorldPosition(new THREE.Vector3()).applyMatrix4(treehouse.matrixWorld.clone().invert())
    treehouse.userData.glowSpot = { mesh: door, local, reach: 5 }   // local: treehouse のローカル座標
    treehouse.userData.glowSpot.onTap = () => openPixelScene(TREEHOUSE_PIXEL_LAYERS, { text: TREEHOUSE_PIXEL_TEXT })
    mergeStatic(treehouse, { keep: o => o === door })   // 扉（光る輪郭付き）以外をマテリアルごとにまとめる
  }

  // --- ランドマーク: 看板 kanban (lat=83.0, lon=-160.0) ------------
  // 16.7倍で高さ約20m、横幅だけさらに 1.5 倍（約15m）。地面に 2m めり込ませる。表（黒板・ローカル +Z）を北（緯度+方向）へ向ける
  const kanbanWrapper = new THREE.Group()
  const kanban = createKanban()
  kanban.scale.x = 1.5   // 横幅（ローカル X）だけ広げる。弓なりは Z 方向なので形は崩れない
  kanbanWrapper.add(kanban)
  kanbanWrapper.scale.setScalar(16.7)
  placeOnSurface(group, kanbanWrapper, 83.0, -160.0, R_C + LAND_LIFT - 2.0)
  kanban.rotation.y = northAngle(kanbanWrapper)
  colliders.push(kanban)
  {
    // フレーム（黒板以外の板）をメタリックにする。映り込みは看板まわりの夜景（nightEnv.js）
    const frame = kanban.children.find(o => o.isMesh && o !== kanban.userData.board)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xc2c6dc, metalness: 1, roughness: 0.15, envMapIntensity: 2.0 })
    frame.material = frameMat
    applyNightEnv(renderer, frameMat)
  }
  {
    // 黒板に更新履歴を電光掲示板風に出す（__CHANGELOG__ はビルド時に git log から作る。vite.config.js）
    const board = kanban.userData.board
    board.geometry.computeBoundingBox()
    const size = board.geometry.boundingBox.getSize(new THREE.Vector3())
    addLedBoard(board, size.x * kanban.scale.x / size.y, __CHANGELOG__)   // 横に広げたぶん列を増やし、ドットを丸いままにする
    addKanbanLabel(kanban, board)
  }

  // --- ランドマーク: 柵 saku_1 (lat=-5.6, lon=100.0) ----------------
  let sakuFlowerStems   // 囲いの中の花の茎（InstancedMesh）。イーゼルのところで茎の先に花を咲かせる
  // 3.6倍で高さ約4m（地面に 0.7m めり込ませる）。上から見て左がコの字に凹んだ囲い（約42m × 31m）を、直線と角のピースで組む
  // 図の上（ローカル -Z）を北（緯度+方向）へ向ける。囲いの中には入れない（外側の凹みには入れる）
  {
    const SAKU_RADIUS = R_C + LAND_LIFT - 0.7
    const sakuWrapper = new THREE.Group()
    const sakuField = createSakuField()
    sakuWrapper.add(sakuField)
    sakuWrapper.scale.setScalar(3.6)
    placeOnSurface(group, sakuWrapper, -5.6, 100.0, SAKU_RADIUS)
    const n0 = sakuWrapper.position.clone().normalize()
    sakuField.rotation.y = northAngle(sakuWrapper) + Math.PI

    // 囲いが広く、平らなままだと端が球面から浮く（端で約0.6m）ので、ピースごとに根元を球面へ下ろして法線に合わせて傾ける
    sakuWrapper.updateMatrix()
    sakuField.updateMatrix()
    const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3()
    const sakuPieces = new THREE.Group()   // ピースはまとめて 1 つのメッシュ・線にする
    group.add(sakuPieces)
    for (const piece of sakuField.children.filter(o => !o.userData.footprint)) {
      piece.updateMatrix()
      _m.multiplyMatrices(sakuWrapper.matrix, sakuField.matrix).multiply(piece.matrix).decompose(_p, _q, _s)
      const n = _p.clone().normalize()
      piece.position.copy(n).multiplyScalar(piece.userData.onGround ? R_C + LAND_LIFT - 0.05 : SAKU_RADIUS)
      piece.quaternion.setFromUnitVectors(n0, n).multiply(_q)
      piece.scale.copy(_s)
      sakuPieces.add(piece)   // 球面に直接置く（sakuField には当たり判定の矩形だけ残る）
    }
    mergeStatic(sakuPieces)
    colliders.push(...sakuField.children)
    group.add(createSakuGrass(sakuWrapper, sakuField, { ...GRASS_KIND_1, density: 2 / 3 * 0.5 }))   // 草地の半分の量
    sakuFlowerStems = createSakuGrass(sakuWrapper, sakuField, FLOWER_STEM_KIND)
    group.add(sakuFlowerStems)
  }

  // --- ランドマーク: 階段の館 kaidan_palace (lat=5.8, lon=-128.0) ------------
  // 6倍で高さ18m × 幅21.6m × 奥行き28.2m。地面に 1m めり込ませる（大きいので角が地面から浮かないように）
  // 正面（低い段・扉のある側、ローカル +Z）を北（緯度+方向）へ向けてから、Y 軸で -45° 回す
  const kaidanWrapper = new THREE.Group()
  const kaidan = createKaidanPalace()
  kaidanWrapper.add(kaidan)
  kaidanWrapper.scale.setScalar(6)
  placeOnSurface(group, kaidanWrapper, 5.8, -128.0, R_C + LAND_LIFT - 1.0)
  kaidan.rotation.y = northAngle(kaidanWrapper) - Math.PI / 4
  colliders.push(kaidan)
  mergeStatic(kaidan)

  // --- ランドマーク: イーゼル easel (lat=-6.6, lon=104.0) ------------
  // 柵の囲い（花壇）の前に置く。2.35倍で高さ約4m、地面に 0.5m めり込ませる。正面（キャンバス・ローカル +Z）を花壇の中心と反対へ向ける
  // 近づくとドアのようにキャンバスの輪郭が光る（入れない。main.js の _glowSpots）
  const easelWrapper = new THREE.Group()
  const easel = createEasel()
  easelWrapper.add(easel)
  easelWrapper.scale.setScalar(2.35)
  placeOnSurface(group, easelWrapper, -6.6, 104.0, R_C + LAND_LIFT - 0.5)
  easel.rotation.y = headingTo(easelWrapper, -5.6, 100.0) + Math.PI   // 花壇の中心の反対
  {
    const canvas = easel.userData.canvas
    addDoorGlow(canvas)
    easel.userData.glowSpot = { mesh: canvas, local: canvas.position.clone(), reach: 4.5 }   // local: easel のローカル座標

    // 花壇の茎の先に、キャンバスの絵を切り抜いた花を咲かせる（茎と同じインスタンスの行列を使う）
    // キャンバスをタップすると画像切り抜きページを開き、ok で花の形を作り直す（flowerCut.js）
    const tex = canvas.material[4].map   // キャンバスの正面（+Z）の絵
    const flowers = new THREE.InstancedMesh(
      createFlowerGeometry(FLOWER_STEM_TIP),
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.9, side: THREE.DoubleSide }),
      sakuFlowerStems.count,
    )
    // 茎の先端を中心に、花ごとに向き（0〜180°）と前後の傾き（俯き 5°〜仰向き 20°）をランダムにする
    {
      const rng = Alea('flower-head')
      const tip = new THREE.Vector3(...FLOWER_STEM_TIP)
      const stemM = new THREE.Matrix4(), turn = new THREE.Matrix4(), m = new THREE.Matrix4()
      const toTip = new THREE.Matrix4().makeTranslation(tip), fromTip = new THREE.Matrix4().makeTranslation(tip.clone().negate())
      const euler = new THREE.Euler(0, 0, 0, 'YXZ')
      for (let i = 0; i < flowers.count; i++) {
        sakuFlowerStems.getMatrixAt(i, stemM)
        euler.set(-THREE.MathUtils.degToRad(-5 + 25 * rng()), rng() * Math.PI, 0)   // x: 負で仰向き（面が上を向く）
        turn.makeRotationFromEuler(euler)
        m.multiplyMatrices(stemM, toTip).multiply(turn).multiply(fromTip)
        flowers.setMatrixAt(i, m)
      }
      flowers.instanceMatrix.needsUpdate = true
    }
    flowers.frustumCulled = false
    flowers.castShadow = true
    group.add(flowers)
    easel.userData.glowSpot.onTap = () => openFlowerCut(tex.image.src, () => {
      flowers.geometry.dispose()
      flowers.geometry = createFlowerGeometry(FLOWER_STEM_TIP)
    })
  }
  colliders.push(easel)
  mergeStatic(easel, { keep: o => o === easel.userData.canvas })   // キャンバス（光る輪郭・花の絵）以外をまとめる

  // --- ランドマーク: コイン箱 coinbox (lat=-6.0, lon=100.314) ------------
  // 柵の囲い（花壇）の凹みに置く（柵にめり込まないよう lon=100.0 から東へ 2m ずらす）。2.35倍で高さ約2.5m
  // 正面（投入口のある側・ローカル +Z）を東（経度+方向）へ向ける
  const coinboxWrapper = new THREE.Group()
  const coinbox = createCoinbox()
  coinboxWrapper.add(coinbox)
  coinboxWrapper.scale.setScalar(2.35)
  const COINBOX_SINK = 0.1   // 地面にめり込ませる量 (m)
  const COINBOX_LON = 100.0 + THREE.MathUtils.radToDeg(2 / ((R_C + LAND_LIFT) * Math.cos(THREE.MathUtils.degToRad(6.0))))   // 東へ 2m
  placeOnSurface(group, coinboxWrapper, -6.0, COINBOX_LON, R_C + LAND_LIFT - COINBOX_SINK)
  coinbox.rotation.y = headingTo(coinboxWrapper, -6.0, COINBOX_LON + 1)
  {
    // 金色の部分（箱と投入口の円盤）をメタリックにする。映り込みはコイン・看板と同じ夜景（nightEnv.js）
    const goldMat = coinbox.children[1].material   // children[1] = 金の箱（円盤も同じマテリアルを使う）
    const metalMat = new THREE.MeshStandardMaterial({ color: goldMat.color, metalness: 0.9, roughness: 0.06, envMapIntensity: 2.0 })
    coinbox.traverse(o => { if (o.isMesh && o.material === goldMat) o.material = metalMat })
    applyNightEnv(renderer, metalMat)
  }
  {
    // 近づくと、台が地面に入るところ（接地ライン）がドアのように光る（入れない。main.js の _glowSpots）
    const base = coinbox.children[0]   // children[0] = 茶色の台（BoxGeometry、中心が台の真ん中）
    const s = coinboxWrapper.scale.x
    addGroundGlow(base, { y: -base.geometry.parameters.height / 2 + COINBOX_SINK / s, pad: 0.1 / s, band: 0.12 / s })
    coinbox.userData.glowSpot = { mesh: base, local: new THREE.Vector3(), reach: 4.5, coinbox: true }   // local: coinbox のローカル座標。coinbox: Enter でコインを 1 枚入れる（main.js）
  }
  colliders.push(coinbox)
  // 台（光る接地ライン）と投入口（コインの演出で使う）以外をまとめる
  mergeStatic(coinbox, { keep: o => o === coinbox.userData.glowSpot.mesh || o === coinbox.userData.slot })

  // --- ランドマーク: SShall (lat=27.0, lon=161.0) ------------
  // 2倍で高さ約15m（塔の円錐屋根の先）。原点は塔の中心。正面（扉のある側・ローカル +Z）を西（経度-方向）へ向ける
  // 倍率を変えるときは室内（src/interiors/sshall.js の SCALE）も合わせる
  // 当たり判定は棟2つと塔の矩形3つ（userData.colliders）
  const sshallWrapper = new THREE.Group()
  const sshall = createSShall()
  sshallWrapper.add(sshall)
  sshallWrapper.scale.setScalar(2)
  const SSHALL_SINK = 1.0   // 地面にめり込ませる量 (m)
  placeOnSurface(group, sshallWrapper, 27.0, 161.0, R_C + LAND_LIFT - SSHALL_SINK)
  sshall.rotation.y = headingTo(sshallWrapper, 27.0, 160.0)
  colliders.push(...sshall.userData.colliders)
  // 扉: 近づくと輪郭が光り、タップで室内へ（main.js の _doors、室内は src/interiors/sshall.js）。正面の棟の当たり判定に付ける
  {
    const door = sshall.userData.doorPanel
    const { w, h, t, curveSegments } = sshall.userData.doorSize
    addArchDoorGlow(door, { width: w, height: h, depth: t, curveSegments })
    const front = sshall.userData.colliders[0]   // [0] = 正面の棟
    sshallWrapper.updateMatrixWorld(true)
    const local = door.getWorldPosition(new THREE.Vector3()).applyMatrix4(front.matrixWorld.clone().invert())
    front.userData.door = { id: 'sshall', mesh: door, local, outward: new THREE.Vector3(0, 0, 1) }   // local / outward: 正面の棟の当たり判定のローカル座標
    mergeStatic(sshall, { keep: o => o === door })   // 扉（光る輪郭付き）以外をマテリアルごとにまとめる
  }

  // --- ランドマーク: hoason (lat=24.0, lon=-86.0) ------------
  // 2.5倍で高さ約8.6m（台形の屋根の上面）・幅約9.5m（すべり台を含めて約16.8m）。原点は左右の中央・正面から 4.5m 奥の地面
  // 正面（顔のある側・ローカル +Z）を西（経度-方向）へ向ける。当たり判定は建物と左右のすべり台の矩形3つ（userData.colliders）
  // 影は受けない。夜の側（x < 0）なので影も落とさない（landmarkShadow）
  const hoasonWrapper = new THREE.Group()
  const hoason = createHoason()
  hoasonWrapper.add(hoason)
  hoasonWrapper.scale.setScalar(2.5)
  const HOASON_SINK = 0.3   // 地面にめり込ませる量 (m)
  placeOnSurface(group, hoasonWrapper, 24.0, -86.0, R_C + LAND_LIFT - HOASON_SINK)
  hoason.rotation.y = headingTo(hoasonWrapper, 24.0, -87.0)
  landmarkShadow(hoason, hoasonWrapper)
  colliders.push(...hoason.userData.colliders)

  // --- ランドマーク: hoisun (lat=66.0, lon=120.0) ------------
  // hoason と同じ形の白い色違い。2.5倍（寸法は hoason と同じ）。正面（顔のある側・ローカル +Z）を西（経度-方向）へ向ける
  const hoisunWrapper = new THREE.Group()
  const hoisun = createHoisun()
  hoisunWrapper.add(hoisun)
  hoisunWrapper.scale.setScalar(2.5)
  const HOISUN_SINK = 0.3   // 地面にめり込ませる量 (m)
  placeOnSurface(group, hoisunWrapper, 66.0, 120.0, R_C + LAND_LIFT - HOISUN_SINK)
  hoisun.rotation.y = headingTo(hoisunWrapper, 66.0, 119.0)
  landmarkShadow(hoisun, hoisunWrapper)   // 影は受けない。昼の側（x > 0）なので影は落とす
  colliders.push(...hoisun.userData.colliders)

  // --- ランドマーク: 橋 bridge01 ×2 ------------
  // 3倍で地面から6m出る、全長約44m。歩く向き（ローカル +Z）を北（緯度+方向）へ向ける
  // 本体とステップは地表と同じレイキャスト対象にして、上を歩いて越えられるようにする（本体の当たり判定の矩形は付けず、両側の柱の列だけ手すりとして当たり判定にする）
  // 川をまたぐので、ステップの下端を水面より下にする。円柱・円錐は軸（円錐の先端の高さ）より下の半分を削る（軸は水面より下）
  // tiltNorth: 北側の岸の方へ傾ける角度（上を北へ倒す = 北の端が下がる）、sink: 地面にめり込ませる量 (m)
  const placeBridge = (lat, lon, { tiltNorth = 0, sink = 0 } = {}) => {
    const BRIDGE_SCALE = 3
    const waterDepth = (R_C + LAND_LIFT - R_OCEAN) / BRIDGE_SCALE   // 陸の高さから水面まで（橋のローカル単位）
    const wrapper = new THREE.Group()
    const bridge = createBridge01({ stepSink: waterDepth + 0.3 })
    wrapper.add(bridge)
    wrapper.scale.setScalar(BRIDGE_SCALE)
    placeOnSurface(group, wrapper, lat, lon, R_C + LAND_LIFT - sink)
    bridge.rotation.order = 'YXZ'   // 橋のローカル X 軸まわりに傾けてから向きを回す
    bridge.rotation.y = northAngle(wrapper)
    bridge.rotation.x = THREE.MathUtils.degToRad(tiltNorth)
    terrainMeshes.push(...bridge.userData.walkable)
    colliders.push(...bridge.userData.rails)   // 両側の柱の列を手すりにして、橋の横から落ちないようにする
  }
  placeBridge(0.0, -134.0, { tiltNorth: 5 })   // 北側の岸の方へ 5° 傾ける
  placeBridge(0.0, 124.0, { sink: 2 })          // 地面に 2m めり込ませる
  placeBridge(0.0, 16.7, { sink: 2 })           // lon 124 と同じく地面に 2m めり込ませる

  // --- ランドマーク: 土手 dote 40坪（lat=-4.5, lon=-15.0 から南へ縦に3つといちばん北の東に1つ、lat=13.5, lon=-8.6 から北へ縦に8つ、lat=-25.0, lon=113.0 から北へ縦に4つ、lat=-24.0, lon=118.0 から北へ縦に3つ）、20坪（lat=21.0, lon=-5.0 から北へ縦に8つ、lat=-12.0, lon=0.0 から北へ2列 × 東へ4列）、一辺20m（lat=33.0, lon=-166.0）、一辺30m（lat=5.0, lon=-167.0）、一辺20m（lat=-5.0, lon=-104.0 と lat=-11.0, lon=-98.0、lat=6.0, lon=150.0 から北へ縦に5つ） ------------
  // 実寸（天面の真ん中を結ぶ四角形の一辺約11.5m・高さ1.2m）。辺を南北・東西にそろえ、裾（y=0）どうしの間隔は DOTE_GAP
  // 上を歩いて越えられるよう地表と同じレイキャスト対象にする（当たり判定の矩形は付けない）
  {
    const DOTE_GAP = 2   // 隣の土手との裾どうしの間隔 (m)（指定があった列は別）
    const R_G = R_C + LAND_LIFT
    // 土手は全部 doteGroup に置き、最後に色ごとに 1 つのメッシュ（と輪郭線 1 つ）へまとめる
    // マテリアルは土手ごとに作られるので、同じ色どうしで共有させてからまとめる
    const doteGroup = new THREE.Group()
    group.add(doteGroup)
    const doteMats = new Map()
    // 基準の土手の中心から east, north (m) ずらした所に置く
    const placeDote = (dote, lat0, lon0, east = 0, north = 0) => {
      const lat = lat0 + THREE.MathUtils.radToDeg(north / R_G)
      const lon = lon0 + THREE.MathUtils.radToDeg(east / (R_G * Math.cos(THREE.MathUtils.degToRad(lat))))
      placeOnSurface(doteGroup, dote, lat, lon, R_G)
      dote.rotateY(northAngle(dote))
      const mesh = dote.children[0]   // children[0] = 土手のメッシュ
      const hex = mesh.material.color.getHex()
      if (!doteMats.has(hex)) doteMats.set(hex, mesh.material)
      mesh.material = doteMats.get(hex)
    }
    const [c0, s1, s2, e1] = [0, 0, 0, 0].map(() => createDote({ tsubo: 40 }))
    const step = 2 * c0.userData.footprint.halfW + DOTE_GAP   // 隣どうしの中心の間隔（halfW = 裾 y=0 の半分）
    placeDote(c0, -4.5, -15.0)
    placeDote(s1, -4.5, -15.0, 0, -step)
    placeDote(s2, -4.5, -15.0, 0, -2 * step)
    placeDote(e1, -4.5, -15.0, step, 0)
    // lat=13.5, lon=-8.6 から北へ縦に8つ
    for (let k = 0; k < 8; k++) placeDote(createDote({ tsubo: 40 }), 13.5, -8.6, 0, k * step)
    // lat=-25.0, lon=113.0 から北へ縦に4つ。西がすぐ海なので、東（内陸側）へ 4m ずらす
    for (let k = 0; k < 4; k++) placeDote(createDote({ tsubo: 40 }), -25.0, 113.0, 4, k * step)
    // lat=-24.0, lon=118.0 から北へ縦に3つ
    for (let k = 0; k < 3; k++) placeDote(createDote({ tsubo: 40 }), -24.0, 118.0, 0, k * step)
    // 一辺20m（天面の真ん中を結ぶ四角形）を lat=33.0, lon=-166.0 に1つ
    placeDote(createDote({ size: 20 }), 33.0, -166.0)
    // 一辺30m を lat=5.0, lon=-167.0 に1つ
    placeDote(createDote({ size: 30 }), 5.0, -167.0)
    // 一辺20m を lat=-5.0, lon=-104.0 に1つ
    placeDote(createDote({ size: 20 }), -5.0, -104.0)
    // 一辺20m を lat=-11.0, lon=-98.0 に1つ
    placeDote(createDote({ size: 20 }), -11.0, -98.0)
    // 一辺20m を lat=6.0, lon=150.0 から北へ縦に5つ（この列だけ間隔 5m）
    {
      const d = [...Array(5)].map(() => createDote({ size: 20 }))
      const step20m = 2 * d[0].userData.footprint.halfW + 5
      d.forEach((x, k) => placeDote(x, 6.0, 150.0, 0, k * step20m))
    }
    // 20坪を lat=21.0, lon=-5.0 から北へ縦に8つ
    {
      const d20 = [...Array(8)].map(() => createDote({ tsubo: 20 }))
      const step20 = 2 * d20[0].userData.footprint.halfW + DOTE_GAP
      d20.forEach((d, k) => placeDote(d, 21.0, -5.0, 0, k * step20))
      // 20坪を lat=-12.0, lon=0.0 を南西の角にして、北へ2列 × 東へ4列
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) placeDote(createDote({ tsubo: 20 }), -12.0, 0.0, col * step20, row * step20)
      }
    }
    mergeStatic(doteGroup)
    terrainMeshes.push(...doteGroup.children.filter(o => o.isMesh))   // 上を歩いて越えられるよう地表と同じレイキャスト対象にする
  }

  // --- ランドマーク: ライト light01 ---------------------------------
  // 1.5倍で高さ約6.3m（棒4.65m）。ラインに沿って等間隔に並べる
  // 満潮で水に入る所（地面が海面+潮+1m の 366.5m より低い所）は、ラインに沿って近くの陸へずらしてある
  // 地面の高さは地表メッシュへのレイキャストで求める（海岸の斜面にも足元を合わせる）。頭の正面を北へ向ける
  // 頭の中心の位置と発光マテリアルを lamps に入れる（main.js が sabちゃんから 50m 以内でいちばん近い 1 本だけ点ける）
  // 頭の発光マテリアルは全ライトで共有なので、1 本ずつ点け消しできるようライトごとに複製する
  {
    const LIGHT01_SPOTS = [
      // lat=-5, lon=-50 → lat=-5, lon=-65 → lat=-19, lon=-86 に 7 本・約41m 間隔（始点だけ 4m 先の陸へずらす）
      { lat:  -5.007, lon: -50.643 },
      { lat:  -5.042, lon: -56.650 },
      { lat:  -5.017, lon: -63.301 },
      { lat:  -7.894, lon: -69.019 },
      { lat: -11.717, lon: -74.511 },
      { lat: -15.432, lon: -80.155 },
      { lat: -19.000, lon: -86.000 },
      // lat=-40, lon=91 → lat=-35, lon=54 → lat=-21, lon=54 に 8 本・約39m 間隔（全長 272m を 7 等分して両端にも置く）
      { lat: -40.000, lon:  91.000 },
      { lat: -39.954, lon:  82.877 },
      { lat: -39.346, lon:  74.831 },
      { lat: -38.196, lon:  66.984 },
      { lat: -36.542, lon:  59.432 },
      { lat: -33.446, lon:  54.000 },
      { lat: -27.223, lon:  54.000 },
      { lat: -21.000, lon:  54.000 },
    ]
    const LIGHT01_SCALE = 1.5
    const LIGHT01_SINK = 0.1   // 斜面でも足元が浮かないよう地面にめり込ませる量 (m)
    const ray = new THREE.Raycaster()
    surface.updateMatrixWorld()
    // ライトは全部 lightGroup に置き、点け消しする頭以外（棒・リング・耳）を全ライトでまとめる
    const lightGroup = new THREE.Group()
    group.add(lightGroup)
    const lightGlows = []
    for (const { lat, lon } of LIGHT01_SPOTS) {
      const d = dirOf(lat, lon)
      ray.set(d.clone().multiplyScalar(R_C * 2), d.clone().negate())
      const ground = ray.intersectObject(surface)[0]?.point.length() ?? R_C + LAND_LIFT
      const light = createLight01()
      light.scale.setScalar(LIGHT01_SCALE)
      placeOnSurface(lightGroup, light, lat, lon, ground - LIGHT01_SINK)
      light.rotateY(northAngle(light))
      // 当たり判定はライトと同じ位置・向きの Object3D に持たせる（ライトの Group はまとめると空になって消えるので）
      const col = new THREE.Object3D()
      col.position.copy(light.position); col.quaternion.copy(light.quaternion); col.scale.copy(light.scale)
      col.userData.footprint = light.userData.footprint
      group.add(col)
      colliders.push(col)
      let glow = null
      light.traverse(o => {
        if (o.material?.emissive?.getHex()) { glow = o.material = o.material.clone(); glow.emissiveIntensity = 0; lightGlows.push(o) }
      })
      light.updateMatrix()
      lamps.push({ pos: light.userData.lamp.clone().applyMatrix4(light.matrix), glow })
    }
    mergeStatic(lightGroup, { keep: o => lightGlows.includes(o) })
  }

  // --- EB_v87 (lat=-72, lon=90) --------------------------------
  // local -Z が南極（coccolith -Y 頂点）方向、local +Y = 球面法線
  const _ebLat = -72 * Math.PI / 180
  const _ebTheta = (90 + 180) * Math.PI / 180
  const ebN = new THREE.Vector3(
    Math.cos(_ebLat) * Math.cos(_ebTheta),
    Math.sin(_ebLat),
    Math.cos(_ebLat) * Math.sin(_ebTheta)
  ).normalize()
  const ebFwd = new THREE.Vector3(0, 1, 0).addScaledVector(ebN, new THREE.Vector3(0, 1, 0).dot(ebN) * -1).normalize()
  const ebRight = new THREE.Vector3().crossVectors(ebN, ebFwd)
  const ebWrapper = new THREE.Group()
  ebWrapper.add(createEB_v87())
  ebWrapper.scale.setScalar(6)
  ebWrapper.position.copy(ebN.clone().multiplyScalar(R_C + LAND_LIFT + 15))
  ebWrapper.setRotationFromMatrix(new THREE.Matrix4().makeBasis(ebRight, ebN, ebFwd))
  group.add(ebWrapper)

  return { group, terrainMeshes, oceanMesh, colliders, lamps, coinSlot: coinbox.userData.slot }
}

// 島[GF] (lat 0-36°N, lon 72-108°E) に岩を InstancedMesh で散布
// 底面クランプなし・全軸ランダム回転。draw call = 形状数（3回）
// 豆腐ハウス: 幅15m × 奥行12m × 高さ6m。原点 = 底面中心、+Z 面が正面（玄関ホール側）
// 外扉は図面どおり右側面（+X 面）の正面寄り。室内は src/interiors/tofu.js
function createTofuHouse() {
  const W = 15, D = 12, H = 6
  const house = new THREE.Group()
  house.userData.footprint = { halfW: W / 2, halfD: D / 2 }  // 当たり判定用（ローカル XZ の矩形）

  const boxGeo = new THREE.BoxGeometry(W, H, D)
  boxGeo.translate(0, H / 2, 0)
  const wall = new THREE.MeshLambertMaterial({ color: 0xD9D2EE })
  const top  = new THREE.MeshLambertMaterial({ color: 0xFFFFFF })
  // BoxGeometry の面順: +X, -X, +Y, -Y, +Z, -Z
  const box = new THREE.Mesh(boxGeo, [wall, wall, top, wall, wall, wall])
  box.castShadow = true
  box.receiveShadow = true
  house.add(box)

  // 手描き風の白い輪郭線
  house.add(new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: 0xFFFFFF })))

  // 外扉（右側面、正面の角から 0.3〜1.9m）
  const DOOR_W = 1.6, DOOR_H = 2.6, doorZ = D / 2 - 1.1
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, DOOR_H, DOOR_W), new THREE.MeshLambertMaterial({ color: 0x74523F }))
  door.position.set(W / 2 + 0.06, DOOR_H / 2, doorZ)
  house.add(door)
  addDoorGlow(door)
  house.userData.door = { id: 'tofu', mesh: door, local: new THREE.Vector3(W / 2, 0, doorZ), outward: new THREE.Vector3(1, 0, 0) }

  // ドアノブ（奥側）と蝶番×2（正面側）
  const metal = new THREE.MeshLambertMaterial({ color: 0x3A3040 })
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), metal)
  knob.position.set(W / 2 + 0.15, DOOR_H * 0.48, doorZ - DOOR_W / 2 + 0.2)
  house.add(knob)
  const hingeGeo = new THREE.BoxGeometry(0.06, 0.22, 0.06)
  ;[0.75, 0.25].forEach((h) => {
    const hinge = new THREE.Mesh(hingeGeo, metal)
    hinge.position.set(W / 2 + 0.12, DOOR_H * h, doorZ + DOOR_W / 2 + 0.03)
    house.add(hinge)
  })

  return house
}

function createIslandGFRocks(noise3D) {
  const rng   = Alea('islandGF-scatter')
  const dummy = new THREE.Object3D()
  const group = new THREE.Group()

  const configs = [
    { geo: new THREE.IcosahedronGeometry(1, 0),  color: 0x7a7872, count:  80 },
    { geo: new THREE.DodecahedronGeometry(1, 0), color: 0x8a8a8a, count:  70 },
    { geo: new THREE.IcosahedronGeometry(1, 0),  color: 0x969490, count:  50 },
  ]

  for (const { geo, color, count } of configs) {
    const mat   = new THREE.MeshLambertMaterial({ color, flatShading: true })
    const iMesh = new THREE.InstancedMesh(geo, mat, count)
    let placed = 0, tries = 0

    while (placed < count && tries < count * 20) {
      tries++
      const lat = 3  + rng() * 22   // 3°〜25°N
      const lon = 90 + rng() * 6    // 90°〜96°E 均一

      const { x: nx, y: ny, z: nz } = dirOf(lat, lon)

      // 地形と同じノイズ式で陸地判定
      if (landNoise(noise3D, nx, ny, nz) < LAND_THRESHOLD || Math.abs(ny) < 5 / R_C) continue

      // 低周波ノイズで分布を偏らせる（棄却サンプリング）
      // 周波数を上げるとクラスターが細かくなる
      const cluster = Math.pow(noise3D(nx, ny, nz) * 0.5 + 0.5, 3)  // 0〜1、低値を強く抑制
      if (rng() > cluster) continue

      const s = 1 + rng() * 2        // 1〜3m
      dummy.position.set(nx, ny, nz).multiplyScalar(R_C + LAND_LIFT - s * 0.3)
      dummy.quaternion
        .setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz))
        .multiply(new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2)
        ))
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      iMesh.setMatrixAt(placed++, dummy.matrix)
    }

    iMesh.count = placed
    iMesh.instanceMatrix.needsUpdate = true
    group.add(iMesh)
  }

  return group
}

// 緯度10分割・経度10分割のグリッドを LineSegments で生成
// 座標系: theta = (lon + 180) * PI/180, phi = (90 - lat) * PI/180
const GRID_R   = 367.5  // グリッド球半径 (m)
const GRID_SEGS = 96    // 1本の円を近似するセグメント数

function createLatLonGrid() {
  const verts = []

  // 緯度線: -72, -54, -36, -18, 0, 18, 36, 54, 72（極は点なので除外）
  for (let lat = -72; lat <= 72; lat += 18) {
    const phi = (90 - lat) * Math.PI / 180
    const ry  = GRID_R * Math.cos(phi)  // 輪の y 座標
    const rr  = GRID_R * Math.sin(phi)  // 輪の半径
    for (let i = 0; i < GRID_SEGS; i++) {
      const t0 = (i / GRID_SEGS) * Math.PI * 2
      const t1 = ((i + 1) / GRID_SEGS) * Math.PI * 2
      verts.push(rr * Math.cos(t0), ry, rr * Math.sin(t0))
      verts.push(rr * Math.cos(t1), ry, rr * Math.sin(t1))
    }
  }

  // 経度線: 10本（-180 から 36° 刻み）
  for (let lon = -180; lon < 180; lon += 36) {
    const theta = (lon + 180) * Math.PI / 180
    const cosT  = Math.cos(theta), sinT = Math.sin(theta)
    for (let i = 0; i < GRID_SEGS; i++) {
      const lat0 = -90 + (i / GRID_SEGS) * 180
      const lat1 = -90 + ((i + 1) / GRID_SEGS) * 180
      const phi0 = (90 - lat0) * Math.PI / 180
      const phi1 = (90 - lat1) * Math.PI / 180
      verts.push(
        GRID_R * Math.sin(phi0) * cosT, GRID_R * Math.cos(phi0), GRID_R * Math.sin(phi0) * sinT,
        GRID_R * Math.sin(phi1) * cosT, GRID_R * Math.cos(phi1), GRID_R * Math.sin(phi1) * sinT,
      )
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.4,
  })
  return new THREE.LineSegments(geo, mat)
}

// 柵 saku_1 の囲い。上から見て（ローカル X=右、Z=下）左側がコの字に凹んだ形
// 角はすべて L 字の角ピース（各辺1区間）、その間に直線ピース（2区間）を並べ、横板の端どうしは少しすき間を空ける
// 原点 = 囲いの外接矩形の中心・地面
function createSakuField() {
  const { SPAN, OVER, RAIL_T } = SAKU1
  const GAP = 0.15                              // ピースの横板の端どうしのすき間
  const ARM = RAIL_T / 2 + SPAN + OVER          // 角ピースの片側の横板の長さ（角の外の面から）
  const SL = 2 * SPAN + 2 * OVER                // 直線ピースの横板の長さ
  const edgeLen = nS => 2 * ARM + nS * SL + (nS + 1) * GAP - RAIL_T   // 角から角（杭の中心どうし）の長さ
  const W = edgeLen(3), X = edgeLen(1), A = edgeLen(0), H = 3 * A

  // 頂点（ぐるっと一周）と、各辺に並べる直線ピースの数。右の辺はすき間で長さを合わせる
  const P = [[0, 0], [W, 0], [W, H], [0, H], [0, 2 * A], [X, 2 * A], [X, A], [0, A]]
  const N_STRAIGHT = [3, 2, 3, 0, 1, 0, 1, 0]

  const field = new THREE.Group()
  field.name = '柵の囲い'
  const put = (obj, [x, z], [dx, dz]) => {      // ローカル +X を (dx,dz) へ向けて置く
    obj.position.set(x - W / 2, 0, z - H / 2)
    obj.rotation.y = Math.atan2(-dz, dx)
    field.add(obj)
  }
  const dirOf = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [(q[0] - p[0]) / l, (q[1] - p[1]) / l] }

  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length], prev = P[(i + P.length - 1) % P.length]
    const d = dirOf(p, q), L = Math.hypot(q[0] - p[0], q[1] - p[1]), nS = N_STRAIGHT[i]

    // 角ピース: +X が d、+Z が前の頂点の向きになる回転を選ぶ（逆回りなら +X を前の頂点の向きにする）
    const back = dirOf(p, prev)
    const zOfD = [-d[1], d[0]]                  // +X を d に向けたときの +Z の向き
    const near = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) < 1e-6
    put(createSaku1Corner(), p, near(zOfD, back) ? d : back)

    // 直線ピース
    const gap = (L + RAIL_T - 2 * ARM - nS * SL) / (nS + 1)
    for (let k = 0; k < nS; k++) {
      const s = -RAIL_T / 2 + ARM + gap + k * (SL + gap) + OVER   // 始点の杭の位置（角からの距離）
      put(createSaku1({ spans: 2 }), [p[0] + d[0] * s, p[1] + d[1] * s], d)
    }
  })

  // 当たり判定: 囲いの中（凹みを除く）を矩形3つ（上の帯・右の塊・下の帯）で覆う。横板の厚みぶん外へ広げる
  const box = (x0, z0, x1, z1) => {
    const o = new THREE.Object3D()
    o.position.set((x0 + x1) / 2 - W / 2, 0, (z0 + z1) / 2 - H / 2)
    o.userData.footprint = { halfW: (x1 - x0 + RAIL_T) / 2, halfD: (z1 - z0 + RAIL_T) / 2 }
    field.add(o)
    field.userData.areas.push([x0 - W / 2, z0 - H / 2, x1 - W / 2, z1 - H / 2])
  }
  field.userData.areas = []   // 囲いの中の矩形（ローカル XZ の [x0, z0, x1, z1]。草を生やす範囲に使う）
  box(0, 0, W, A)
  box(X, A, W, 2 * A)
  box(0, 2 * A, W, H)

  // 階段: 囲いの内側、凹みの奥の柵に背面を付けて置く。幅・奥行きとも杭1区間（3.6倍で約4.3m）、6段で高さ約2.7m（3.6倍時）
  // 高い面を西（凹み側）に向け、東（囲いの奥）へ下る。色と輪郭線は柵と同じ
  {
    const SW = SPAN, SD = SPAN, SH = 0.75, STEPS = 6, X0 = X + RAIL_T / 2 + 0.01   // 幅（南北）・奥行き（東西）・高さ・段数・西の面（背面）の位置（凹みの柵の横板にほぼ接する）
    const t = SD / STEPS, h = SH / STEPS
    const shape = new THREE.Shape()   // 横から見た段の形（x = 東へ、y = 上へ）
    shape.moveTo(0, 0)
    shape.lineTo(SD, 0)
    for (let i = STEPS; i >= 1; i--) {
      shape.lineTo(i * t, (STEPS - i + 1) * h)
      shape.lineTo((i - 1) * t, (STEPS - i + 1) * h)
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: SW, bevelEnabled: false })
    geo.translate(0, 0, -SW / 2)
    const fenceMesh = field.children[0].getObjectByProperty('isMesh', true)
    const line = field.children[0].getObjectByProperty('isLineSegments', true)   // 柵の輪郭線（ピースの中でまとめてある）
    const stairs = new THREE.Mesh(geo, fenceMesh.material)
    stairs.name = '階段'
    stairs.castShadow = true
    stairs.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), line.material))
    stairs.position.set(X0 - W / 2, 0, 0)
    stairs.userData.onGround = true   // 柵のように地面へめり込ませない
    field.add(stairs)
    field.userData.stairsArea = [X0 - W / 2, -SW / 2, X0 + SD - W / 2, SW / 2]
  }
  return field
}

// 柵の囲いの中に草（kind）を生やす。囲いの矩形から柵の際と階段の下を除いた範囲に、ずらした格子で並べる
// 位置は sakuWrapper・sakuField のローカル XZ から球面へ下ろす（間隔・高さは createGrassField と同じ）
function createSakuGrass(sakuWrapper, sakuField, kind) {
  const STEP   = 1.6 / Math.sqrt(kind.density ?? 2 / 3) / sakuWrapper.scale.x   // 配置間隔（ローカル単位）
  const MARGIN = 0.15                                                           // 柵の際の余白（ローカル単位、3.6倍で約0.54m）
  const { areas, stairsArea: st } = sakuField.userData
  const inUnion = (x, z) => areas.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)
  // 柵の際の余白は外周からだけ取る（矩形どうしの境目には隙間を作らない）
  const inArea = (x, z) => [[0, 0], [MARGIN, 0], [-MARGIN, 0], [0, MARGIN], [0, -MARGIN], [MARGIN, MARGIN], [MARGIN, -MARGIN], [-MARGIN, MARGIN], [-MARGIN, -MARGIN]]
    .every(([dx, dz]) => inUnion(x + dx, z + dz))
  const onStairs = (x, z) => x > st[0] - MARGIN && x < st[2] + MARGIN && z > st[1] - MARGIN && z < st[3] + MARGIN

  const toPlanet = new THREE.Matrix4().multiplyMatrices(sakuWrapper.matrix, sakuField.matrix)
  const xs = areas.flatMap(a => [a[0], a[2]]), zs = areas.flatMap(a => [a[1], a[3]])
  const rng = Alea(kind.seed + '-saku')
  const points = []
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += STEP) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += STEP) {
      const px = x + (rng() - 0.5) * STEP, pz = z + (rng() - 0.5) * STEP   // 格子の列が見えないよう、間隔の±半分ずらす
      if (inArea(px, pz) && !onStairs(px, pz)) points.push(new THREE.Vector3(px, 0, pz).applyMatrix4(toPlanet))
    }
  }

  const mat = kind.material()
  if (kind.emissive !== undefined) mat.emissiveIntensity = kind.emissive
  const im = new THREE.InstancedMesh(kind.geometry(), mat, points.length)
  im.castShadow    = false   // 数が多く影の描画が重いので、草は影を落とさない
  im.receiveShadow = true
  const up = new THREE.Vector3(0, 1, 0), quat = new THREE.Quaternion(), yRot = new THREE.Quaternion()
  const scaleV = new THREE.Vector3().setScalar(kind.scale), instMat = new THREE.Matrix4()
  const r = R_C + LAND_LIFT + kind.lift
  points.forEach((p, i) => {
    const n = p.clone().normalize()
    yRot.setFromAxisAngle(up, rng() * Math.PI * 2)
    quat.setFromUnitVectors(up, n).multiply(yRot)
    instMat.compose(n.multiplyScalar(r), quat, scaleV)
    im.setMatrixAt(i, instMat)
  })
  im.instanceMatrix.needsUpdate = true
  return im
}

// 球面上の指定緯度経度にオブジェクトを配置するユーティリティ
// lat, lon: 度数法 (-90~90, -180~180)
export function placeOnSurface(group, object, lat, lon, radius = R_C) {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  const x = radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)

  object.position.set(x, y, z)

  // 球面法線方向に立たせる
  const normal = new THREE.Vector3(x, y, z).normalize()
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)

  group.add(object)
}

// 全ルートの大円弧上に INTERVAL m 間隔で Points を配置
function createRoutePoints(routes, interval = 10) {
  const positions = []

  for (const route of routes) {
    for (let si = 0; si < route.waypoints.length - 1; si++) {
      const wA = route.waypoints[si], wB = route.waypoints[si + 1]
      const phiA = (90 - wA.lat) * Math.PI / 180, thetaA = (wA.lon + 180) * Math.PI / 180
      const phiB = (90 - wB.lat) * Math.PI / 180, thetaB = (wB.lon + 180) * Math.PI / 180
      const ax = Math.sin(phiA)*Math.cos(thetaA), ay = Math.cos(phiA), az = Math.sin(phiA)*Math.sin(thetaA)
      const bx = Math.sin(phiB)*Math.cos(thetaB), by = Math.cos(phiB), bz = Math.sin(phiB)*Math.sin(thetaB)

      const dot   = Math.max(-1, Math.min(1, ax*bx + ay*by + az*bz))
      const angle = Math.acos(dot)
      const arcLen = R_C * angle
      if (arcLen < 1e-6) continue

      const sinA = Math.sin(angle)
      const count = Math.floor(arcLen / interval)
      for (let k = 0; k <= count; k++) {
        const t  = (k * interval) / arcLen
        if (t > 1) break
        const w1 = Math.sin((1 - t) * angle) / sinA
        const w2 = Math.sin(t * angle) / sinA
        if (route.dotLat) {
          const lat = Math.asin(Math.max(-1, Math.min(1, w1*ay + w2*by))) * 180 / Math.PI
          if (lat < route.dotLat[0] || lat > route.dotLat[1]) continue
        }
        const r  = R_C + LAND_LIFT + 1
        positions.push(
          (w1*ax + w2*bx) * r,
          (w1*ay + w2*by) * r,
          (w1*az + w2*bz) * r,
        )
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: true })
  return new THREE.Points(geo, mat)
}

// lat/lon 矩形にローポリ草地を隙間なく敷き詰める（InstancedMesh）
// ポリゴン内の点判定（ray casting）
function _polyContains(lat, lon, poly) {
  let inside = false
  const np = poly.length
  for (let i = 0, j = np - 1; i < np; j = i++) {
    const ai = poly[i], aj = poly[j]
    if ((ai.lat > lat) !== (aj.lat > lat)) {
      const crossLon = aj.lon + (lat - aj.lat) / (ai.lat - aj.lat) * (ai.lon - aj.lon)
      if (lon < crossLon) inside = !inside
    }
  }
  return inside
}

// 点から線分までの距離 (度単位、lon方向にcosLat補正)
function _distToSeg(plat, plon, alat, alon, blat, blon) {
  const cosLat = Math.cos(plat * Math.PI / 180)
  const dx = (blon - alon) * cosLat, dy = blat - alat
  const px = (plon - alon) * cosLat, py = plat - alat
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-20) return Math.sqrt(px * px + py * py)
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq))
  return Math.sqrt((px - t * dx) ** 2 + (py - t * dy) ** 2)
}

// 草の種類（my-3d-parts の板ポリ草）。scale=2.5 → 地上の高さ約1.75m
//   lift: 地面からの高さ (m)。房ごとの埋め具合の違いをここで吸収する
//   seed: 境界ノイズ・位置ずらし・回転の乱数シード
//   density: 被覆率 (FOOTPRINT/間隔)²。省略時は 2/3
//   emissive: テクスチャ自身の発光の強さ（省略時はパーツの既定値）。暗い場所で浮いて見えるなら下げる
const GRASS_KIND_1 = {   // 2dgrass：細い葉の房（下部を大きく埋める形なので少し持ち上げる）
  geometry: createGrassTuftGeometry, material: createGrassMaterial,
  scale: 2.5, lift: 0.2, seed: 'grass', emissive: 0.1, density: 2 / 3 * 2 / 3,   // 既定の 2/3 の密度（間隔は約1.22倍）
}
const GRASS_KIND_2 = {   // 2dgrass2：手描きの幅広い葉の房（旧 field01 の場所）
  geometry: createGrass2TuftGeometry, material: createGrass2Material,
  scale: 2.5, lift: 0.0, seed: 'grass2', emissive: 0, density: 2 / 3 * 0.8 * 2 / 3,   // 前の密度（2/3 × 0.8）の 2/3
}

const FLOWER_STEM_KIND = {   // 花の茎：途中で折れた茎（6頂点）に葉（4頂点）を2枚。テクスチャは 2dgrass と同じ（濃い緑の単色）
  geometry: createFlowerStemGeometry, material: createGrassMaterial,
  scale: 2.2, lift: 0.0, seed: 'flowerstem', emissive: 0.1, density: 0.2,
}

const FLOWER_STEM_TIP = [0.085, 1.0, 0]   // 花の茎の先端（ジオメトリの単位）。花はここに咲かせる

// 花の茎のジオメトリ（手描きラフの形）。原点 = 根元・地面、高さ 1（茎の先端）
// UV は全頂点を草のテクスチャの濃い緑（RGB 45,82,39）の塊の中の1点に向け、単色にする（NearestFilter なので混ざらない）
function createFlowerStemGeometry() {
  const DARK_GREEN_UV = [47.5 / 64, 1 - 27.5 / 64]      // 64x64 の画像のピクセル (47, 27)
  const HW = 0.012                                       // 茎の半分の幅
  const STEM = [[-0.005, -0.05], [0.115, 0.53], FLOWER_STEM_TIP.slice(0, 2)]   // 茎の中心線（根元・折れ目・先端）。根元は少し地面に埋める
  const LEAVES = [                                       // 葉（x, y, z）。最初の点が茎の付け根
    [[0.07, 0.34, 0], [0, 0.454, 0.06], [-0.216, 0.49, 0.12], [-0.08, 0.314, 0.06]],      // 左の葉
    [[0.09, 0.416, 0], [0.224, 0.554, -0.06], [0.406, 0.472, -0.15], [0.286, 0.34, -0.06]], // 右の葉
  ]
  const pos = [], uv = [], idx = []
  STEM.forEach(([x, y]) => {
    pos.push(x - HW, y, 0, x + HW, y, 0)
    uv.push(...DARK_GREEN_UV, ...DARK_GREEN_UV)
  })
  idx.push(0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4)
  LEAVES.forEach(leaf => {
    const base = pos.length / 3
    leaf.forEach(([x, y, z]) => { pos.push(x, y, z); uv.push(...DARK_GREEN_UV) })
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// ポリゴン境界をパーリンノイズでぼかして草地を配置（y軸ランダム回転・位置ランダムずらし）
function createGrassField(poly, noise3D, kind) {
  const DEG            = Math.PI / 180
  const GRASS_SCALE    = kind.scale
  const FOOTPRINT      = 1.6                 // 配置間隔の基準 (m)
  const DENSITY        = kind.density ?? 2 / 3   // 被覆率: (FOOTPRINT/間隔)²
  const dlatDeg        = FOOTPRINT / (Math.sqrt(DENSITY) * R_C * DEG)
  const EDGE_WIDTH     = 6.0   // 境界フェード幅 (度 ≈ 37.5m)
  const NOISE_FREQ     = 25
  const NOISE_STRENGTH = 0.8

  const edgeNoise = createNoise3D(Alea(kind.seed + '-edge'))

  const latMin = Math.min(...poly.map(p => p.lat))
  const latMax = Math.max(...poly.map(p => p.lat))
  const lonMin = Math.min(...poly.map(p => p.lon))
  const lonMax = Math.max(...poly.map(p => p.lon))

  // 海岸バッファ: 候補点から20m以内に海があればスキップ
  // 20m = (20/R_C)*(180/π) ≈ 3.2° のアーク角
  const COAST_DEG = (20 / R_C) * (180 / Math.PI)
  const landN = (plat, plon) => {
    const d = dirOf(plat, plon)
    return landNoise(noise3D, d.x, d.y, d.z)
  }

  // グリッド位置を収集（境界外EDGE_WIDTH分まで走査）
  const posBuf = []
  const jitRng = Alea(kind.seed + '-jitter')   // 格子の列が見えないよう、間隔の±半分ずらす
  for (let lat = latMin - EDGE_WIDTH; lat <= latMax + EDGE_WIDTH + 1e-9; lat += dlatDeg) {
    const dlonDeg = dlatDeg / Math.cos(lat * DEG)
    const dlon20  = COAST_DEG / Math.cos(lat * DEG)
    for (let lon = lonMin - EDGE_WIDTH; lon <= lonMax + EDGE_WIDTH + 1e-9; lon += dlonDeg) {
      // ポリゴン境界からの符号付き距離（内側=正、外側=負）
      const np = poly.length
      let minDist = Infinity
      for (let i = 0; i < np; i++) {
        const a = poly[i], b = poly[(i + 1) % np]
        const d = _distToSeg(lat, lon, a.lat, a.lon, b.lat, b.lon)
        if (d < minDist) minDist = d
      }
      const inside      = _polyContains(lat, lon, poly)
      const edgeFactor  = (inside ? 1 : -1) * minDist / EDGE_WIDTH

      if (edgeFactor <= -NOISE_STRENGTH) continue

      const phi   = (90 - lat) * DEG
      const theta = (lon + 180) * DEG
      const nx    = Math.sin(phi) * Math.cos(theta)
      const ny    = Math.cos(phi)
      const nz    = Math.sin(phi) * Math.sin(theta)

      // 地形と同じノイズ式で陸地判定 — 海の点はスキップ
      if (landNoise(noise3D, nx, ny, nz) < LAND_THRESHOLD) continue

      // 4近傍20m以内に海があれば海岸バッファとしてスキップ
      if (landN(lat + COAST_DEG, lon        ) < LAND_THRESHOLD ||
          landN(lat - COAST_DEG, lon        ) < LAND_THRESHOLD ||
          landN(lat,             lon + dlon20) < LAND_THRESHOLD ||
          landN(lat,             lon - dlon20) < LAND_THRESHOLD) continue

      if (edgeFactor < NOISE_STRENGTH) {
        const nv = edgeNoise(nx * NOISE_FREQ, ny * NOISE_FREQ, nz * NOISE_FREQ)
        if (edgeFactor + nv * NOISE_STRENGTH <= 0) continue
      }
      posBuf.push(lat + (jitRng() - 0.5) * dlatDeg, lon + (jitRng() - 0.5) * dlonDeg)
    }
  }
  const count = posBuf.length / 2

  const mat = kind.material()
  if (kind.emissive !== undefined) mat.emissiveIntensity = kind.emissive
  const im = new THREE.InstancedMesh(kind.geometry(), mat, count)
  im.castShadow    = false   // 数が多く影の描画が重いので、草は影を落とさない
  im.receiveShadow = true

  const up       = new THREE.Vector3(0, 1, 0)
  const yAxis    = new THREE.Vector3(0, 1, 0)
  const normal   = new THREE.Vector3()
  const pos3     = new THREE.Vector3()
  const quat     = new THREE.Quaternion()
  const yRot     = new THREE.Quaternion()
  const scaleV   = new THREE.Vector3(GRASS_SCALE, GRASS_SCALE, GRASS_SCALE)
  const instMat  = new THREE.Matrix4()
  const r        = R_C + LAND_LIFT + kind.lift
  const rotRng   = Alea(kind.seed + '-rot')

  for (let idx = 0; idx < count; idx++) {
    const lat   = posBuf[idx * 2]
    const lon   = posBuf[idx * 2 + 1]
    const phi   = (90 - lat) * DEG
    const theta = (lon + 180) * DEG

    pos3.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    )
    normal.copy(pos3).normalize()
    // ランダムy軸回転（シード固定で決定論的）
    yRot.setFromAxisAngle(yAxis, rotRng() * Math.PI * 2)
    quat.setFromUnitVectors(up, normal).multiply(yRot)
    instMat.compose(pos3, quat, scaleV)
    im.setMatrixAt(idx, instMat)
  }

  im.instanceMatrix.needsUpdate = true

  const group = new THREE.Group()
  group.add(im)
  return group
}


// 看板の黒板の下（脚の切り欠きまでの帯）の真ん中に「UPDATE/更新」を光る文字で貼る
// 帯は少し前へ傾いているので、看板の本体を正面から測って面の位置と傾きを合わせる（kanban のローカル座標）
const KANBAN_LABEL_TEXT   = 'UPDATE/更新'
const KANBAN_LABEL_COLOR  = '#b9b4ff'   // 青紫
const KANBAN_LABEL_GLOW   = '#7a6cff'
const KANBAN_LABEL_FILL   = 0.62        // 文字の高さ / 帯の高さ
function addKanbanLabel(kanban, board) {
  const body = kanban.children.find(o => o.isMesh && o !== board)
  board.geometry.computeBoundingBox()
  const yTop = board.geometry.boundingBox.min.y   // 黒板の下端
  // 本体の表を、帯の上下 2 か所で正面から測る（ジオメトリそのものに当てるので kanban の拡大・配置は関係ない）
  const probe = new THREE.Mesh(body.geometry)
  const ray = new THREE.Raycaster()
  const frontZ = (y) => {
    ray.set(new THREE.Vector3(0, y, 1), new THREE.Vector3(0, 0, -1))
    return ray.intersectObject(probe, false)[0]?.point.z
  }
  // 帯の下端（脚の間の切り欠きの天井）を探す: 中央で表が当たらなくなる高さ
  let yBottom = yTop
  while (yBottom > 0 && frontZ(yBottom - 0.002) !== undefined) yBottom -= 0.002
  const h = yTop - yBottom
  const y0 = yBottom + h * 0.2, y1 = yTop - h * 0.2
  const z0 = frontZ(y0), z1 = frontZ(y1)
  const tilt = Math.atan2(z1 - z0, y1 - y0)   // 上ほど前に出ている

  // 文字をキャンバスに描く（にじませた影で光って見せる）
  const PX = 96   // 文字の大きさ (px)
  const font = `bold ${PX}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`
  const measure = document.createElement('canvas').getContext('2d')
  measure.font = font
  const pad = PX * 0.4
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(measure.measureText(KANBAN_LABEL_TEXT).width + pad * 2)
  canvas.height = Math.ceil(PX * 1.3 + pad * 2)
  const ctx = canvas.getContext('2d')
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = KANBAN_LABEL_COLOR
  ctx.shadowColor = KANBAN_LABEL_GLOW
  for (const blur of [PX * 0.35, PX * 0.15]) {   // 外側の広いにじみ → 内側の強いにじみ
    ctx.shadowBlur = blur
    ctx.fillText(KANBAN_LABEL_TEXT, canvas.width / 2, canvas.height / 2)
  }
  ctx.shadowBlur = 0
  ctx.fillText(KANBAN_LABEL_TEXT, canvas.width / 2, canvas.height / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4

  // 文字の高さを帯に合わせ、kanban の横の拡大（scale.x）を打ち消して縦横比を保つ
  const textH = h * KANBAN_LABEL_FILL * canvas.height / (PX * 1.3)
  const textW = textH * canvas.width / canvas.height
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(textW / kanban.scale.x, textH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }),
  )
  const yc = (yBottom + yTop) / 2
  mesh.position.set(0, yc, z0 + (z1 - z0) * (yc - y0) / (y1 - y0) + 0.002)
  mesh.rotation.x = tilt   // 板の上 (+Y) を前 (+Z) へ倒す
  mesh.renderOrder = 1
  kanban.add(mesh)
}
