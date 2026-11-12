import * as THREE from 'three'
import { R_C, LAND_LIFT } from './constants.js'
import { SHITABA_TILES } from './pixelArt/ground/shitaba.js'

// ============================================================
//  下葉 — ドット絵を地面に平らに貼る
//  範囲の真ん中を中心にした平面（中心からの距離と向きを保つ図法）に TILE (m) 角のマス目を敷き、
//  範囲に入るマスにドット絵を 1 枚ずつ貼る。上下左右のマスがあるかどうかで 9 枚（中央・端・角）から選ぶ（上 = 北）
//  板は地形の三角形に沿わせ、LIFT だけ浮かせる。平らな陸地（高さ R_C + LAND_LIFT）だけに貼り、坂（海岸・山）には貼らない
//
//  terrainGeo: 地表の SphereGeometry（押し出したあとのもの。分割数 segs × segs）
//  contains(lat, lon): その地点が貼る範囲か
//  center: { lat, lon } 図法の中心
// ============================================================

const TILE = 6          // 1 枚の大きさ (m)
const SUB  = 3          // 1 枚を SUB × SUB に分けて地形に沿わせる（地形の折れ目で板が地面に潜らないように）
const LIFT = 0.08       // 地面から浮かせる高さ (m)
const FLAT_TOL = 0.8    // 平らな陸地とみなす高さの幅 (m)。地形の三角形の中ほどは頂点より最大 0.55m ほど低い

// 9 枚を並べたテクスチャの中の位置（列, 行）。行 0 が上（北）
const ATLAS = {
  topLeft: [0, 0], top: [1, 0], topRight: [2, 0],
  left:    [0, 1], center: [1, 1], right: [2, 1],
  bottomLeft: [0, 2], bottom: [1, 2], bottomRight: [2, 2],
}

function createAtlasTexture() {
  const N = SHITABA_TILES.center.width
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = N * 3
  const ctx = canvas.getContext('2d')
  for (const [key, [col, row]] of Object.entries(ATLAS)) {
    const { palette, grid } = SHITABA_TILES[key]
    grid.forEach((line, y) => line.forEach((n, x) => {
      if (!palette[n]) return
      ctx.fillStyle = palette[n]
      ctx.fillRect(col * N + x, row * N + y, 1, 1)
    }))
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}

// 地表の SphereGeometry で、中心から dir の向きの地面までの距離（当たらなければ null）
// SphereGeometry の頂点の並びから dir の入る四角を割り出し、その四角とまわりの三角形だけを調べる
function terrainRadiusFn(geo, segs) {
  const pos = geo.attributes.position
  const idx = geo.index
  const ray = new THREE.Ray(new THREE.Vector3())
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3()
  const quadTris = new Map()    // 四角の左上の頂点番号 → その四角の三角形（index の先頭）。端の行は三角形が 1 つなので頂点番号から引く
  for (let t = 0; t < idx.count; t += 3) {
    const vs = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
    const minRow = Math.min(...vs.map(v => Math.floor(v / (segs + 1))))
    const minCol = Math.min(...vs.map(v => v % (segs + 1)))
    const key = minRow * (segs + 1) + minCol
    if (!quadTris.has(key)) quadTris.set(key, [])
    quadTris.get(key).push(t)
  }
  return dir => {
    ray.direction.copy(dir)
    const theta = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1))
    let phi = Math.atan2(dir.z, -dir.x)
    if (phi < 0) phi += Math.PI * 2
    const iy = Math.floor(theta / Math.PI * segs), ix = Math.floor(phi / (Math.PI * 2) * segs)
    for (let dy = 0; dy <= 1; dy++) for (const sy of dy ? [-1, 1] : [0]) {
      for (let dx = 0; dx <= 1; dx++) for (const sx of dx ? [-1, 1] : [0]) {
        const row = iy + sy, col = (ix + sx + segs) % segs
        for (const t of quadTris.get(row * (segs + 1) + col) ?? []) {
          a.fromBufferAttribute(pos, idx.getX(t))
          b.fromBufferAttribute(pos, idx.getX(t + 1))
          c.fromBufferAttribute(pos, idx.getX(t + 2))
          if (ray.intersectTriangle(a, b, c, false, hit)) return hit.length()
        }
      }
    }
    return null
  }
}

const dirOf = (lat, lon) => {
  const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180
  return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
}

export function createShitabaGround({ terrainGeo, segs, contains, center }) {
  const R = R_C + LAND_LIFT
  const radiusAt = terrainRadiusFn(terrainGeo, segs)

  // 図法の中心と、そこでの東・北の向き
  const c = dirOf(center.lat, center.lon)
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(c, -c.y).normalize()
  const east  = dirOf(center.lat, center.lon + 0.01).sub(c).normalize()
  const _t = new THREE.Vector3()
  // 平面の (u: 東, v: 北) (m) → 球面の向き
  const dirAt = (u, v, out = new THREE.Vector3()) => {
    const d = Math.hypot(u, v)
    if (d < 1e-9) return out.copy(c)
    const ang = d / R
    _t.copy(east).multiplyScalar(u / d).addScaledVector(north, v / d)
    return out.copy(c).multiplyScalar(Math.cos(ang)).addScaledVector(_t, Math.sin(ang))
  }
  const latLonOf = d => {
    const lat = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 180 / Math.PI
    let lon = Math.atan2(d.z, d.x) * 180 / Math.PI - 180
    if (lon < -180) lon += 360
    return { lat, lon }
  }

  // マス目の範囲：中心から少しずつ外へ広げ、範囲に入るマスが無くなる距離まで
  const cells = new Map()   // "i,j" → true（i: 東へ, j: 北へ）
  const key = (i, j) => `${i},${j}`
  const vtxR = new Map()    // 頂点 "gi,gj" → 地面までの距離
  const dirTmp = new THREE.Vector3()
  const vertexR = (gi, gj) => {
    const k = key(gi, gj)
    if (!vtxR.has(k)) vtxR.set(k, radiusAt(dirAt(gi * TILE / SUB, gj * TILE / SUB, dirTmp)))
    return vtxR.get(k)
  }
  const isFlat = (i, j) => {
    for (let a = 0; a <= SUB; a++) for (let b = 0; b <= SUB; b++) {
      const r = vertexR(i * SUB + a, j * SUB + b)
      if (r === null || r > R + 0.01 || r < R - FLAT_TOL) return false
    }
    return true
  }
  const MAX = Math.ceil(Math.PI / 2 * R / TILE)   // 中心から 90° まで
  for (let ring = 0, foundAny = true; ring <= MAX && (foundAny || ring < 3); ring++) {
    foundAny = false
    for (let i = -ring; i < ring; i++) for (let j = -ring; j < ring; j++) {
      if (Math.max(i < 0 ? -i : i + 1, j < 0 ? -j : j + 1) !== ring) continue   // この輪のマスだけ
      const { lat, lon } = latLonOf(dirAt((i + 0.5) * TILE, (j + 0.5) * TILE, dirTmp))
      if (!contains(lat, lon)) continue
      foundAny = true
      if (isFlat(i, j)) cells.set(key(i, j), true)
    }
  }

  // 1 マス幅で飛び出したところ（上下とも・左右とも空いている）は、端の絵が合わないので消す
  for (let changed = true; changed;) {
    changed = false
    for (const k of [...cells.keys()]) {
      const [i, j] = k.split(',').map(Number)
      const h = (di, dj) => cells.has(key(i + di, j + dj))
      if ((!h(0, 1) && !h(0, -1)) || (!h(1, 0) && !h(-1, 0))) { cells.delete(k); changed = true }
    }
  }

  // マスごとに絵を選んで板を作る
  const pos = [], nrm = [], uv = [], index = []
  const EPS = 0.001   // テクスチャの隣の絵がにじまないよう、端を少し内側にする
  const v = new THREE.Vector3()
  for (const k of cells.keys()) {
    const [i, j] = k.split(',').map(Number)
    const h = (di, dj) => cells.has(key(i + di, j + dj))
    const n = h(0, 1), s = h(0, -1), e = h(1, 0), w = h(-1, 0)
    const tile = !n && !w ? 'topLeft' : !n && !e ? 'topRight' : !s && !w ? 'bottomLeft' : !s && !e ? 'bottomRight'
               : !n ? 'top' : !s ? 'bottom' : !w ? 'left' : !e ? 'right' : 'center'
    const [col, row] = ATLAS[tile]
    const base = pos.length / 3
    for (let b = 0; b <= SUB; b++) for (let a = 0; a <= SUB; a++) {
      const gi = i * SUB + a, gj = j * SUB + b
      dirAt(gi * TILE / SUB, gj * TILE / SUB, v)
      nrm.push(v.x, v.y, v.z)
      v.multiplyScalar(vertexR(gi, gj) + LIFT)
      pos.push(v.x, v.y, v.z)
      const fs = EPS + (1 - 2 * EPS) * a / SUB, ft = EPS + (1 - 2 * EPS) * b / SUB   // 東・北へ 0〜1
      uv.push((col + fs) / 3, (2 - row + ft) / 3)
    }
    for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) {
      const p = base + b * (SUB + 1) + a, q = p + SUB + 1
      index.push(p, q + 1, p + 1, p, q, q + 1)   // lon が増える向き（東）は y 軸の左回りなので、東・北・上は左手系。表が上を向くよう逆回りにつなぐ
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(index)
  geo.computeBoundingSphere()

  const mat = new THREE.MeshLambertMaterial({
    map: createAtlasTexture(), alphaTest: 0.5,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.name = 'shitaba'
  return mesh
}
