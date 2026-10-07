import * as THREE from 'three'
import { addArchDoorGlow } from '../doorGlow.js'
import { SSHALL_SIZE } from '../../my-3d-parts/landmark/sshall.js'

// ============================================================
//  SShall 室内（スケッチの平面図どおりのワンフロア）
//  正面の棟・奥の棟・塔の3つを壁で仕切らずにつないだ1部屋。塔の部分は吹き抜けで、上に窓と円錐の天井
//  形は外観（my-3d-parts の landmark/sshall.js）の寸法を SCALE 倍したもの。床面積は外観より広く（XZ を AREA 倍）、高さは外観どおり
//  座標: 外観と同じ向き（原点 = 塔の中心、+z が正面の扉の側）、y=0 が床（外観の基壇の上面）
// ============================================================

const SCALE = 2   // coccolith で外観を置いている倍率
const AREA  = 1.2 // 床面積を外観の何倍にするか（天井の高さは変えない）
const C = SSHALL_SIZE, P = C.PLINTH, F = C.FRONT, B = C.BACK, TW = C.TOWER, WIN = C.WIN, DR = C.DOOR
const s = (v) => v * SCALE * Math.sqrt(AREA)   // 外観の XZ → 室内の XZ
const y = (v) => (v - P.h) * SCALE   // 外観の高さ → 室内の床からの高さ

const T     = 0.2                   // 壁の厚さ
const H_ROOM  = y(F.h)              // 棟の天井の高さ
const H_TOWER = y(TW.h)             // 塔の壁の上端（ここから円錐の天井）
const TOWER_R = s(TW.r)             // 塔の12角形の角までの距離
const STEP  = Math.PI * 2 / TW.seg
const TOWER_IN = TOWER_R * Math.cos(STEP / 2)   // 塔の12角形の辺までの距離（当たり判定は内接円）

// 床の形: 長方形2つ + 塔の12角形（どれも凸多角形、[x, z] の配列）
const rect = (r) => [[s(r.x0), s(r.z0)], [s(r.x1), s(r.z0)], [s(r.x1), s(r.z1)], [s(r.x0), s(r.z1)]]
const ringPt = (r, a) => [r * Math.sin(a), r * Math.cos(a)]   // 角度 a は +z から +x へ（外観の塔と同じ）
const FRONT = rect(F), BACK = rect(B)
const TOWER = Array.from({ length: TW.seg }, (_, k) => ringPt(TOWER_R, k * STEP))
const ROOMS = [FRONT, BACK, TOWER]

// 扉（正面の棟の壁の真ん中）
const DOOR_X = s((F.x0 + F.x1) / 2), DOOR_Z = s(F.z1)
const DOOR_W = DR.w * SCALE, DOOR_H = y(DR.h), DOOR_T = DR.t * SCALE   // 扉の大きさは外観どおり

// 凸多角形の各辺の外向きの法線と、辺上の1点
function edges(poly) {
  const cx = poly.reduce((t, p) => t + p[0], 0) / poly.length
  const cz = poly.reduce((t, p) => t + p[1], 0) / poly.length
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]
    let n = [q[1] - p[1], -(q[0] - p[0])]
    if (n[0] * ((p[0] + q[0]) / 2 - cx) + n[1] * ((p[1] + q[1]) / 2 - cz) < 0) n = [-n[0], -n[1]]
    const l = Math.hypot(n[0], n[1])
    return { p, q, n: [n[0] / l, n[1] / l] }
  })
}

// 線分 p→q のうち凸多角形の中（縁を含む）にある範囲 [t0, t1]（なければ null）
function clipInside(p, q, poly) {
  let t0 = 0, t1 = 1
  const d = [q[0] - p[0], q[1] - p[1]]
  for (const e of edges(poly)) {
    const num = e.n[0] * (p[0] - e.p[0]) + e.n[1] * (p[1] - e.p[1])
    const den = e.n[0] * d[0] + e.n[1] * d[1]
    if (Math.abs(den) < 1e-9) { if (num > 1e-6) return null; continue }
    const t = -num / den
    if (den > 0) t1 = Math.min(t1, t)
    else t0 = Math.max(t0, t)
  }
  return t0 < t1 ? [t0, t1] : null
}

// 凸多角形 poly を半平面 n·(x - p) <= 0 で切る（Sutherland–Hodgman）
function cutHalf(poly, p, n, keepInside) {
  const side = (v) => (n[0] * (v[0] - p[0]) + n[1] * (v[1] - p[1])) * (keepInside ? 1 : -1)
  const out = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b)
    if (sa <= 0) out.push(a)
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  })
  return out.length >= 3 ? out : null
}
// 凸多角形 poly から凸多角形 cut を引いた残りを、重ならない凸多角形の配列で返す
function diff(poly, cut) {
  const pieces = []
  let rest = poly
  for (const e of edges(cut)) {
    if (!rest) break
    const outside = cutHalf(rest, e.p, e.n, false)
    if (outside) pieces.push(outside)
    rest = cutHalf(rest, e.p, e.n, true)
  }
  return pieces
}
const diffAll = (polys, cut) => polys.flatMap((p) => diff(p, cut))

// 部屋 poly の辺のうち、ほかの部屋に入っていない部分（= 外周の壁になるところ）
function outerWalls(poly, others) {
  const out = []
  for (const e of edges(poly)) {
    let pieces = [[0, 1]]
    for (const o of others) {
      const c = clipInside(e.p, e.q, o)
      if (!c) continue
      pieces = pieces.flatMap(([a, b]) => [[a, Math.min(b, c[0])], [Math.max(a, c[1]), b]]).filter(([a, b]) => b - a > 1e-4)
    }
    for (const [a, b] of pieces) out.push({ e, a, b })
  }
  return out
}

// 当たり判定: sabちゃんの中心が、半径 r だけ内側に縮めた部屋のどれかに入っていればよい。外なら一番近い部屋へ戻す
function resolve(pos, r) {
  const cands = []
  for (const R of [F, B]) {
    const x = Math.min(Math.max(pos.x, s(R.x0) + r), s(R.x1) - r)
    const z = Math.min(Math.max(pos.z, s(R.z0) + r), s(R.z1) - r)
    cands.push([x, z])
  }
  const d = Math.hypot(pos.x, pos.z), rr = TOWER_IN - r
  cands.push(d > rr ? [pos.x * rr / d, pos.z * rr / d] : [pos.x, pos.z])
  let best = null, bd = Infinity
  for (const [x, z] of cands) {
    const dd = (x - pos.x) ** 2 + (z - pos.z) ** 2
    if (dd < 1e-12) return
    if (dd < bd) { bd = dd; best = [x, z] }
  }
  pos.x = best[0]
  pos.z = best[1]
}

export function createSShallInterior() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x2a2438)
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x9a90b4, 1.2))
  const key = new THREE.DirectionalLight(0xfff5e8, 1.2)
  key.position.set(-6, 20, 10)
  scene.add(key)

  // 面は少し奥へずらして描き、角に重なる輪郭線とのチラつきを防ぐ
  const surface = (color, side = THREE.FrontSide) => new THREE.MeshLambertMaterial({ color, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const mWall  = surface(0xF4EEDC)
  const mFloor = surface(0xB89870)
  const mCeil  = surface(0xD8CFBA)
  const mCone  = surface(0x5E4E72, THREE.BackSide)   // 内側から見る円錐の天井
  const mDoor  = new THREE.MeshLambertMaterial({ color: 0x8a6a48 })
  const mFrame = new THREE.MeshLambertMaterial({ color: 0x7a5a3a, side: THREE.DoubleSide })
  const mSky   = new THREE.MeshBasicMaterial({ color: 0xBCD3EA, side: THREE.DoubleSide })   // 窓の外の明るさ
  const mDark  = new THREE.MeshLambertMaterial({ color: 0x2c2a33 })
  const mLine  = new THREE.LineBasicMaterial({ color: 0x8F8370 })

  const solids = []   // カメラの視線を遮ったら隠す対象
  function add(mesh, outline) {
    scene.add(mesh)
    solids.push(mesh)
    if (outline) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), mLine))  // 子にして一緒に隠れるように
    return mesh
  }

  // 床（上向き）と天井（下向き）: 多角形の板。shape の (x, y) → 床はワールド (x, -z)、天井は (x, z)
  const shape = (poly, flipZ) => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, flipZ ? -z : z)))
  // 床と天井は重ならない凸多角形に分けて作る（重なった面のチラつき防止）
  // 床 = 正面の棟 + 奥の棟（正面の棟を除く）+ 塔（両方の棟を除く）
  const floorPieces = [FRONT, ...diff(BACK, FRONT), ...diffAll(diff(TOWER, FRONT), BACK)]
  for (const poly of floorPieces) {
    const g = new THREE.ShapeGeometry(shape(poly, true))
    g.rotateX(-Math.PI / 2)
    add(new THREE.Mesh(g, mFloor))
  }
  // 天井 = 棟の床から塔を除いたところ（塔の上は吹き抜け）
  for (const poly of diffAll([FRONT, ...diff(BACK, FRONT)], TOWER)) {
    const g = new THREE.ShapeGeometry(shape(poly, false))
    g.rotateX(Math.PI / 2)
    g.translate(0, H_ROOM, 0)
    add(new THREE.Mesh(g, mCeil))
  }

  // 壁: 辺 e の a〜b の部分を、外側へ厚み T の板にする。元の角で終わる端は T/2 延ばして角を埋める
  function wall({ e, a, b }, y0, y1, outline) {
    const d = [e.q[0] - e.p[0], e.q[1] - e.p[1]], len = Math.hypot(d[0], d[1])
    const ea = a === 0 ? T / 2 : 0, eb = b === 1 ? T / 2 : 0
    const l = (b - a) * len + ea + eb
    const mid = (a + b) / 2 * len + (eb - ea) / 2
    const g = new THREE.BoxGeometry(l, y1 - y0, T)
    const m = new THREE.Mesh(g, mWall)
    m.position.set(e.p[0] + d[0] / len * mid + e.n[0] * T / 2, (y0 + y1) / 2, e.p[1] + d[1] / len * mid + e.n[1] * T / 2)
    m.rotation.y = Math.atan2(-d[1], d[0])
    return add(m, outline)
  }
  ROOMS.forEach((poly, i) => {
    const others = ROOMS.filter((_, j) => j !== i)
    for (const w of outerWalls(poly, others)) wall(w, 0, H_ROOM)
  })
  // 塔の吹き抜け: 棟の天井より上は12角形の壁が一周。内向きの板にして、下端は天井より少し下げる
  // （箱にすると底面が天井と同じ高さに重なってチラつく）
  for (const e of edges(TOWER)) {
    const d = [e.q[0] - e.p[0], e.q[1] - e.p[1]], len = Math.hypot(d[0], d[1])
    const y0 = H_ROOM - 0.05
    const g = new THREE.PlaneGeometry(len, H_TOWER - y0)
    const m = new THREE.Mesh(g, mWall)
    m.position.set((e.p[0] + e.q[0]) / 2, (y0 + H_TOWER) / 2, (e.p[1] + e.q[1]) / 2)
    m.rotation.y = Math.atan2(-e.n[0], -e.n[1])   // 板の +z を部屋の内側（-n）へ
    add(m)
  }
  // 塔の天井（円錐。内側から見る）
  {
    const g = new THREE.ConeGeometry(TOWER_R, s(TW.roofH), TW.seg, 1, true)
    g.translate(0, H_TOWER + s(TW.roofH) / 2, 0)
    add(new THREE.Mesh(g, mCone))
  }

  // 塔の窓: 壁の内側の面に沿った明るい板 + 上下の茶色の枠（外観と同じ角度・高さ）
  // ring: 12角形の内側の面に沿って、角度 a0〜a1 を分割の角で折った点の列
  const inner = TOWER_IN - 0.03
  const ring = (a0, a1, inset) => {
    const as = [a0]
    for (let k = Math.floor(a0 / STEP) + 1; k * STEP < a1; k++) as.push(k * STEP)
    as.push(a1)
    return as.map((a) => {
      const rel = ((a % STEP) + STEP) % STEP - STEP / 2   // いちばん近い辺の中点からの角度
      return ringPt((inner - inset) / Math.cos(rel), a)
    })
  }
  const strip = (pts, y0, y1, mat) => {
    const pos = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    scene.add(new THREE.Mesh(g, mat))
  }
  {
    const wy1 = y(TW.h - WIN.top), wy0 = wy1 - s(WIN.h), fr = s(WIN.frame)
    for (let i = 0; i < WIN.n; i++) {
      const ac = THREE.MathUtils.degToRad(WIN.rot + i * 360 / WIN.n), ha = THREE.MathUtils.degToRad(WIN.arc / 2)
      const fa = fr / TOWER_IN   // 枠の幅を角度に
      strip(ring(ac - ha, ac + ha, 0), wy0, wy1, mSky)
      strip(ring(ac - ha - fa, ac + ha + fa, 0.06), wy1, wy1 + fr, mFrame)   // 上の枠
      strip(ring(ac - ha - fa, ac + ha + fa, 0.06), wy0 - fr, wy0, mFrame)   // 下の枠
      strip(ring(ac - ha - fa, ac - ha, 0.06), wy0, wy1, mFrame)             // 左の枠
      strip(ring(ac + ha, ac + ha + fa, 0.06), wy0, wy1, mFrame)             // 右の枠
    }
  }

  // 扉（正面の壁の内側、アーチの両開き）。原点 = 扉の下端の真ん中、+z が部屋の内側
  const exitDoor = new THREE.Group()
  exitDoor.position.set(DOOR_X, 0, DOOR_Z)
  exitDoor.rotation.y = Math.PI
  scene.add(exitDoor)
  {
    const r = DOOR_W / 2, ds = DOOR_H - r
    for (const sg of [-1, 1]) {
      const sh = new THREE.Shape()
      sh.moveTo(0, 0); sh.lineTo(sg * r, 0); sh.lineTo(sg * r, ds)
      if (sg > 0) sh.absarc(0, ds, r, 0, Math.PI / 2, false)
      else sh.absarc(0, ds, r, Math.PI, Math.PI / 2, true)
      sh.lineTo(0, 0)
      const g = new THREE.ExtrudeGeometry(sh, { depth: DOOR_T, bevelEnabled: false, curveSegments: 2 })
      g.translate(0, 0, -DOOR_T / 2)
      const leaf = new THREE.Mesh(g, mDoor)
      leaf.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x2f3448 })))
      exitDoor.add(leaf)
      solids.push(leaf)   // カメラとの間に入ったら隠す（入ってすぐはカメラが扉の外側にある）
      const knob = new THREE.Mesh(new THREE.TorusGeometry(s(0.105), s(0.027), 4, 8), mDark)
      knob.position.set(sg * s(0.18), s(1.05), DOOR_T / 2 + s(0.03))
      leaf.add(knob)   // 扉の板と一緒に隠れるように
    }
  }
  addArchDoorGlow(exitDoor, { width: DOOR_W, height: DOOR_H, depth: DOOR_T, curveSegments: 2 })
  solids.push(exitDoor.userData.glow.halo)   // 光も扉の板と同じくカメラとの間に入ったら隠す

  return {
    scene,
    solids,
    floorAt: () => 0,
    resolve,
    // 入ったときの位置と向き（扉の内側、部屋の奥＝塔の方を向く）
    spawn: { x: DOOR_X, z: DOOR_Z - 1.6, fwd: new THREE.Vector3(0, 0, -1) },
    // 扉。前にいれば輪郭が光り、タップで外へ出られる
    exitDoor,
    atExit: (p) => p.z > DOOR_Z - 2.2 && Math.abs(p.x - DOOR_X) < DOOR_W / 2 + 0.6,
  }
}
