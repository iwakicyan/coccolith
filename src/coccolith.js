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
import { addDoorGlow } from './doorGlow.js'
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
const R_OCEAN      = 364      // 海面球の半径 (m)
const OCEAN_COLOR_A = 0x629ec1
const OCEAN_COLOR_B = 0x5782B8

// ---- 道路 -------------------------------------------------------
const ROAD_HALF_WIDTH = 17.5   // 道幅35m の半分 (m)

// 複数の道を座標リストで定義する。各 waypoints は {lat, lon} の配列。
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

// { group, terrainMeshes } を返す
// terrainMeshes: レイキャスト対象メッシュ（山などを追加する時はここに push する）
// renderer: 金属の映り込み用 envMap を作るのに使う（省略時は映り込みなし）
export function createCoccolith({ renderer = null } = {}) {
  const group = new THREE.Group()
  const terrainMeshes = []
  const colliders = []   // sabちゃんが侵入できない建物（userData.footprint を持つ Object3D）

  const noise3D = createNoise3D(Alea('coccolith'))

  // --- 山定義: 1段=35m幅 ---
  const HILL_STEP = 35

  // 山A: lat:-13.4° lon:-137.4° / 頂点20・中段6
  const hillADir = new THREE.Vector3(
    Math.sin((90 - (-13.4)) * Math.PI / 180) * Math.cos((-137.4 + 180) * Math.PI / 180),
    Math.cos((90 - (-13.4)) * Math.PI / 180),
    Math.sin((90 - (-13.4)) * Math.PI / 180) * Math.sin((-137.4 + 180) * Math.PI / 180),
  )

  // 山B: lat:-10.5° lon:-171.0° / 頂点9・中段6
  const hillBDir = new THREE.Vector3(
    Math.sin((90 - (-10.5)) * Math.PI / 180) * Math.cos((-171.0 + 180) * Math.PI / 180),
    Math.cos((90 - (-10.5)) * Math.PI / 180),
    Math.sin((90 - (-10.5)) * Math.PI / 180) * Math.sin((-171.0 + 180) * Math.PI / 180),
  )

  // 山C: lat:-53.0° lon:-44.8° / 3段・頂点20・中断1 20・中断3 10
  // 山D: lat:67.9° lon:-123.2° / 2段・頂点12・中断6
  // 山E: lat:62.0° lon:-101.4° / 3段・頂点16・中断1 8・中断2 6
  const hillCDir = new THREE.Vector3(
    Math.sin((90 - (-53.0)) * Math.PI / 180) * Math.cos((-44.8 + 180) * Math.PI / 180),
    Math.cos((90 - (-53.0)) * Math.PI / 180),
    Math.sin((90 - (-53.0)) * Math.PI / 180) * Math.sin((-44.8 + 180) * Math.PI / 180),
  )
  const hillDDir = new THREE.Vector3(
    Math.sin((90 - 67.9)    * Math.PI / 180) * Math.cos((-123.2 + 180) * Math.PI / 180),
    Math.cos((90 - 67.9)    * Math.PI / 180),
    Math.sin((90 - 67.9)    * Math.PI / 180) * Math.sin((-123.2 + 180) * Math.PI / 180),
  )
  const hillEDir = new THREE.Vector3(
    Math.sin((90 - 62.0)    * Math.PI / 180) * Math.cos((-101.4 + 180) * Math.PI / 180),
    Math.cos((90 - 62.0)    * Math.PI / 180),
    Math.sin((90 - 62.0)    * Math.PI / 180) * Math.sin((-101.4 + 180) * Math.PI / 180),
  )
  // 山F: lat:-12.2° lon:-32.7° / 2段・頂上16・中段8
  const hillFDir = new THREE.Vector3(
    Math.sin((90 - (-12.2)) * Math.PI / 180) * Math.cos((-32.7 + 180) * Math.PI / 180),
    Math.cos((90 - (-12.2)) * Math.PI / 180),
    Math.sin((90 - (-12.2)) * Math.PI / 180) * Math.sin((-32.7 + 180) * Math.PI / 180),
  )
  // 山G: lat:-28.2° lon:-40.6° / 1段・10m
  const hillGDir = new THREE.Vector3(
    Math.sin((90 - (-28.2)) * Math.PI / 180) * Math.cos((-40.6 + 180) * Math.PI / 180),
    Math.cos((90 - (-28.2)) * Math.PI / 180),
    Math.sin((90 - (-28.2)) * Math.PI / 180) * Math.sin((-40.6 + 180) * Math.PI / 180),
  )

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

    // オクターブ重ね: 低周波で大陸形状、高周波で細かい起伏
    const n = noise3D(nx * 1.8, ny * 1.8, nz * 1.8) * 0.7
            + noise3D(nx * 4.2, ny * 4.2, nz * 4.2) * 0.2
            + noise3D(nx * 9.0, ny * 9.0, nz * 9.0) * 0.1

    // 赤道面(y=0)から±5m 以内は川として強制的に海扱い
    const isRiver = Math.abs(y) < 6
    // 北極・南極から半径5m（10×10相当）は強制的に陸地
    const dNorth = Math.sqrt(x*x + (y-R_C)*(y-R_C) + z*z)
    const dSouth = Math.sqrt(x*x + (y+R_C)*(y+R_C) + z*z)
    const isPole = dNorth < 50 || dSouth < 50
    const arcDistA = R_C * Math.acos(Math.max(-1, Math.min(1, nx * hillADir.x + ny * hillADir.y + nz * hillADir.z)))
    const liftA    = arcDistA < HILL_STEP     ? 20
                   : arcDistA < HILL_STEP * 2 ? 6
                   : 0

    const arcDistB = R_C * Math.acos(Math.max(-1, Math.min(1, nx * hillBDir.x + ny * hillBDir.y + nz * hillBDir.z)))
    const liftB    = arcDistB < HILL_STEP     ? 9
                   : arcDistB < HILL_STEP * 2 ? 6
                   : 0

    const arcDistC = R_C * Math.acos(Math.max(-1, Math.min(1, nx * hillCDir.x + ny * hillCDir.y + nz * hillCDir.z)))
    const liftC    = arcDistC < HILL_STEP     ? 20
                   : arcDistC < HILL_STEP * 2 ? 20
                   : arcDistC < HILL_STEP * 3 ? 10
                   : 0

    const arcDistD = R_C * Math.acos(Math.max(-1, Math.min(1, nx * hillDDir.x + ny * hillDDir.y + nz * hillDDir.z)))
    const liftD    = arcDistD < HILL_STEP     ? 12
                   : arcDistD < HILL_STEP * 2 ? 6
                   : 0

    const arcDistE = R_C * Math.acos(Math.max(-1, Math.min(1, nx * hillEDir.x + ny * hillEDir.y + nz * hillEDir.z)))
    const liftE    = arcDistE < HILL_STEP     ? 16
                   : arcDistE < HILL_STEP * 2 ? 8
                   : arcDistE < HILL_STEP * 3 ? 6
                   : 0

    const arcDistF = R_C * Math.acos(Math.max(-1, Math.min(1, nx * hillFDir.x + ny * hillFDir.y + nz * hillFDir.z)))
    const liftF    = arcDistF < HILL_STEP     ? 16
                   : arcDistF < HILL_STEP * 2 ? 8
                   : 0

    const arcDistG = R_C * Math.acos(Math.max(-1, Math.min(1, nx * hillGDir.x + ny * hillGDir.y + nz * hillGDir.z)))
    const liftG    = arcDistG < HILL_STEP     ? 10
                   : 0

    const hillLift = Math.max(liftA, liftB, liftC, liftD, liftE, liftF, liftG)

    const isLand = (n >= LAND_THRESHOLD && !isRiver) || isPole || hillLift > 0
    const lift   = isLand ? LAND_LIFT : 0
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
  {
    const n = tofuWrapper.position.clone().normalize()
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y)
      .applyQuaternion(tofuWrapper.quaternion.clone().invert())
    tofu.rotation.y = Math.atan2(north.x, north.z)
  }
  colliders.push(tofu)

  // --- ランドマーク: Materis 1〜5 × 各2 ---------------------
  // Route1/2 ウェイポイント（陸地確定）をアンカーに、シード文字列で ±1° ジッター

  // 地形メッシュと同じ山の計算式で hillLift を返す
  const _hillLiftAt = (lat, lon) => {
    const phi = (90 - lat) * Math.PI / 180
    const theta = (lon + 180) * Math.PI / 180
    const nx = Math.sin(phi) * Math.cos(theta)
    const ny = Math.cos(phi)
    const nz = Math.sin(phi) * Math.sin(theta)
    const arc = (dir) => R_C * Math.acos(Math.max(-1, Math.min(1, nx * dir.x + ny * dir.y + nz * dir.z)))
    const arcA = arc(hillADir); const liftA = arcA < HILL_STEP ? 20 : arcA < HILL_STEP * 2 ? 6  : 0
    const arcB = arc(hillBDir); const liftB = arcB < HILL_STEP ? 9  : arcB < HILL_STEP * 2 ? 6  : 0
    const arcC = arc(hillCDir); const liftC = arcC < HILL_STEP ? 20 : arcC < HILL_STEP * 2 ? 20 : arcC < HILL_STEP * 3 ? 10 : 0
    const arcD = arc(hillDDir); const liftD = arcD < HILL_STEP ? 12 : arcD < HILL_STEP * 2 ? 6  : 0
    const arcE = arc(hillEDir); const liftE = arcE < HILL_STEP ? 16 : arcE < HILL_STEP * 2 ? 8  : arcE < HILL_STEP * 3 ? 6  : 0
    const arcF = arc(hillFDir); const liftF = arcF < HILL_STEP ? 16 : arcF < HILL_STEP * 2 ? 8  : 0
    const arcG = arc(hillGDir); const liftG = arcG < HILL_STEP ? 10 : 0
    return Math.max(liftA, liftB, liftC, liftD, liftE, liftF, liftG)
  }

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
      placeOnSurface(group, w, lat, lon, R_C + LAND_LIFT + _hillLiftAt(lat, lon) + 5.0)
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
  {
    const n = touWrapper.position.clone().normalize()
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y)
      .applyQuaternion(touWrapper.quaternion.clone().invert())
    tou.rotation.y = Math.atan2(north.x, north.z) - Math.PI / 4 + Math.PI / 2
  }
  colliders.push(tou)

  // --- ランドマーク: ツリーハウス (lat=53.0, lon=-171.0) -----------
  // 2倍で高さ約22m。当たり判定は幹のまわりだけ（部屋は頭上なので下をくぐれる）
  const treehouseWrapper = new THREE.Group()
  const treehouse = createTreehouse()
  treehouse.rotation.y = Math.PI   // 正面（扉・はしご側）の向きを 180° 回す
  treehouseWrapper.add(treehouse)
  treehouseWrapper.scale.setScalar(2)
  placeOnSurface(group, treehouseWrapper, 53.0, -171.0, R_C + LAND_LIFT - 0.3)
  colliders.push(treehouse)

  // --- ランドマーク: 看板 kanban (lat=83.0, lon=-160.0) ------------
  // 16.7倍で高さ約20m、横幅だけさらに 1.5 倍（約15m）。地面に 2m めり込ませる。表（黒板・ローカル +Z）を北（緯度+方向）へ向ける
  const kanbanWrapper = new THREE.Group()
  const kanban = createKanban()
  kanban.scale.x = 1.5   // 横幅（ローカル X）だけ広げる。弓なりは Z 方向なので形は崩れない
  kanbanWrapper.add(kanban)
  kanbanWrapper.scale.setScalar(16.7)
  placeOnSurface(group, kanbanWrapper, 83.0, -160.0, R_C + LAND_LIFT - 2.0)
  {
    const n = kanbanWrapper.position.clone().normalize()
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y)
      .applyQuaternion(kanbanWrapper.quaternion.clone().invert())
    kanban.rotation.y = Math.atan2(north.x, north.z)
  }
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
  }

  // --- ランドマーク: 柵 saku_1 (lat=-5.6, lon=100.0) ----------------
  // 3倍で高さ約3.3m（地面に 0.7m めり込ませる）。上から見て左がコの字に凹んだ囲い（約35m × 26m）を、直線と角のピースで組む
  // 図の上（ローカル -Z）を北（緯度+方向）へ向ける。囲いの中には入れない（外側の凹みには入れる）
  {
    const SAKU_RADIUS = R_C + LAND_LIFT - 0.7
    const sakuWrapper = new THREE.Group()
    const sakuField = createSakuField()
    sakuWrapper.add(sakuField)
    sakuWrapper.scale.setScalar(3)
    placeOnSurface(group, sakuWrapper, -5.6, 100.0, SAKU_RADIUS)
    const n0 = sakuWrapper.position.clone().normalize()
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(n0, -n0.y)
      .applyQuaternion(sakuWrapper.quaternion.clone().invert())
    sakuField.rotation.y = Math.atan2(north.x, north.z) + Math.PI

    // 囲いが広く、平らなままだと端が球面から浮く（端で約0.6m）ので、ピースごとに根元を球面へ下ろして法線に合わせて傾ける
    sakuWrapper.updateMatrix()
    sakuField.updateMatrix()
    const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3()
    for (const piece of sakuField.children.filter(o => !o.userData.footprint)) {
      piece.updateMatrix()
      _m.multiplyMatrices(sakuWrapper.matrix, sakuField.matrix).multiply(piece.matrix).decompose(_p, _q, _s)
      const n = _p.clone().normalize()
      piece.position.copy(n).multiplyScalar(piece.userData.onGround ? R_C + LAND_LIFT - 0.05 : SAKU_RADIUS)
      piece.quaternion.setFromUnitVectors(n0, n).multiply(_q)
      piece.scale.copy(_s)
      group.add(piece)   // 球面に直接置く（sakuField には当たり判定の矩形だけ残る）
    }
    colliders.push(...sakuField.children)
    group.add(createSakuGrass(sakuWrapper, sakuField, GRASS_KIND_1))
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

  return { group, terrainMeshes, oceanMesh, colliders }
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

      const phi   = (90 - lat) * Math.PI / 180
      const theta = (lon + 180) * Math.PI / 180
      const nx = Math.sin(phi) * Math.cos(theta)
      const ny = Math.cos(phi)
      const nz = Math.sin(phi) * Math.sin(theta)

      // 地形と同じノイズ式で陸地判定
      const n = noise3D(nx * 1.8, ny * 1.8, nz * 1.8) * 0.7
              + noise3D(nx * 4.2, ny * 4.2, nz * 4.2) * 0.2
              + noise3D(nx * 9.0, ny * 9.0, nz * 9.0) * 0.1
      if (n < LAND_THRESHOLD || Math.abs(ny) < 5 / R_C) continue

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

  // 階段: 囲いの内側、凹みの奥の柵に背面を付けて置く。幅・奥行きとも杭1区間（3倍で3.6m）、6段で高さ約2.25m（3倍時）
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
    const line = fenceMesh.children[0]
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
  const MARGIN = 0.15                                                           // 柵の際の余白（ローカル単位、3倍で約0.45m）
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
  im.castShadow    = true
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
  scale: 2.5, lift: 0.2, seed: 'grass', emissive: 0.1,
}
const GRASS_KIND_2 = {   // 2dgrass2：手描きの幅広い葉の房（旧 field01 の場所）
  geometry: createGrass2TuftGeometry, material: createGrass2Material,
  scale: 2.5, lift: 0.0, seed: 'grass2', emissive: 0, density: 2 / 3 * 0.8,
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
    const pp = (90 - plat) * DEG, pt = (plon + 180) * DEG
    const x = Math.sin(pp) * Math.cos(pt), y = Math.cos(pp), z = Math.sin(pp) * Math.sin(pt)
    return noise3D(x*1.8,y*1.8,z*1.8)*0.7 + noise3D(x*4.2,y*4.2,z*4.2)*0.2 + noise3D(x*9.0,y*9.0,z*9.0)*0.1
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
      const n = noise3D(nx * 1.8, ny * 1.8, nz * 1.8) * 0.7
              + noise3D(nx * 4.2, ny * 4.2, nz * 4.2) * 0.2
              + noise3D(nx * 9.0, ny * 9.0, nz * 9.0) * 0.1
      if (n < LAND_THRESHOLD) continue

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
  im.castShadow    = true
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

