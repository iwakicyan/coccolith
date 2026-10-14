import * as THREE from 'three'

// ============================================================
//  8 方向スプライト — ドット絵 1 枚の板を立て、見る角度で絵を差し替える（昔の 3D ゲームのキャラクターの出し方）
//  絵のデータ（pixelArt/spriteTest.js の形）: { palette, width, height, views: { front, frontRight, right, backRight, back, top } }
//  側面: 板は縦軸まわりだけ回って常にカメラの方を向く。オブジェクトの前の向きとカメラのいる方向の角度を 45° ごとに区切って絵を選ぶ
//        左側の 3 方向（左斜め前・左・左斜め後ろ）は右側の絵を左右反転して使う
//  天面: カメラが TOP_ENTER より高い角度から見下ろしたら、立てた板を隠して地面と平行な板に top の絵を出す（オブジェクトの向きと一緒に回る）
//  絵は 6 枚を 1 枚のテクスチャに並べ、板の UV を差し替えて切り替える
//  板の法線はどちらも「上」に向け、向きを変えても明るさが変わらず、その場所の地面と同じように太陽で照らされるようにする
// ============================================================

const VIEWS = ['front', 'frontRight', 'right', 'backRight', 'back', 'top']
const COLS  = 3
// 角度の区切り（カメラが 45° ごとの中心からこれ以上離れたら隣の絵へ。22.5° より大きくして境目でちらつかないようにする）
const SECTOR_HOLD = THREE.MathUtils.degToRad(22.5 + 4)
const TOP_ENTER = THREE.MathUtils.degToRad(60)   // 見下ろす角度がこれを超えたら天面に
const TOP_LEAVE = THREE.MathUtils.degToRad(55)   // 天面からこれより下がったら側面に戻す
const SELF_LIGHT = 0.4   // 日の当たらないところでも絵が見えるよう、絵の色をこの割合だけ自分で光らせる
// 側面の向き番号（カメラが前から左回りに 45° ずつ。負は右側）→ 使う絵と左右反転
const SECTOR_VIEW = {
  0: ['front', false], [-1]: ['frontRight', false], [-2]: ['right', false], [-3]: ['backRight', false],
  1: ['frontRight', true], 2: ['right', true], 3: ['backRight', true], 4: ['back', false], [-4]: ['back', false],
}

// 絵 1 枚ぶんのテクスチャとマテリアル（同じ絵のスプライトはこれを共有する）
function buildSheet(art) {
  const { palette, width: w, height: h, views } = art
  // 絵と絵の間は 1 px 空けて、隣の絵のドットがにじまないようにする
  const cv = document.createElement('canvas')
  cv.width = COLS * (w + 1)
  cv.height = Math.ceil(VIEWS.length / COLS) * (h + 1)
  const ctx = cv.getContext('2d')
  const cells = {}
  VIEWS.forEach((name, i) => {
    const ox = (i % COLS) * (w + 1), oy = Math.floor(i / COLS) * (h + 1)
    views[name].forEach((row, y) => row.forEach((n, x) => {
      if (!palette[n]) return
      ctx.fillStyle = palette[n]
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }))
    // UV（テクスチャは上下反転して貼られるので v は下から）
    cells[name] = { u0: ox / cv.width, u1: (ox + w) / cv.width, v0: 1 - (oy + h) / cv.height, v1: 1 - oy / cv.height }
  })
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  const mat = new THREE.MeshLambertMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: SELF_LIGHT, alphaTest: 0.5, side: THREE.DoubleSide,
  })
  return { mat, cells, aspect: w / h }
}

// 板の UV を絵 cell に合わせる（mirror: 左右反転）。PlaneGeometry の頂点は 左上・右上・左下・右下 の順
function setCell(geo, cell, mirror) {
  const a = mirror ? cell.u1 : cell.u0, b = mirror ? cell.u0 : cell.u1
  const uv = geo.attributes.uv
  uv.setXY(0, a, cell.v1); uv.setXY(1, b, cell.v1)
  uv.setXY(2, a, cell.v0); uv.setXY(3, b, cell.v0)
  uv.needsUpdate = true
}

function upNormals(geo, up) {
  const n = geo.attributes.normal
  for (let i = 0; i < n.count; i++) n.setXYZ(i, ...up)
}

const _cam = new THREE.Vector3()

// sheet: buildSheet の戻り値 / height: 側面の絵の高さ (m) / topLift: 天面の板を置く高さ (m)
function createSprite(sheet, height, topLift) {
  const group = new THREE.Group()   // 原点 = 足元、local Y = 上、local Z = オブジェクトの前
  const w = height * sheet.aspect

  const sideGeo = new THREE.PlaneGeometry(w, height).translate(0, height / 2, 0)
  upNormals(sideGeo, [0, 1, 0])
  const sideMesh = new THREE.Mesh(sideGeo, sheet.mat)
  group.add(sideMesh)

  // 天面: 絵の上 → 前（+Z）、絵の右 → オブジェクトの右（-X）、法線 → 上（+Y）
  const topGeo = new THREE.PlaneGeometry(w, w)
  upNormals(topGeo, [0, 0, 1])
  setCell(topGeo, sheet.cells.top, false)
  const topMesh = new THREE.Mesh(topGeo, sheet.mat)
  topMesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)))
  topMesh.position.y = topLift
  topMesh.visible = false
  group.add(topMesh)

  let sector = null, showTop = false

  // group の位置・向きを決めたあとに呼ぶ
  function face(camera) {
    group.updateMatrixWorld()
    group.worldToLocal(camera.getWorldPosition(_cam))
    const yaw  = Math.atan2(_cam.x, _cam.z)   // 0 = 前から、正 = オブジェクトの左側（+X）から
    const elev = Math.atan2(_cam.y - topLift, Math.hypot(_cam.x, _cam.z))

    showTop = showTop ? elev > TOP_LEAVE : elev > TOP_ENTER
    topMesh.visible = showTop
    sideMesh.visible = !showTop
    if (showTop) return

    sideMesh.rotation.y = yaw
    let d = Math.abs(yaw - (sector ?? 0) * Math.PI / 4)
    if (d > Math.PI) d = 2 * Math.PI - d
    if (sector === null || d > SECTOR_HOLD) {
      let s = Math.round(yaw / (Math.PI / 4))
      if (s === -4) s = 4
      if (s !== sector) {
        sector = s
        const [name, mirror] = SECTOR_VIEW[s]
        setCell(sideGeo, sheet.cells[name], mirror)
      }
    }
  }

  return { group, face }
}

// ------------------------------------------------------------
//  地面をうろうろするスプライト（歩き方は lightHeads.js と同じ。ときどき立ち止まる）
//  home のまわり homeRadius (m) より外に出たら home の方へ曲がって戻る
// ------------------------------------------------------------
const TURN_MAX    = 1.0   // 曲がる速さの上限 (rad/s)
const TURN_CHANGE = 1.0   // 曲がる速さが変わる時間のめやす (s)
const WALK_TIME   = [3, 7]   // 歩く時間 (s)
const STOP_TIME   = [2, 6]   // 立ち止まる時間 (s)
const rand = ([a, b]) => a + Math.random() * (b - a)

const _right = new THREE.Vector3()
const _axis  = new THREE.Vector3()
const _next  = new THREE.Vector3()
const _toHome = new THREE.Vector3()
const _m     = new THREE.Matrix4()

// art: 絵のデータ / count: 数 / height: 側面の絵の高さ (m) / speed: 歩く速さ (m/s) / radius: 惑星の半径 (m)
// getGround(dir): 単位ベクトル dir の地点の地面の高さ（惑星中心から m） / waterLevel: 地面がこれより低ければ海 (m)
export function createPixelSpriteWalkers({ scene, art, count, height, speed, radius, getGround, waterLevel, home, homeRadius }) {
  const sheet = buildSheet(art)
  const homeAngle = homeRadius / radius
  const walkers = []

  for (let i = 0; i < count; i++) {
    const sprite = createSprite(sheet, height, height * 0.5)
    // home のまわりで陸に当たるまで引き直す
    const dir = new THREE.Vector3()
    for (let n = 0; n < 50; n++) {
      dir.randomDirection().multiplyScalar(homeAngle * Math.random()).add(home).normalize()
      if (getGround(dir) >= waterLevel) break
    }
    const fwd = new THREE.Vector3().randomDirection()
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize()
    scene.add(sprite.group)
    walkers.push({ sprite, dir, fwd, ground: getGround(dir), turn: 0, turnTarget: 0, walking: false, timer: rand(STOP_TIME) })
  }

  function update(dt, camera) {
    const da = speed / radius * dt
    for (const w of walkers) {
      w.timer -= dt
      if (w.timer <= 0) {
        w.walking = !w.walking
        w.timer = rand(w.walking ? WALK_TIME : STOP_TIME)
      }
      if (w.walking) {
        if (Math.random() < dt / TURN_CHANGE) w.turnTarget = (Math.random() * 2 - 1) * TURN_MAX
        // home から離れすぎたら home の方へ曲がる
        if (w.dir.angleTo(home) > homeAngle) {
          _toHome.copy(home).addScaledVector(w.dir, -home.dot(w.dir))
          w.turnTarget = Math.sign(_axis.crossVectors(w.fwd, _toHome).dot(w.dir)) * TURN_MAX
        }
        w.turn += (w.turnTarget - w.turn) * Math.min(1, dt * 2)
        w.fwd.applyAxisAngle(w.dir, w.turn * dt)

        // 前へ進む。海なら進まずに後ろ寄りへ向きを変える
        _axis.crossVectors(w.dir, w.fwd).normalize()
        _next.copy(w.dir).applyAxisAngle(_axis, da).normalize()
        const ground = getGround(_next)
        if (ground < waterLevel) {
          w.fwd.applyAxisAngle(w.dir, Math.PI * (0.6 + Math.random() * 0.8))
        } else {
          w.dir.copy(_next)
          w.ground = ground
        }
        w.fwd.addScaledVector(w.dir, -w.fwd.dot(w.dir)).normalize()
      }

      // 置く: local Y = 上、local Z = 前、原点 = 足元
      const g = w.sprite.group
      g.setRotationFromMatrix(_m.makeBasis(_right.crossVectors(w.dir, w.fwd), w.dir, w.fwd))
      g.position.copy(w.dir).multiplyScalar(w.ground)
      w.sprite.face(camera)
    }
  }

  return { update }
}
