import * as THREE from 'three'

// ============================================================
//  8 方向スプライト — ドット絵 1 枚の板を立て、見る角度で絵を差し替える（昔の 3D ゲームのキャラクターの出し方）
//  絵のデータ（pixelArt/sprites/sinkichi.js の形。8sprite の txt からは scripts/import-sprite.mjs で書き出せる）:
//    { count, cx, drawnSide, poses: { <ポーズ名>: { fps, views: { front, frontSide, side, backSide, back, top } } } }
//    斜め前・斜め後ろ（frontSide / backSide）のない絵は 4 方向にして、見る角度を 90° ごとに区切る（pixelArt/sprites/satoukuma.js の形）
//    count: 何匹出すか（main.js が使う）
//    scale: 大きさの倍率（ドット 1 つの大きさにかける。なければ 1。main.js が使う）
//    views の各方向はコマの配列。コマ = { palette, width, height, grid }（ドット絵エディタの書き出しそのまま）
//    flipped(コマ) で左右反転したコマにできる（1 枚の絵を 2 コマ目に使い回すとき）
//    cx: 物体の中心の列（左から）。幅の違う絵もこの列でそろえる
//    drawnSide: 斜め前・真横・斜め後ろの絵が物体のどちら側から見た絵か（'left' / 'right'）
//    fps: コマ送りの速さ（コマが 1 枚なら要らない）
//  側面: 板は縦軸まわりだけ回って常にカメラの方を向く。オブジェクトの前の向きとカメラのいる方向の角度を 45°（4 方向なら 90°）ごとに区切って絵を選ぶ
//        反対側の 3 方向（4 方向なら真横）は描いた側の絵を左右反転して使う
//        側面の絵でいちばん下にあるドットの行を地面に合わせる
//  天面: カメラが TOP_ENTER より高い角度から見下ろしたら、立てた板を隠して地面と平行な板に top の絵を出す（オブジェクトの向きと一緒に回る）
//        top は前が画像の上、物体の右が画像の右
//  絵はすべて 1 枚のテクスチャに並べ、板の UV を差し替えて切り替える
//  板の法線はどちらも「上」に向け、向きを変えても明るさが変わらず、その場所の地面と同じように太陽で照らされるようにする
// ============================================================

const VIEWS = ['front', 'frontSide', 'side', 'backSide', 'back', 'top']
const SIDE_VIEWS = new Set(['frontSide', 'side', 'backSide'])
// 角度の区切りの余裕（カメラが区切りの中心から半分の角度よりこれだけ余計に離れたら隣の絵へ。境目でちらつかないようにする）
const SECTOR_MARGIN = THREE.MathUtils.degToRad(4)
const TOP_ENTER = THREE.MathUtils.degToRad(60)   // 見下ろす角度がこれを超えたら天面に
const TOP_LEAVE = THREE.MathUtils.degToRad(55)   // 天面からこれより下がったら側面に戻す
const SELF_LIGHT = 0.4   // 日の当たらないところでも絵が見えるよう、絵の色をこの割合だけ自分で光らせる
// 側面の向き番号（カメラが前から左回りに 45°（4 方向なら 90°）ずつ。負は右側）→ 使う絵と、物体の左側から見ているか
const SECTOR_VIEW_8 = {
  0: ['front', false], [-1]: ['frontSide', false], [-2]: ['side', false], [-3]: ['backSide', false],
  1: ['frontSide', true], 2: ['side', true], 3: ['backSide', true], 4: ['back', false], [-4]: ['back', false],
}
const SECTOR_VIEW_4 = {
  0: ['front', false], [-1]: ['side', false], 1: ['side', true], 2: ['back', false], [-2]: ['back', false],
}

export const flipped = frame => ({ ...frame, flip: !frame.flip })

// 絵 1 組ぶんのテクスチャとマテリアル（同じ絵のスプライトはこれを共有する）
function buildSheet(art) {
  const { cx, drawnSide, poses } = art
  const dirs = Object.values(poses).every(p => p.views.frontSide) ? 8 : 4
  const views = dirs === 8 ? VIEWS : ['front', 'side', 'back', 'top']
  // 同じ絵（grid）は 1 回だけ描く
  const grids = new Map()
  for (const pose of Object.values(poses)) for (const view of views) for (const f of pose.views[view]) grids.set(f.grid, f)
  const frames = [...grids.values()]
  // マスの大きさ: 中心 cx を左右の真ん中にして、どの絵もはみ出さない幅
  const cw = 2 * Math.max(...frames.map(f => Math.max(cx, f.width - cx)))
  const ch = Math.max(...frames.map(f => f.height))
  // 足元: 側面の絵でいちばん下にあるドットの行
  let foot = 0
  for (const pose of Object.values(poses)) for (const view of views) {
    if (view === 'top') continue
    for (const f of pose.views[view]) f.grid.forEach((row, y) => { if (row.some(n => f.palette[n])) foot = Math.max(foot, y) })
  }

  // 絵と絵の間は 1 px 空けて、隣の絵のドットがにじまないようにする
  const cols = Math.ceil(Math.sqrt(frames.length))
  const cv = document.createElement('canvas')
  cv.width = cols * (cw + 1)
  cv.height = Math.ceil(frames.length / cols) * (ch + 1)
  const ctx = cv.getContext('2d')
  const cellOf = new Map()
  frames.forEach((f, i) => {
    const ox = (i % cols) * (cw + 1), oy = Math.floor(i / cols) * (ch + 1)
    const dx = ox + cw / 2 - cx
    f.grid.forEach((row, y) => row.forEach((n, x) => {
      if (!f.palette[n]) return
      ctx.fillStyle = f.palette[n]
      ctx.fillRect(dx + x, oy + y, 1, 1)
    }))
    // UV（テクスチャは上下反転して貼られるので v は下から）
    cellOf.set(f.grid, { u0: ox / cv.width, u1: (ox + cw) / cv.width, v0: 1 - (oy + ch) / cv.height, v1: 1 - oy / cv.height })
  })
  // ポーズ → 方向 → コマごとの { cell, mirror }。描いた側と反対の側面は、あとで見る側に合わせてもう一度反転する
  const looks = {}
  for (const [name, pose] of Object.entries(poses)) {
    looks[name] = { fps: pose.fps ?? 0, views: {} }
    for (const view of views) looks[name].views[view] = pose.views[view].map(f => ({
      cell: cellOf.get(f.grid), mirror: !!f.flip !== (drawnSide === 'left' && SIDE_VIEWS.has(view)),
    }))
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  const mat = new THREE.MeshLambertMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: SELF_LIGHT, alphaTest: 0.5, side: THREE.DoubleSide,
  })
  return {
    mat, looks, aspect: cw / ch, footFrac: (ch - 1 - foot) / ch, cellHeight: ch,
    sectorAngle: 2 * Math.PI / dirs, sectorView: dirs === 8 ? SECTOR_VIEW_8 : SECTOR_VIEW_4,
  }
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

// sheet: buildSheet の戻り値 / height: 絵 1 マスの高さ (m) / topLift: 天面の板を置く高さ (m)
function createSprite(sheet, height, topLift) {
  const group = new THREE.Group()   // 原点 = 足元、local Y = 上、local Z = オブジェクトの前
  const w = height * sheet.aspect

  const sideGeo = new THREE.PlaneGeometry(w, height).translate(0, height * (0.5 - sheet.footFrac), 0)
  upNormals(sideGeo, [0, 1, 0])
  const sideMesh = new THREE.Mesh(sideGeo, sheet.mat)
  group.add(sideMesh)

  // 天面: 絵の上 → 前（+Z）、絵の右 → オブジェクトの右（-X）、法線 → 上（+Y）
  const topGeo = new THREE.PlaneGeometry(w, height)
  upNormals(topGeo, [0, 0, 1])
  const topMesh = new THREE.Mesh(topGeo, sheet.mat)
  topMesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)))
  topMesh.position.y = topLift
  topMesh.visible = false
  group.add(topMesh)

  const back = Math.round(Math.PI / sheet.sectorAngle)   // 真後ろの向き番号
  const hold = sheet.sectorAngle / 2 + SECTOR_MARGIN
  let sector = null, showTop = false, shown = ''

  // group の位置・向きを決めたあとに呼ぶ。pose: ポーズ名 / step: 何コマ目か（コマ数で回る）
  function face(camera, pose, step) {
    group.updateMatrixWorld()
    group.worldToLocal(camera.getWorldPosition(_cam))
    const yaw  = Math.atan2(_cam.x, _cam.z)   // 0 = 前から、正 = オブジェクトの左側（+X）から
    const elev = Math.atan2(_cam.y - topLift, Math.hypot(_cam.x, _cam.z))

    showTop = showTop ? elev > TOP_LEAVE : elev > TOP_ENTER
    topMesh.visible = showTop
    sideMesh.visible = !showTop

    if (!showTop) {
      sideMesh.rotation.y = yaw
      let d = Math.abs(yaw - (sector ?? 0) * sheet.sectorAngle)
      if (d > Math.PI) d = 2 * Math.PI - d
      if (sector === null || d > hold) {
        let s = Math.round(yaw / sheet.sectorAngle)
        if (s === -back) s = back
        sector = s
      }
    }

    const [view, fromLeft] = showTop ? ['top', false] : sheet.sectorView[sector]
    const frames = sheet.looks[pose].views[view]
    const i = step % frames.length
    const key = `${pose}/${view}/${fromLeft}/${i}`
    if (key === shown) return
    shown = key
    setCell(showTop ? topGeo : sideGeo, frames[i].cell, frames[i].mirror !== fromLeft)
  }

  return { group, face }
}

// ------------------------------------------------------------
//  地面をうろうろするスプライト（歩き方は lightHeads.js と同じ。ときどき立ち止まる）
//  歩いている間は絵の walk のポーズをコマ送りし、立ち止まったら sit のポーズにする（sit がなければ walk の 1 コマ目で止まる）
//  陸のランダムな地点に出て、行き先を決めずに歩きまわる（海に当たったら向きを変える）
// ------------------------------------------------------------
const TURN_MAX    = 1.0   // 曲がる速さの上限 (rad/s)
const TURN_CHANGE = 1.0   // 曲がる速さが変わる時間のめやす (s)
const WALK_TIME   = [3, 7]   // 歩く時間 (s)
const STOP_TIME   = [2, 6]   // 立ち止まる時間 (s)
const rand = ([a, b]) => a + Math.random() * (b - a)

const _right = new THREE.Vector3()
const _axis  = new THREE.Vector3()
const _next  = new THREE.Vector3()
const _m     = new THREE.Matrix4()

// art: 絵のデータ / count: 数 / dot: ドット 1 つの大きさ (m) / speed: 歩く速さ (m/s) / radius: 惑星の半径 (m)
// getGround(dir): 単位ベクトル dir の地点の地面の高さ（惑星中心から m） / waterLevel: 地面がこれより低ければ海 (m)
export function createPixelSpriteWalkers({ scene, art, count, dot, speed, radius, getGround, waterLevel }) {
  const sheet = buildSheet(art)
  const height = sheet.cellHeight * dot
  const restPose = sheet.looks.sit ? 'sit' : 'walk'
  const walkers = []

  for (let i = 0; i < count; i++) {
    const sprite = createSprite(sheet, height, height * 0.5)
    // 陸に当たるまで引き直す
    const dir = new THREE.Vector3()
    for (let n = 0; n < 200; n++) {
      dir.randomDirection()
      if (getGround(dir) >= waterLevel) break
    }
    const fwd = new THREE.Vector3().randomDirection()
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize()
    scene.add(sprite.group)
    walkers.push({ sprite, dir, fwd, ground: getGround(dir), turn: 0, turnTarget: 0, walking: false, timer: rand(STOP_TIME), step: 0 })
  }

  function update(dt, camera) {
    const da = speed / radius * dt
    for (const w of walkers) {
      w.timer -= dt
      if (w.timer <= 0) {
        w.walking = !w.walking
        w.timer = rand(w.walking ? WALK_TIME : STOP_TIME)
        w.step = 0
      }
      if (w.walking) {
        w.step += dt * sheet.looks.walk.fps
        if (Math.random() < dt / TURN_CHANGE) w.turnTarget = (Math.random() * 2 - 1) * TURN_MAX
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
      w.sprite.face(camera, w.walking ? 'walk' : restPose, Math.floor(w.step))
    }
  }

  return { update }
}
