import * as THREE from 'three'
import { addDoorGlow } from '../doorGlow.js'

// ============================================================
//  豆腐ハウス 室内（図面ベース。外観より広く作っている）
//  座標: 図面の左上を原点に x→右 (0〜W)、z→下 (0〜D)、y→上 (m)
//        下階（地上と同じ高さ）y=0、上階 y=UP
//
//  ┌──────────────────────────────────┐ z=0
//  │ 上階ホール │ 階段(上り←)    │ 外扉 │ ← 玄関ホール（z < HALL_Z）
//  ├─扉───────────────────────────────┤ z=HALL_Z
//  │      ┌─腰壁─┐      ┌─腰壁─┐      │
//  │      │吹抜け│ 階段↓ │吹抜け│      │ ← 上階の部屋（下に同じ広さの下階）
//  │      └──────┴─腰壁──┴──────┘      │
//  └──────────────────────────────────┘ z=D
// ============================================================

export const W = 21, D = 17, H = 8
const T  = 0.2                                          // 外壁・間仕切りの厚さ
const UP = 4                                            // 上階の床高
const SLAB = 0.3                                        // 上階の床スラブ厚
const HALL_Z = 3.1                                      // ホール/部屋の間仕切り壁（z = HALL_Z〜HALL_Z+T）
const HALL_STAIR = { x0: 10.4, x1: 18.8 }              // ホール階段: x1(下階)→x0(上階)
// 吹き抜け＋階段のまとまり。外周を腰壁で囲み、階段の両脇は斜めの手すり壁
const WELL  = { x0: 3.1, x1: 17.8, z0: 6.2, z1: 14.1 } // 腰壁の外形
const STAIR = { x0: 7.3, x1: 13.4, z1: 13.3 }          // 階段: WELL.z0(上階) → STAIR.z1(下階)
const PT = 0.25                                         // 腰壁の厚さ
const PARAPET_H = 1.1                                   // 腰壁の高さ（上階の床から）
const GUARD_H   = 1.0                                   // 階段脇の壁の高さ（段の上から）
const ROOM_DOOR = { x0: 0.4, x1: 3.5, h: 2.4 }         // ホール→部屋の扉（上階）
const EXT_DOOR  = { z0: 0.75, z1: 2.35, h: 2.6 }       // 外扉（右壁・下階）
const STEPS = 20

// 現在の高さ y を手がかりに、(x, z) の床の高さを返す（上下階が重なる部屋部分は y で判別）
function floorAt(x, z, y) {
  if (z < HALL_Z + T / 2) {
    if (x >= HALL_STAIR.x1) return 0
    if (x <= HALL_STAIR.x0) return UP
    return UP * (HALL_STAIR.x1 - x) / (HALL_STAIR.x1 - HALL_STAIR.x0)
  }
  if (x > STAIR.x0 && x < STAIR.x1 && z > WELL.z0 && z < STAIR.z1) {
    return UP * (STAIR.z1 - z) / (STAIR.z1 - WELL.z0)
  }
  return y > UP / 2 ? UP : 0
}

// 当たり判定の箱 [x0, x1, z0, z1, y0, y1]。sabちゃんの高さ範囲と重なる箱だけ効く
const PY0 = UP - SLAB, PY1 = UP + PARAPET_H
const BOXES = [
  // 外壁（外扉は閉じた扉として壁扱い）
  [0, T, 0, D, 0, H], [W - T, W, 0, D, 0, H], [0, W, 0, T, 0, H], [0, W, D - T, D, 0, H],
  // ホール/部屋の間仕切り（扉の開口だけ上階の高さで通れる）
  [0, ROOM_DOOR.x0, HALL_Z, HALL_Z + T, 0, H],
  [ROOM_DOOR.x1, W, HALL_Z, HALL_Z + T, 0, H],
  [ROOM_DOOR.x0, ROOM_DOOR.x1, HALL_Z, HALL_Z + T, 0, UP],
  // 上階: 吹き抜けまわりの腰壁（外周の左右・下、吹き抜けの上端）
  [WELL.x0, WELL.x0 + PT, WELL.z0, WELL.z1, PY0, PY1],
  [WELL.x1 - PT, WELL.x1, WELL.z0, WELL.z1, PY0, PY1],
  [WELL.x0, WELL.x1, STAIR.z1, WELL.z1, PY0, PY1],
  [WELL.x0, STAIR.x0, WELL.z0, WELL.z0 + PT, PY0, PY1],
  [STAIR.x1, WELL.x1, WELL.z0, WELL.z0 + PT, PY0, PY1],
  // 階段の両脇の壁（下階から上階まで）と、階段の裏（上端から間仕切り壁まで埋める）
  [STAIR.x0 - PT, STAIR.x0, WELL.z0, STAIR.z1, 0, PY1],
  [STAIR.x1, STAIR.x1 + PT, WELL.z0, STAIR.z1, 0, PY1],
  [STAIR.x0 - PT, STAIR.x1 + PT, HALL_Z + T, WELL.z0, 0, PY0],
]

// pos(x, y, z) を当たり判定の箱の外へ押し戻す。r: sabちゃんの半径, h: 身長
function resolve(pos, r, h) {
  for (let pass = 0; pass < 2; pass++) {
    for (const [x0, x1, z0, z1, y0, y1] of BOXES) {
      if (pos.y + h * 0.1 >= y1 || pos.y + h * 0.9 <= y0) continue
      const dl = pos.x - (x0 - r), dr = (x1 + r) - pos.x
      const dn = pos.z - (z0 - r), df = (z1 + r) - pos.z
      if (dl <= 0 || dr <= 0 || dn <= 0 || df <= 0) continue
      const m = Math.min(dl, dr, dn, df)
      if      (m === dl) pos.x = x0 - r
      else if (m === dr) pos.x = x1 + r
      else if (m === dn) pos.z = z0 - r
      else               pos.z = z1 + r
    }
  }
}

export function createTofuInterior() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x2a2438)
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a90b4, 1.2))
  const key = new THREE.DirectionalLight(0xfff5e8, 1.4)
  key.position.set(W * 0.3, 20, D * 0.8)
  scene.add(key)

  // 面は少し奥へずらして描き、角に重なる輪郭線とのチラつきを防ぐ
  const surface = (color) => new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const mWall  = surface(0xE4DEF3)
  const mFloor = surface(0xE4DEF3)   // 床も壁と同じ色
  const mStair = surface(0xF1EEF8)
  const mBlock = surface(0xD9D2EE)
  const mCeil  = surface(0x8E8A9C)
  const mDoor  = new THREE.MeshLambertMaterial({ color: 0x74523F })
  const mRail  = new THREE.MeshLambertMaterial({ color: 0x9A9AA2 })
  const mLine  = new THREE.LineBasicMaterial({ color: 0xB3A9CC })

  const solids = []   // カメラの視線を遮ったら隠す対象
  function add(mesh, outline) {
    scene.add(mesh)
    solids.push(mesh)
    if (outline) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), mLine))  // 子にして一緒に隠れるように
    return mesh
  }
  function box(x0, x1, y0, y1, z0, z1, mat, outline = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat)
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    return add(mesh, outline)
  }

  // 床・天井・外壁
  box(0, W, -0.1, 0, 0, D, mFloor)
  box(0, W, H, H + 0.1, 0, D, mCeil)
  box(0, T, 0, H, 0, D, mWall)
  box(W - T, W, 0, H, 0, D, mWall)
  box(0, W, 0, H, 0, T, mWall)
  box(0, W, 0, H, D - T, D, mWall)

  // ホール/部屋の間仕切り（上階に扉の開口）
  box(0, ROOM_DOOR.x0, 0, H, HALL_Z, HALL_Z + T, mWall)
  box(ROOM_DOOR.x1, W, 0, H, HALL_Z, HALL_Z + T, mWall)
  box(ROOM_DOOR.x0, ROOM_DOOR.x1, 0, UP, HALL_Z, HALL_Z + T, mWall)
  box(ROOM_DOOR.x0, ROOM_DOOR.x1, UP + ROOM_DOOR.h, H, HALL_Z, HALL_Z + T, mWall)

  // ホール: 上階の踊り場（下は詰まった台）と階段
  box(T, HALL_STAIR.x0, 0, UP, T, HALL_Z, mFloor, true)
  {
    const run = (HALL_STAIR.x1 - HALL_STAIR.x0) / STEPS
    for (let i = 0; i < STEPS; i++) {
      const xR = HALL_STAIR.x1 - i * run
      box(xR - run, xR, 0, (i + 1) * UP / STEPS, T, HALL_Z, mStair, true)
    }
  }

  // 上階の床スラブ（吹き抜け＋階段の開口を除く）
  const ox0 = WELL.x0 + PT, ox1 = WELL.x1 - PT
  box(T, W - T, PY0, UP, HALL_Z + T, WELL.z0, mFloor)
  box(T, W - T, PY0, UP, STAIR.z1, D - T, mFloor)
  box(T, ox0, PY0, UP, WELL.z0, STAIR.z1, mFloor)
  box(ox1, W - T, PY0, UP, WELL.z0, STAIR.z1, mFloor)

  // 部屋の階段（上階 WELL.z0 → 下階 STAIR.z1）
  {
    const run = (STAIR.z1 - WELL.z0) / STEPS
    for (let i = 0; i < STEPS; i++) {
      const zB = STAIR.z1 - i * run
      box(STAIR.x0, STAIR.x1, 0, (i + 1) * UP / STEPS, zB - run, zB, mStair, true)
    }
  }

  // 階段の裏: 下階で階段の後ろを回り込めないよう、間仕切り壁まで壁で埋める
  box(STAIR.x0 - PT, STAIR.x1 + PT, 0, PY0, HALL_Z + T, WELL.z0, mWall, true)

  // 吹き抜けまわりの腰壁。床の上に載るものは床面から（スラブと面が重なるとチラつくため）、
  // 吹き抜けの上端は下に床がないのでスラブの厚みぶん垂らす
  box(WELL.x0, ox0, UP, PY1, WELL.z0, WELL.z1, mBlock, true)
  box(ox1, WELL.x1, UP, PY1, WELL.z0, WELL.z1, mBlock, true)
  box(ox0, ox1, UP, PY1, STAIR.z1, WELL.z1, mBlock, true)
  box(ox0, STAIR.x0 - PT, PY0, PY1, WELL.z0, WELL.z0 + PT, mBlock, true)
  box(STAIR.x1 + PT, ox1, PY0, PY1, WELL.z0, WELL.z0 + PT, mBlock, true)

  // 階段の両脇の壁: 下階の床から、上端が段に沿って下がる台形
  {
    const shape = new THREE.Shape()
    shape.moveTo(WELL.z0, 0)
    shape.lineTo(WELL.z0, PY1)
    shape.lineTo(STAIR.z1, GUARD_H)
    shape.lineTo(STAIR.z1, 0)
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PT, bevelEnabled: false })
    geo.rotateY(-Math.PI / 2)   // 形の x → ワールド z、押し出し方向 → ワールド -x
    for (const xRight of [STAIR.x0, STAIR.x1 + PT]) {
      const wall = new THREE.Mesh(geo, mBlock)
      wall.position.x = xRight
      add(wall, true)
    }
  }

  // 手すり（壁の内側、段に沿って）
  for (const x of [STAIR.x0 + 0.08, STAIR.x1 - 0.08]) {
    const a = new THREE.Vector3(x, UP + 0.9, WELL.z0 + 0.1)
    const b = new THREE.Vector3(x, 0.9, STAIR.z1)
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 8, 0.04, 6), mRail))
  }

  // 外扉（右壁の内側）
  const exitDoor = box(W - T - 0.06, W - T, 0, EXT_DOOR.h, EXT_DOOR.z0, EXT_DOOR.z1, mDoor)
  addDoorGlow(exitDoor)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3A3040 }))
  knob.position.set(W - T - 0.12, EXT_DOOR.h * 0.48, EXT_DOOR.z1 - 0.2)
  scene.add(knob)

  return {
    scene,
    solids,
    floorAt,
    resolve,
    // 入ったときの位置と向き（外扉の内側、ホールの奥＝左向き）
    spawn: { x: W - T - 1.0, z: (EXT_DOOR.z0 + EXT_DOOR.z1) / 2, fwd: new THREE.Vector3(-1, 0, 0) },
    // 外扉。前（下階の踊り場）にいれば輪郭が光り、タップで外へ出られる
    exitDoor,
    atExit: (p) => p.x > HALL_STAIR.x1 + 0.2 && p.z < HALL_Z && p.y < 0.5,
  }
}
