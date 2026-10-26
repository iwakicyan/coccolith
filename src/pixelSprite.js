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
//  空を飛ぶもの（pixelArt/flyers/airplane.js の形。views に bottom があるもの）:
//    側面の絵を見る高さで 3 段に分ける: 見上げる（below〜）・水平（front など）・見下ろす（above〜）。どの段も 8 方向
//    側面の板はカメラを追わず、選んだ絵の角度（45° ごとの向きと、段ごとの傾き BAND_TILT）に向けたままにする
//    （カメラを動かしても絵が一緒に回って見えないよう、絵が変わるまで機体と一緒に止まっている）。真下から見上げたら bottom の絵（前が画像の上、見上げたまま見える向き）を地面と平行な板に出す
//    絵はマスの上下左右のまん中にそろえ、物体の中心を板のまん中にする（cx は使わない）
//  板の法線はどちらも「上」に向け、向きを変えても明るさが変わらず、その場所の地面と同じように太陽で照らされるようにする
// ============================================================

const VIEWS = ['front', 'frontSide', 'side', 'backSide', 'back', 'top']
const isSideView = view => /side$/i.test(view)   // 斜め前・真横・斜め後ろ（段つきの belowSide なども）
// 空を飛ぶものの段（-1: 見上げる / 0: 水平 / 1: 見下ろす）→ 絵の名前
const BANDS = { [-1]: 'below', 0: '', 1: 'above' }
const bandView = (band, view) => BANDS[band] ? BANDS[band] + view[0].toUpperCase() + view.slice(1) : view
// 角度の区切りの余裕（カメラが区切りの中心から半分の角度よりこれだけ余計に離れたら隣の絵へ。境目でちらつかないようにする）
const SECTOR_MARGIN = THREE.MathUtils.degToRad(4)
const TOP_ENTER = THREE.MathUtils.degToRad(60)   // 見下ろす角度がこれを超えたら天面に
const TOP_LEAVE = THREE.MathUtils.degToRad(55)   // 天面からこれより下がったら側面に戻す
const FLY_FLAT_ENTER = THREE.MathUtils.degToRad(45)   // 空を飛ぶもの: 見上げる・見下ろす角度がこれを超えたら真下・天面の絵に（歩くものより広く）
const FLY_FLAT_LEAVE = THREE.MathUtils.degToRad(40)   // 真下・天面からこれより浅くなったら側面に戻す
const BAND_ENTER = THREE.MathUtils.degToRad(22)  // 空を飛ぶもの: 見上げる・見下ろす角度がこれを超えたら下方・上からの絵に
const BAND_LEAVE = THREE.MathUtils.degToRad(16)  // これより水平に近づいたら水平の絵に戻す
const BAND_TILT  = THREE.MathUtils.degToRad(33)  // 下方・上からの絵の板を傾ける角度（その段 22°〜45° のまん中あたり）
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
  const { drawnSide, poses } = art
  const flying = Object.values(poses).every(p => p.views.bottom)
  const dirs = Object.values(poses).every(p => p.views.frontSide) ? 8 : 4
  const views = flying ? Object.keys(Object.values(poses)[0].views) : dirs === 8 ? VIEWS : ['front', 'side', 'back', 'top']
  const cxOf = f => flying ? Math.floor(f.width / 2) : art.cx
  // 同じ絵（grid）は 1 回だけ描く
  const grids = new Map()
  for (const pose of Object.values(poses)) for (const view of views) for (const f of pose.views[view]) grids.set(f.grid, f)
  const frames = [...grids.values()]
  // マスの大きさ: 中心 cx を左右の真ん中にして、どの絵もはみ出さない幅
  const cw = 2 * Math.max(...frames.map(f => Math.max(cxOf(f), f.width - cxOf(f))))
  const ch = Math.max(...frames.map(f => f.height))
  // 足元: 側面の絵でいちばん下にあるドットの行（空を飛ぶものは使わない）
  let foot = 0
  if (!flying) for (const pose of Object.values(poses)) for (const view of views) {
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
    const dx = ox + cw / 2 - cxOf(f)
    const dy = oy + (flying ? Math.floor((ch - f.height) / 2) : 0)
    f.grid.forEach((row, y) => row.forEach((n, x) => {
      if (!f.palette[n]) return
      ctx.fillStyle = f.palette[n]
      ctx.fillRect(dx + x, dy + y, 1, 1)
    }))
    // UV（テクスチャは上下反転して貼られるので v は下から）
    cellOf.set(f.grid, { u0: ox / cv.width, u1: (ox + cw) / cv.width, v0: 1 - (oy + ch) / cv.height, v1: 1 - oy / cv.height })
  })
  // ポーズ → 方向 → コマごとの { cell, mirror }。描いた側と反対の側面は、あとで見る側に合わせてもう一度反転する
  const looks = {}
  for (const [name, pose] of Object.entries(poses)) {
    looks[name] = { fps: pose.fps ?? 0, views: {} }
    for (const view of views) looks[name].views[view] = pose.views[view].map(f => ({
      cell: cellOf.get(f.grid), mirror: !!f.flip !== (drawnSide === 'left' && isSideView(view)),
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
    mat, looks, flying, aspect: cw / ch, footFrac: flying ? 0.5 : (ch - 1 - foot) / ch, cellHeight: ch,
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
  const group = new THREE.Group()   // 原点 = 足元（空を飛ぶものは物体の中心）、local Y = 上、local Z = オブジェクトの前
  const w = height * sheet.aspect

  const sideGeo = new THREE.PlaneGeometry(w, height).translate(0, height * (0.5 - sheet.footFrac), 0)
  upNormals(sideGeo, [0, 1, 0])
  const sideMesh = new THREE.Mesh(sideGeo, sheet.mat)
  sideMesh.rotation.order = 'YXZ'   // 左右に回してから上下に傾ける
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

  // 真下（空を飛ぶものだけ）: 絵の上 → 前（+Z）、絵の右 → オブジェクトの左（+X。下から見上げるので左右が天面と逆）、法線 → 下（-Y）
  let bottomGeo = null, bottomMesh = null
  if (sheet.flying) {
    bottomGeo = new THREE.PlaneGeometry(w, height)
    upNormals(bottomGeo, [0, 0, -1])
    bottomMesh = new THREE.Mesh(bottomGeo, sheet.mat)
    bottomMesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)))
    bottomMesh.visible = false
    group.add(bottomMesh)
  }

  const back = Math.round(Math.PI / sheet.sectorAngle)   // 真後ろの向き番号
  const hold = sheet.sectorAngle / 2 + SECTOR_MARGIN
  let sector = null, flat = null, band = 0, shown = ''

  // group の位置・向きを決めたあとに呼ぶ。pose: ポーズ名 / step: 何コマ目か（コマ数で回る）
  function face(camera, pose, step) {
    group.updateMatrixWorld()
    group.worldToLocal(camera.getWorldPosition(_cam))
    const yaw  = Math.atan2(_cam.x, _cam.z)   // 0 = 前から、正 = オブジェクトの左側（+X）から
    const elev = Math.atan2(_cam.y - topLift, Math.hypot(_cam.x, _cam.z))

    // 天面・真下の板に出すか（flat: 'top' / 'bottom' / null）
    const [enter, leave] = sheet.flying ? [FLY_FLAT_ENTER, FLY_FLAT_LEAVE] : [TOP_ENTER, TOP_LEAVE]
    const up   = elev > (flat === 'top' ? leave : enter)
    const down = sheet.flying && elev < -(flat === 'bottom' ? leave : enter)
    flat = up ? 'top' : down ? 'bottom' : null
    topMesh.visible = flat === 'top'
    if (bottomMesh) bottomMesh.visible = flat === 'bottom'
    sideMesh.visible = !flat

    if (!flat) {
      // 空を飛ぶものは見る高さで段を選ぶ
      if (sheet.flying && (band === 0 || band * elev < BAND_LEAVE)) band = elev > BAND_ENTER ? 1 : elev < -BAND_ENTER ? -1 : 0
      let d = Math.abs(yaw - (sector ?? 0) * sheet.sectorAngle)
      if (d > Math.PI) d = 2 * Math.PI - d
      if (sector === null || d > hold) {
        let s = Math.round(yaw / sheet.sectorAngle)
        if (s === -back) s = back
        sector = s
      }
      // 歩くものは板を常にカメラへ向ける。空を飛ぶものは選んだ絵の向き・段の傾きに止めておく
      if (sheet.flying) sideMesh.rotation.set(-band * BAND_TILT, sector * sheet.sectorAngle, 0)
      else sideMesh.rotation.set(0, yaw, 0)
    }

    const [view, fromLeft] = flat ? [flat, false] : sheet.sectorView[sector]
    const frames = sheet.looks[pose].views[sheet.flying && !flat ? bandView(band, view) : view]
    const i = step % frames.length
    const key = `${pose}/${view}/${band}/${fromLeft}/${i}`
    if (key === shown) return
    shown = key
    setCell(flat === 'top' ? topGeo : flat === 'bottom' ? bottomGeo : sideGeo, frames[i].cell, frames[i].mirror !== fromLeft)
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

// ------------------------------------------------------------
//  空を飛びまわるスプライト（飛行機など。絵は pixelArt/flyers/ の形）
//  惑星の中心から altitude の高さを、曲がらずにまっすぐ飛ぶ（出たときの向きの大円に沿って星をぐるぐる回る）
//  絵のポーズは fly
// ------------------------------------------------------------
// art: 絵のデータ / count: 数 / dot: ドット 1 つの大きさ (m) / speed: 飛ぶ速さ (m/s) / altitude: 惑星中心からの高さ (m)
export function createPixelSpriteFlyers({ scene, art, count, dot, speed, altitude }) {
  const sheet = buildSheet(art)
  const height = sheet.cellHeight * dot
  const flyers = []

  for (let i = 0; i < count; i++) {
    const sprite = createSprite(sheet, height, 0)
    const dir = new THREE.Vector3().randomDirection()
    const axis = new THREE.Vector3().randomDirection().cross(dir).normalize()   // 飛ぶ大円の軸（ずっと変えない）
    scene.add(sprite.group)
    flyers.push({ sprite, dir, axis, fwd: new THREE.Vector3() })
  }

  function update(dt, camera) {
    const da = speed / altitude * dt
    for (const f of flyers) {
      // 大円の軸のまわりに回って前へ進む。前 = 軸 × 上
      f.dir.applyAxisAngle(f.axis, da).normalize()
      f.fwd.crossVectors(f.axis, f.dir).normalize()

      // 置く: local Y = 上、local Z = 前、原点 = 物体の中心
      const g = f.sprite.group
      g.setRotationFromMatrix(_m.makeBasis(_right.crossVectors(f.dir, f.fwd), f.dir, f.fwd))
      g.position.copy(f.dir).multiplyScalar(altitude)
      f.sprite.face(camera, 'fly', 0)
    }
  }

  return { update }
}
