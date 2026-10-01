import * as THREE from 'three'
import { vJoy, initJoysticks } from './joystick.js'
import { createCompass, createVethIndicator } from './hud.js'
import { createCoccolith } from './coccolith.js'
import { createVeth } from './veth.js'
import { createCloud1, createFlatCloud } from './cloud1.js'
import { R_C, LAND_LIFT, ORBIT } from './constants.js'
import { createKummo } from '../my-3d-parts/parts/kummo.jsx'
import { createGummo } from '../my-3d-parts/parts/gummo.jsx'
import { createSabchan } from '../my-3d-parts/parts/sabchan.jsx'

// ============================================================
//  LMF — Layout Master File
//  単位: 1 unit = 1m
// ============================================================

// --- レンダラー ---------------------------------------------
const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type    = THREE.PCFSoftShadowMap

// --- シーン -------------------------------------------------
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x00000a)
scene.fog = new THREE.Fog(0x000510, 99999, 100000)  // 初期は無効

// --- カメラ -------------------------------------------------
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 50000)

// --- 光源 ---------------------------------------------------
// 太陽: 真横 (+X方向) 固定
const sun = new THREE.DirectionalLight(0xfff5e0, 3.0)
sun.position.set(20000, 0, 0)
sun.castShadow = true
sun.shadow.mapSize.width  = 2048
sun.shadow.mapSize.height = 2048
sun.shadow.camera.near   = 19600
sun.shadow.camera.far    = 20400
sun.shadow.camera.left   = -420
sun.shadow.camera.right  =  420
sun.shadow.camera.top    =  420
sun.shadow.camera.bottom = -420
sun.shadow.intensity     = 0.2
scene.add(sun)
scene.add(new THREE.AmbientLight(0x334455, 1.0))


// --- 天体 ---------------------------------------------------
const { group: coccolith, terrainMeshes, oceanMesh } = createCoccolith()
terrainMeshes.forEach(m => m.receiveShadow = true)
oceanMesh.receiveShadow = true
scene.add(coccolith)

const VETH_ORBIT_PERIOD = 2 * 3600            // 2時間（秒）
const vethOrbitAxis = new THREE.Vector3(0.2, 1, 0).normalize()

const vethOrbitGroup = new THREE.Group()
scene.add(vethOrbitGroup)

const veth = createVeth()
veth.position.set(ORBIT, 0, 0)
vethOrbitGroup.add(veth)

// --- sabちゃん --------------------------------------------------
// 1 unit = 0.1m スケール系のモデルを coccolith (1 unit = 1m) に合わせる
// 足先 local y = -5.72 → scale 0.2 で -1.144m → 地表に接地
const SAB_SCALE       = 0.2
const SAB_FOOT_OFFSET = 5.72 * SAB_SCALE   // 足先→グループ原点（頭部中心）距離

const sabchan = createSabchan(scene)
sabchan.group.scale.setScalar(SAB_SCALE)
// sabchan.group の子のうち Group 型 = headGroup（耳・パッド含む）
const _sabHeadGroup = sabchan.group.children.find(c => c.isGroup) ?? null

// --- sabちゃんライト ----------------------------------------------
// 後頭部の light_icon をクリック（または L キー）でサーチライト ON/OFF
// アイコンは OFF 時に発光し、ON 時は消灯（グレー表示）
// アイコンは小さく押しにくいので、頭部全体（3人称カメラからは後頭部が見える）を判定対象にする
// headGroup 内の座標は sabちゃんモデル単位（1 unit = 0.1m × 1.54 × SAB_SCALE）
const SAB_UNIT        = 1.54 * SAB_SCALE            // モデル1unit → m
const SAB_LIGHT_COLOR = 0xcfe6ff                    // 青白
const SAB_LIGHT_INT   = 180                         // ON 時の強さ
const SAB_LIGHT_ANGLE = 0.6                         // 照射半角 (rad)
const SAB_LIGHT_TILT  = 0.14                        // 前方やや下向き (rad)
const SAB_ICON_GLOW   = 0x66c8d8                    // OFF 時のアイコン発光色
const SAB_ICON_GRAY   = 0.55                        // ON 時のグレーマークの明るさ（輝度に掛ける）
const SAB_BEAM_LEN    = 20                          // 光の筋の長さ (m)

// 点灯中は消灯したグレーのマークにする（グレー版は元画像からキャンバスで生成）
const lightIconTex     = new THREE.Texture()
const lightIconGrayTex = new THREE.Texture()
for (const t of [lightIconTex, lightIconGrayTex]) t.colorSpace = THREE.SRGBColorSpace
new THREE.ImageLoader().load(`${import.meta.env.BASE_URL}ui/light_icon.png`, img => {
  lightIconTex.image = img
  lightIconTex.needsUpdate = true
  const cv = document.createElement('canvas')
  cv.width = img.width; cv.height = img.height
  const ctx = cv.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, cv.width, cv.height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) * SAB_ICON_GRAY
    px[i] = px[i + 1] = px[i + 2] = g
  }
  ctx.putImageData(data, 0, 0)
  lightIconGrayTex.image = cv
  lightIconGrayTex.needsUpdate = true
})
const lightIconMat = new THREE.MeshLambertMaterial({
  map: lightIconTex, emissiveMap: lightIconTex, emissive: SAB_ICON_GLOW,
  transparent: true, alphaTest: 0.1,
})
const lightIcon = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), lightIconMat)
lightIcon.position.set(0, 0.25, -2.45)   // 後頭部表面（head 半径 z ≈ 2.31）のすぐ外
lightIcon.rotation.y = Math.PI          // 後ろ向き
_sabHeadGroup?.add(lightIcon)

// センサー位置から前方へ照らす。シェーダ再コンパイルを避けるため常に存在させ intensity で切替
const sabLight = new THREE.SpotLight(SAB_LIGHT_COLOR, 0, 100, SAB_LIGHT_ANGLE, 0.6, 1.2)
sabLight.position.set(0, 0.3, 2.4)
sabLight.target.position.set(0, 0.3 - Math.sin(SAB_LIGHT_TILT) * 40, 2.4 + Math.cos(SAB_LIGHT_TILT) * 40)
_sabHeadGroup?.add(sabLight, sabLight.target)

// 光の筋: 先端→奥でフェードする加算合成コーン
const beamH = SAB_BEAM_LEN / SAB_UNIT
const beamGeo = new THREE.ConeGeometry(Math.tan(SAB_LIGHT_ANGLE) * beamH, beamH, 32, 8, true)
beamGeo.translate(0, -beamH / 2, 0)     // 先端を原点へ
{
  const pos = beamGeo.attributes.position
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color(SAB_LIGHT_COLOR)
  for (let i = 0; i < pos.count; i++) {
    const f = Math.pow(1 - (-pos.getY(i) / beamH), 2)
    col.set([c.r * f, c.g * f, c.b * f], i * 3)
  }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
}
beamGeo.rotateX(-Math.PI / 2)           // 開き方向を +Z（前方）へ
const sabBeam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0.22,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
}))
sabBeam.position.copy(sabLight.position)
sabBeam.rotation.x = SAB_LIGHT_TILT
sabBeam.visible = false
_sabHeadGroup?.add(sabBeam)

let sabLightOn = false
function toggleSabLight() {
  sabLightOn = !sabLightOn
  sabLight.intensity = sabLightOn ? SAB_LIGHT_INT : 0
  sabBeam.visible    = sabLightOn
  lightIconMat.map         = sabLightOn ? lightIconGrayTex : lightIconTex
  lightIconMat.emissiveMap = lightIconMat.map
  lightIconMat.emissive.set(sabLightOn ? 0x000000 : SAB_ICON_GLOW)
}

const _pointer = new THREE.Vector2()
const _iconRay = new THREE.Raycaster()
function hitLightIcon(e) {
  if (!_sabHeadGroup) return false
  _pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
  _iconRay.setFromCamera(_pointer, camera)
  return _iconRay.intersectObject(_sabHeadGroup, true).some(h => h.object !== sabBeam)
}
canvas.addEventListener('pointerdown', e => { if (hitLightIcon(e)) toggleSabLight() })
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') canvas.style.cursor = hitLightIcon(e) ? 'pointer' : ''
})

// --- 3人称カメラ定数 -------------------------------------------
const CAM_DIST       = 8     // sabちゃんからの距離 (m)
const CAM_BASE_ANGLE = 0.35  // 水平面からの基本仰角 (rad)
const CAM_SAB_SCREEN_Y = -0.5   // sabちゃんを置く画面上の高さ（NDC: -1=下端, 0=中央）→ 下から1/4
// 注視点にsabちゃんを置いたまま、カメラをこの角度だけ見上げると sabちゃんが CAM_SAB_SCREEN_Y に来る
const CAM_LIFT = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * -CAM_SAB_SCREEN_Y)

// --- 雲 -------------------------------------------------------
// 惑星中心から (0, CLOUD_H, 0) に配置し、傾いた軸で周回
// rotateOnWorldAxis で子の向きも一緒に回転 → 常に惑星面法線が上を向く
const CLOUD_H = R_C + LAND_LIFT + 15
const cloudOrbitAxis = new THREE.Vector3(0.3, 1, 0.1).normalize()

const cloudGroup = new THREE.Group()
const cloud = createCloud1()
cloud.scale.setScalar(6)
cloud.position.set(0, CLOUD_H, 0)
cloudGroup.add(cloud)
cloudGroup.rotateOnWorldAxis(cloudOrbitAxis, Math.random() * Math.PI * 2)
scene.add(cloudGroup)

// --- 平たい流れ雲 × 6 ----------------------------------------
const FLAT_CLOUD_H = R_C + LAND_LIFT + 10
const flatCloudDefs = [
  { axis: new THREE.Vector3( 0.5,  1, -0.3).normalize(), speed: 0.000625 },
  { axis: new THREE.Vector3(-0.4,  1,  0.2).normalize(), speed: 0.000700 },
  { axis: new THREE.Vector3( 0.2,  1,  0.6).normalize(), speed: 0.000550 },
  { axis: new THREE.Vector3(-0.3,  1, -0.5).normalize(), speed: 0.000750 },
  { axis: new THREE.Vector3( 0.7,  1,  0.1).normalize(), speed: 0.000650 },
  { axis: new THREE.Vector3(-0.6,  1, -0.2).normalize(), speed: 0.000600 },
]
const flatCloudGroups = flatCloudDefs.map(({ axis, speed }, i) => {
  const grp = new THREE.Group()
  const fc = createFlatCloud(i + 10)
  fc.scale.set(15, 5, 15)
  fc.position.set(0, FLAT_CLOUD_H, 0)
  grp.add(fc)
  grp.rotateOnWorldAxis(axis, Math.random() * Math.PI * 2)
  scene.add(grp)
  return { grp, axis, speed }
})

// --- 青灰色の平たい雲 × 3（Y軸下方スタート）---------------------
const darkFlatCloudDefs = [
  { axis: new THREE.Vector3( 0.4,  1,  0.5).normalize(), speed: 0.000580 },
  { axis: new THREE.Vector3(-0.5,  1, -0.3).normalize(), speed: 0.000640 },
  { axis: new THREE.Vector3( 0.2,  1, -0.6).normalize(), speed: 0.000700 },
]
darkFlatCloudDefs.forEach(({ axis, speed }, i) => {
  const grp = new THREE.Group()
  const fc = createFlatCloud(20 + i, 0x9AA7BB)
  fc.scale.set(15, 5, 15)
  fc.position.set(0, -FLAT_CLOUD_H, 0)
  grp.add(fc)
  grp.rotateOnWorldAxis(axis, Math.random() * Math.PI * 2)
  scene.add(grp)
  flatCloudGroups.push({ grp, axis, speed })
})

// --- 雲生き物 (kummo × 3, gummo × 3) -------------------------
// 軌道: 球面上のランダム軸を周回、平雲と同高度・同速域
// 向き: local +X → 進行方向 (接線 = axis × 惑星法線)
//        local +Y → 惑星外向き (法線)
const CREATURE_H = FLAT_CLOUD_H

function randomSphereVec() {
  const u = Math.random() * 2 - 1
  const t = Math.random() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t))
}

const creatures = [
  createKummo, createKummo, createKummo,
  createGummo, createGummo, createGummo,
].map(factory => {
  const axis  = randomSphereVec()
  const speed = 0.000575 + Math.random() * 0.000175   // 平雲と同速域
  const angle = Math.random() * Math.PI * 2           // 惑星上ランダム初期位置
  const mesh  = factory()
  mesh.scale.setScalar(6)
  scene.add(mesh)
  return { axis, angle, speed, mesh }
})

// --- レイキャスター -----------------------------------------
const raycaster = new THREE.Raycaster()

// 地表追従: 惑星外側から中心方向にレイを飛ばし、
// 最初のヒット点（= 最も外側の地表面）の惑星中心からの距離 +1m にカメラを置く。
// 中心→外向きだと FrontSide マテリアルのバックフェイスカリングに当たるため外→内方向で飛ばす。
function getGroundHeight(dir) {
  const origin = dir.clone().multiplyScalar((R_C + LAND_LIFT) * 1.5)
  raycaster.set(origin, dir.clone().negate())
  const hits = raycaster.intersectObjects(terrainMeshes, false)
  if (hits.length === 0) return R_C + 1
  return hits[0].point.length() + 1
}

// --- プレイヤー状態 -----------------------------------------
// pDir: 足元から頭方向（球面上の法線）
// pFwd: 進行方向
let pDir  = new THREE.Vector3(0, 1, 0)
let pFwd  = new THREE.Vector3(1, 0, 0)
let pitch = 0                          // 視点ピッチ (rad)
// pitch をクランプする範囲を camAngle が実際に動く範囲と一致させる
// → デッドゾーン（押しても画面が動かない区間）をなくす
const PITCH_MAX =  Math.PI * 0.45 - CAM_BASE_ANGLE   //  ≈ +1.064 rad
const PITCH_MIN = 0.05            - CAM_BASE_ANGLE   //  ≈ -0.300 rad

// --- 俯瞰モード ---------------------------------------------
let overviewMode = false
const OVERVIEW_DIST = (R_C + LAND_LIFT) * 2.5  // 惑星全体が収まる距離

// 俯瞰カメラの水平回転・垂直回転（ラジアン）
let ovYaw   = 0
let ovPitch = Math.PI * 0.25   // 初期は斜め上から

// --- 入力 ---------------------------------------------------
const keys = {}

window.addEventListener('keydown', e => {
  if (e.code === 'Tab') {
    overviewMode = !overviewMode
    const tabBtn = document.getElementById('tab-btn')
    if (tabBtn) {
      tabBtn.classList.toggle('overview', overviewMode)
      tabBtn.setAttribute('aria-label', overviewMode ? '主観に戻る' : '俯瞰')
    }

    if (!overviewMode) {
      // 🔴 が指していた地表点（カメラ→原点方向のレイ）を新しい立ち位置にする
      const rayDir = camera.position.clone().negate().normalize()
      raycaster.set(camera.position.clone(), rayDir)
      const hits = raycaster.intersectObjects(terrainMeshes, false)
      if (hits.length > 0) {
        pDir = hits[0].point.clone().normalize()
        // pFwd を新しい pDir に直交する成分に投影して更新
        pFwd.addScaledVector(pDir, -pFwd.dot(pDir))
        if (pFwd.lengthSq() < 1e-6) {
          // pFwd と pDir がほぼ平行な場合は別軸から作り直す
          const alt = Math.abs(pDir.x) < 0.9
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0)
          pFwd = alt.addScaledVector(pDir, -alt.dot(pDir))
        }
        pFwd.normalize()
        pitch = 0
      }
    }
    e.preventDefault()
    return
  }
  if (e.code === 'KeyL' && !e.repeat) toggleSabLight()
  keys[e.code] = true
  e.preventDefault()
})
window.addEventListener('keyup', e => { keys[e.code] = false })

initJoysticks()

// --- HUD ----------------------------------------------------
const { drawCompass }       = createCompass(document.getElementById('compass'))
const { drawVethIndicator } = createVethIndicator(document.getElementById('veth-ind'))
const areaEl   = document.getElementById('area-code')
const latlonEl = document.getElementById('latlon')

// pDir（正規化済み球面法線）からグリッドエリアコードを返す
// 緯度帯 A〜J（南→北）、経度帯 1〜10（西→東）
function getAreaCode(dir) {
  const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI
  let theta = Math.atan2(dir.z, dir.x)
  if (theta < 0) theta += Math.PI * 2
  const lon = theta * 180 / Math.PI - 180  // -180〜180
  const latIdx = Math.min(9, Math.floor((lat + 90) / 18))
  const lonIdx = Math.min(9, Math.floor((lon + 180) / 36))
  return String.fromCharCode(0x41 + latIdx) + (lonIdx + 1)
}

// --- リサイズ ------------------------------------------------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
})

// --- メインループ --------------------------------------------
const SPEED     = 20      // 移動速度 (m/s)
const TURN_SPD  = 1.5     // 旋回速度 (rad/s)
const PITCH_SPD = 1.2     // ピッチ速度 (rad/s)
const OV_SPD    = 1.2     // 俯瞰回転速度 (rad/s)
const OV_PITCH_MIN = -Math.PI * 0.49  // 南半球まで回せるよう負値に
const OV_PITCH_MAX =  Math.PI * 0.49
// ハンドル入力の立ち上がり: 入力開始時は start 倍から、time 秒かけて等倍へ
const JOY_RAMP_YAW   = { start: 0.3,  time: 0.4 }
const JOY_RAMP_PITCH = { start: 0.15, time: 0.7 }  // 上下はよりゆっくり
const TARGET_FPS = 30
const FRAME_MS   = 1000 / TARGET_FPS
let prev = performance.now()
let joyYawHeld = 0, joyPitchHeld = 0  // ハンドル入力の継続時間 (s)

function joyRamp(ramp, held) {
  const t = Math.min(held / ramp.time, 1)
  return ramp.start + (1 - ramp.start) * t * t * (3 - 2 * t)  // smoothstep
}

// 雲生き物アニメーション用一時変数（GC 抑制）
const _crQuat     = new THREE.Quaternion()
const _vethWorldPos = new THREE.Vector3()
const _spinQuat   = new THREE.Quaternion()
const _spinAxis   = new THREE.Vector3(0, 1, 0)

// 霧エフェクト用カラー定数
const _fogColorNormal = new THREE.Color(0x000510)
const _fogColorPolar  = new THREE.Color(0x9CB8E9)
const _bgColorNormal  = new THREE.Color(0x00000a)
const _fogColorEdge   = new THREE.Color(0x453168)  // 0〜70m
const _fogColorMid    = new THREE.Color(0xca8789)  // 70〜100m
const _activeFogColor = new THREE.Color()
const _FOG_RAMP1 = Math.sin(70  / R_C)  // 70m 境界
const _FOG_RAMP2 = Math.sin(100 / R_C)  // 100m 境界
const _crPos  = new THREE.Vector3()
const _crUp   = new THREE.Vector3()
const _crFwd  = new THREE.Vector3()
const _crZ    = new THREE.Vector3()
const _crMat  = new THREE.Matrix4()

function animate() {
  requestAnimationFrame(animate)
  const now = performance.now()
  if (now - prev < FRAME_MS) return
  const dt  = Math.min((now - prev) / 1000, 0.05)
  prev = now

  // veth 自転 + 公転（2時間で1周）
  veth.rotation.y += 0.003
  vethOrbitGroup.rotateOnWorldAxis(vethOrbitAxis, (Math.PI * 2 / VETH_ORBIT_PERIOD) * dt)

  // 海面球: veth方向へ1mオフセット（潮汐効果）
  veth.getWorldPosition(_vethWorldPos)
  oceanMesh.position.copy(_vethWorldPos).normalize().multiplyScalar(1)

  // 雲: 地表上を周回（veth 自転と同速）
  cloudGroup.rotateOnWorldAxis(cloudOrbitAxis, 0.00075)
  for (const { grp, axis, speed } of flatCloudGroups) {
    grp.rotateOnWorldAxis(axis, speed)
  }

  // 雲生き物: 軌道更新 + 向き更新（local +X → 進行方向）
  for (const c of creatures) {
    c.angle += c.speed
    _crQuat.setFromAxisAngle(c.axis, c.angle)
    _crPos.set(0, CREATURE_H, 0).applyQuaternion(_crQuat)
    c.mesh.position.copy(_crPos)
    _crUp.copy(_crPos).normalize()
    _crFwd.crossVectors(c.axis, _crUp).normalize()  // 接線 = 進行方向
    _crZ.crossVectors(_crUp, _crFwd)                // 右手系: Y×Z=X → crUp×crFwd
    _crMat.makeBasis(_crZ, _crUp, _crFwd)           // +X=横, +Y=惑星法線, +Z=進行方向
    c.mesh.setRotationFromMatrix(_crMat)
  }

  // ハンドル入力（入力し始めはゆっくり）
  joyYawHeld   = Math.abs(vJoy.rx) > 0.05 ? joyYawHeld   + dt : 0
  joyPitchHeld = Math.abs(vJoy.ry) > 0.05 ? joyPitchHeld + dt : 0
  const joyYaw   = vJoy.rx * joyRamp(JOY_RAMP_YAW,   joyYawHeld)
  const joyPitch = vJoy.ry * joyRamp(JOY_RAMP_PITCH, joyPitchHeld)

  if (overviewMode) {
    // --- 俯瞰モード: A/D/Q/E で水平回転、↑↓ で仰俯角 ---
    const ovTurnIn  = (keys['KeyA'] || keys['KeyQ'] ? 1 : 0) - (keys['KeyD'] || keys['KeyE'] ? 1 : 0) - joyYaw
    const ovPitchIn = (keys['ArrowUp'] ? 1 : 0) - (keys['ArrowDown'] ? 1 : 0) - joyPitch
    if (Math.abs(ovTurnIn)  > 0.01) ovYaw   += OV_SPD * dt * Math.max(-1, Math.min(1, ovTurnIn))
    if (Math.abs(ovPitchIn) > 0.01) ovPitch  = Math.max(OV_PITCH_MIN, Math.min(OV_PITCH_MAX, ovPitch + OV_SPD * dt * Math.max(-1, Math.min(1, ovPitchIn))))

    const cx = OVERVIEW_DIST * Math.cos(ovPitch) * Math.sin(ovYaw)
    const cy = OVERVIEW_DIST * Math.sin(ovPitch)
    const cz = OVERVIEW_DIST * Math.cos(ovPitch) * Math.cos(ovYaw)
    camera.position.set(cx, cy, cz)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)

    // カメラ→惑星中心レイの地表ヒット点に sabちゃんを配置
    const ovRayDir = new THREE.Vector3(-cx, -cy, -cz).normalize()
    raycaster.set(new THREE.Vector3(cx, cy, cz), ovRayDir)
    const ovHits = raycaster.intersectObjects(terrainMeshes, false)
    if (ovHits.length > 0) {
      const hp = ovHits[0].point
      const hn = hp.clone().normalize()
      let sf = pFwd.clone()
      sf.addScaledVector(hn, -sf.dot(hn))
      if (sf.lengthSq() < 1e-6) {
        sf = new THREE.Vector3(1, 0, 0)
        sf.addScaledVector(hn, -sf.dot(hn))
      }
      sf.normalize()
      const sr = new THREE.Vector3().crossVectors(hn, sf)
      sabchan.group.setRotationFromMatrix(new THREE.Matrix4().makeBasis(sr, hn, sf))
      sabchan.group.position.copy(hn.multiplyScalar(hp.length() + SAB_FOOT_OFFSET))
    }
  } else {
    // --- 通常モード: sabちゃん追従3人称 ---
    const da = (SPEED / R_C) * dt

    const turnIn = (keys['KeyQ'] ? 1 : 0) - (keys['KeyE'] ? 1 : 0) - joyYaw
    if (Math.abs(turnIn) > 0.01) { pFwd.applyAxisAngle(pDir, TURN_SPD * dt * Math.max(-1, Math.min(1, turnIn))); pFwd.normalize() }

    const axisWS = new THREE.Vector3().crossVectors(pDir, pFwd)
    const fbIn = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0) - vJoy.ly
    if (Math.abs(fbIn) > 0.01) { pDir.applyAxisAngle(axisWS, da * Math.max(-1, Math.min(1, fbIn))); pDir.normalize() }
    const lrIn = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0) + vJoy.lx
    if (Math.abs(lrIn) > 0.01) { pDir.applyAxisAngle(pFwd,   da * Math.max(-1, Math.min(1, lrIn))); pDir.normalize() }

    pFwd.addScaledVector(pDir, -pFwd.dot(pDir))
    pFwd.normalize()

    // ↑↓ / 右ジョイスティック Y でカメラ仰角を操作
    const pitchIn = (keys['ArrowUp'] ? 1 : 0) - (keys['ArrowDown'] ? 1 : 0) - joyPitch
    if (Math.abs(pitchIn) > 0.01) pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + PITCH_SPD * dt * Math.max(-1, Math.min(1, pitchIn))))

    // --- sabちゃん配置 ---
    // local Y → pDir (惑星法線=上)、local Z → pFwd (進行方向=前)
    const sabRight = new THREE.Vector3().crossVectors(pDir, pFwd)
    const rotM = new THREE.Matrix4().makeBasis(sabRight, pDir, pFwd)
    sabchan.group.setRotationFromMatrix(rotM)
    // 2分に1回、1秒かけてy軸360°スピン
    const spinPhase = (now / 1000) % 120
    if (spinPhase < 1.0) {
      _spinQuat.setFromAxisAngle(_spinAxis, spinPhase * Math.PI * 2)
      sabchan.group.quaternion.multiply(_spinQuat)
    }

    const groundH = getGroundHeight(pDir)
    const sabPos  = pDir.clone().multiplyScalar(groundH + SAB_FOOT_OFFSET)
    const floatOffset = Math.sin(now * 0.00035) * 0.2
    sabchan.group.position.copy(pDir.clone().multiplyScalar(groundH + SAB_FOOT_OFFSET + floatOffset))

    // 頭の揺れアニメ
    const t = now / 1000
    if (_sabHeadGroup) {
      _sabHeadGroup.rotation.z = Math.sin(t * 0.51) * 0.06
      _sabHeadGroup.rotation.x = Math.sin(t * 0.37) * 0.12
    }
    const pulse = 1.0 + Math.sin(t * 2.8) * 0.35
    if (sabchan.nose)   sabchan.nose.scale.setScalar(pulse)
    if (sabchan.sensor) sabchan.sensor.scale.setScalar(pulse)

    // --- 3人称カメラ ---
    // pitch を仰角オフセットとして使用（上限・下限クランプ）
    const camAngle = Math.max(0.05, Math.min(Math.PI * 0.45, CAM_BASE_ANGLE + pitch))
    const camOffset = pFwd.clone().multiplyScalar(-CAM_DIST * Math.cos(camAngle))
      .addScaledVector(pDir, CAM_DIST * Math.sin(camAngle))
    camera.position.copy(sabPos.clone().add(camOffset))
    camera.up.copy(pDir)
    // 胴体あたり（頭部中心から足方向へ少し）を注視
    const lookTarget = sabPos.clone().addScaledVector(pDir, -SAB_FOOT_OFFSET * 0.4)
    camera.lookAt(lookTarget)
    camera.rotateX(CAM_LIFT)   // 見上げて sabちゃんを画面下寄りに
  }

  // --- 北極霧（y軸頂点から20m以内で発生、35mまでフェード）---
  const polarT = overviewMode ? 0 : Math.max(0, pDir.x)
  // 3色グラデーション: #522E8E(0m) → #ca8789(70m) → #9CB8E9(100m〜)
  if (polarT <= 0) {
    _activeFogColor.copy(_fogColorEdge)
  } else if (polarT <= _FOG_RAMP1) {
    _activeFogColor.copy(_fogColorEdge).lerp(_fogColorMid, polarT / _FOG_RAMP1)
  } else {
    _activeFogColor.copy(_fogColorMid).lerp(_fogColorPolar, Math.min(1, (polarT - _FOG_RAMP1) / (_FOG_RAMP2 - _FOG_RAMP1)))
  }
  scene.fog.near = THREE.MathUtils.lerp(99999, 250, polarT)
  scene.fog.far  = THREE.MathUtils.lerp(100000, 700, polarT)
  scene.fog.color.copy(_fogColorNormal).lerp(_activeFogColor, polarT)
  scene.background.copy(_bgColorNormal).lerp(_activeFogColor, polarT)

  // --- HUD ---
  const hudCamPos = overviewMode
    ? camera.position.clone()
    : pDir.clone().multiplyScalar(R_C + 1)
  drawCompass(pDir, pFwd)
  veth.getWorldPosition(_vethWorldPos)
  drawVethIndicator(hudCamPos, pDir, pFwd, _vethWorldPos)
  if (overviewMode) {
    areaEl.textContent   = ''
    latlonEl.textContent = ''
  } else {
    const lat = Math.asin(Math.max(-1, Math.min(1, pDir.y))) * 180 / Math.PI
    let theta = Math.atan2(pDir.z, pDir.x)
    if (theta < 0) theta += Math.PI * 2
    const lon = theta * 180 / Math.PI - 180
    areaEl.textContent   = getAreaCode(pDir)
    latlonEl.textContent = `  |  lat: ${lat.toFixed(1)}°  lon: ${lon.toFixed(1)}°`
  }

  renderer.render(scene, camera)
}

animate()
