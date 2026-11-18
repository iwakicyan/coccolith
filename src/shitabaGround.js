import * as THREE from 'three'
import { R_C, LAND_LIFT } from './constants.js'
import { SHITABA_TILES } from './pixelArt/ground/shitaba.js'
import Alea from 'alea'

// ============================================================
//  下葉 — ドット絵を地面に平らに貼る
//  範囲の真ん中を中心にした平面（中心からの距離と向きを保つ図法）に TILE (m) 角のマス目を敷き、
//  範囲に入るマスにドット絵を 1 枚ずつ貼る。上下左右のマスがあるかどうかで 9 枚（中央・端・角）から選ぶ（上 = 北）
//  tiles にカケの絵（cutTopLeft など）があれば、へこんだ角（ななめ隣だけマスが無い角）はその角が欠けた絵にする
//  板は地形の三角形に沿わせ、LIFT だけ浮かせる。flatOnly なら平らな陸地（高さ R_C + LAND_LIFT）だけに貼り、坂（海岸・山）には貼らない
//
//  terrainGeo: 地表の SphereGeometry（押し出したあとのもの。分割数 segs × segs）
//  contains(lat, lon): その地点が貼る範囲か
//  center: { lat, lon } 図法の中心
//  tiles: 9 枚のドット絵（＋カケの絵。既定は下葉。光の粒のところは EF）/ name: メッシュの名前
//  flatOnly: false なら坂（山）にも地形に沿わせて貼る（EF。光の粒の 2 か所は山A・山F の上）
//  tile: 1 枚の大きさ (m)
//  holes: { big, small, seed, at } at: 場所を決めて開ける 1 マスの穴 [{ lat, lon }]（その地点にいちばん近いマス）。
//    big, small, seed 範囲の中に開ける大きい穴・小さい穴の数と、場所・形を決める乱数の種（開くたびには変わらない）。形は HOLE_SHAPES
//    範囲の縁からは 2 マス以上離す。穴同士は近くてもよいが、1 マス幅のところ（端の絵が合わない）ができるところには開けない。入りきらなければ数は減る
//  opacity: 不透明度（1 で透けない。1 より小さいと下の地面が透けて見える）
//  sub / lift: 1 枚を分ける数と浮かせる高さ。坂に貼るときは細かく分け、少し高く浮かせて地形の折れ目に潜らないようにする
// ============================================================

const TILE_DEFAULT = 6  // 1 枚の大きさ (m)
const SUB_DEFAULT  = 3          // 1 枚を SUB × SUB に分けて地形に沿わせる（地形の折れ目で板が地面に潜らないように）
const LIFT_DEFAULT = 0.08       // 地面から浮かせる高さ (m)
const FLAT_TOL = 0.8    // 平らな陸地とみなす高さの幅 (m)。地形の三角形の中ほどは頂点より最大 0.55m ほど低い

// 穴の形（東西 × 南北のマスの数）。big を先に開けて、あいたところに small を入れる
const HOLE_SHAPES = { big: [[2, 2], [3, 2], [2, 3], [3, 3]], small: [[1, 1], [2, 1], [1, 2]] }

// へこんだ角に使うカケの絵（tiles に cutTopLeft などがあるときだけ使う。下葉には無い）
//   角の名前 → 絵の名前。ななめ隣のマスが無く、その角をはさむ 2 辺のマスはあるときに、その角が欠けた絵を使う
const CUT_TILE = { TL: 'cutTopLeft', TR: 'cutTopRight', BL: 'cutBottomLeft', BR: 'cutBottomRight' }
const CUT_PAIR_TILE = { 'TL,BR': 'cutTopLeftBottomRight', 'TR,BL': 'cutTopRightBottomLeft' }   // 2 か所欠けるのを描いた絵

// マスに使う絵を決める。返すのは 4 分の 1 ずつの絵の名前 [左上, 右上, 左下, 右下]
//   n s e w: 上下左右のマスがあるか / cuts: 欠ける角（'TL' など）
//   描いた絵がそのまま当てはまるときはその 1 枚。ほかは、欠ける角の 4 分の 1 だけカケの絵から取り、残りは端・角・中央の絵から取る
function tileQuarters(tiles, n, s, e, w, cuts) {
  const base = !n && !w ? 'topLeft' : !n && !e ? 'topRight' : !s && !w ? 'bottomLeft' : !s && !e ? 'bottomRight'
             : !n ? 'top' : !s ? 'bottom' : !w ? 'left' : !e ? 'right' : 'center'
  cuts = cuts.filter(c => tiles[CUT_TILE[c]])
  const whole = base !== 'center' ? (cuts.length ? null : base)
              : cuts.length === 0 ? 'center' : cuts.length === 1 ? CUT_TILE[cuts[0]] : CUT_PAIR_TILE[cuts.join(',')]
  if (whole && tiles[whole]) return [whole, whole, whole, whole]
  return ['TL', 'TR', 'BL', 'BR'].map(q => cuts.includes(q) ? CUT_TILE[q] : base)
}

// 使う組み合わせだけを並べたテクスチャを作る。quartersList: tileQuarters の結果の並び（重なりなし）
function createAtlasTexture(tiles, quartersList, cols, rows) {
  const N = tiles.center.width, H = N / 2
  const canvas = document.createElement('canvas')
  canvas.width = N * cols; canvas.height = N * rows
  const ctx = canvas.getContext('2d')
  quartersList.forEach((quarters, k) => {
    const col = k % cols, row = Math.floor(k / cols)
    quarters.forEach((name, q) => {
      const { palette, grid } = tiles[name]
      const x0 = (q % 2) * H, y0 = Math.floor(q / 2) * H
      for (let y = y0; y < y0 + H; y++) for (let x = x0; x < x0 + H; x++) {
        const c = palette[grid[y][x]]
        if (!c) continue
        ctx.fillStyle = c
        ctx.fillRect(col * N + x, row * N + y, 1, 1)
      }
    })
  })
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

export function createShitabaGround({ terrainGeo, segs, contains, center, tiles = SHITABA_TILES, name = 'shitaba',
                                     flatOnly = true, sub: SUB = SUB_DEFAULT, lift: LIFT = LIFT_DEFAULT, opacity = 1, tile: TILE = TILE_DEFAULT, holes = null }) {
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
      if (r === null || (flatOnly && (r > R + 0.01 || r < R - FLAT_TOL))) return false
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
  const pruneThin = () => {
    for (let changed = true; changed;) {
      changed = false
      for (const k of [...cells.keys()]) {
        const [i, j] = k.split(',').map(Number)
        const h = (di, dj) => cells.has(key(i + di, j + dj))
        if ((!h(0, 1) && !h(0, -1)) || (!h(1, 0) && !h(-1, 0))) { cells.delete(k); changed = true }
      }
    }
  }
  pruneThin()

  // 穴を開ける：大きい穴から順に、形（HOLE_SHAPES）と場所を乱数で選んで開ける
  //   範囲の外側の縁からは 2 マス以上離す（穴のまわり 2 マスが、絵のマスか、もう開けた穴のマス）
  //   穴同士は近くてもよい（くっついたら 1 つの大きい穴になる）。ただ、開けたせいで 1 マス幅のところ（端の絵が合わない）ができるなら開けない
  if (holes) {
    const rng = Alea(holes.seed ?? 'holes')
    const holeCells = new Set()
    const thin = (i, j) => {   // 1 マス幅で飛び出したマスか（上下とも・左右とも空いている）
      const h = (di, dj) => cells.has(key(i + di, j + dj))
      return (!h(0, 1) && !h(0, -1)) || (!h(1, 0) && !h(-1, 0))
    }
    // 場所を決めた穴（holes.at）：その地点にいちばん近いマスを 1 マス開ける
    const cd = new THREE.Vector3()
    for (const p of holes.at ?? []) {
      const pd = dirOf(p.lat, p.lon)
      let best = null, bestDot = -2
      for (const k of cells.keys()) {
        const [i, j] = k.split(',').map(Number)
        const dt = dirAt((i + 0.5) * TILE, (j + 0.5) * TILE, cd).dot(pd)
        if (dt > bestDot) { bestDot = dt; best = k }
      }
      if (best && Math.acos(Math.min(1, bestDot)) * R < TILE) { cells.delete(best); holeCells.add(best) }
    }
    for (const size of ['big', 'small']) {
      const shapes = HOLE_SHAPES[size]
      for (let made = 0, tries = 0; made < (holes[size] ?? 0) && tries < 1000; tries++) {
        const list = [...cells.keys()]
        if (!list.length) break
        const [i0, j0] = list[Math.floor(rng() * list.length)].split(',').map(Number)
        const [w, hgt] = shapes[Math.floor(rng() * shapes.length)]
        let ok = true
        for (let a = -2; a < w + 2 && ok; a++) for (let b = -2; b < hgt + 2 && ok; b++) {
          const kk = key(i0 + a, j0 + b)
          const inside = a >= 0 && a < w && b >= 0 && b < hgt
          if (inside ? !cells.has(kk) : !cells.has(kk) && !holeCells.has(kk)) ok = false
        }
        if (!ok) continue
        const opened = []
        for (let a = 0; a < w; a++) for (let b = 0; b < hgt; b++) { const kk = key(i0 + a, j0 + b); cells.delete(kk); opened.push(kk) }
        for (let a = -1; a < w + 1 && ok; a++) for (let b = -1; b < hgt + 1 && ok; b++) {
          if (cells.has(key(i0 + a, j0 + b)) && thin(i0 + a, j0 + b)) ok = false
        }
        if (!ok) { for (const kk of opened) cells.set(kk, true); continue }
        for (const kk of opened) holeCells.add(kk)
        made++
      }
    }
  }

  pruneThin()   // 場所を決めた穴のせいで 1 マス幅のところができていたら消す

  // マスごとに絵を選ぶ（上下左右のマスと、へこんだ角になるななめ隣のマスを見る）。使う組み合わせだけをテクスチャに並べる
  const atlasIndex = new Map(), quartersList = []
  const cellTile = new Map()   // "i,j" → テクスチャの中の番号
  for (const k of cells.keys()) {
    const [i, j] = k.split(',').map(Number)
    const h = (di, dj) => cells.has(key(i + di, j + dj))
    const n = h(0, 1), s = h(0, -1), e = h(1, 0), w = h(-1, 0)
    const cuts = []
    if (n && w && !h(-1, 1)) cuts.push('TL')    // 左 = 西（i が減る向き）、上 = 北（j が増える向き）
    if (n && e && !h(1, 1)) cuts.push('TR')
    if (s && w && !h(-1, -1)) cuts.push('BL')
    if (s && e && !h(1, -1)) cuts.push('BR')
    const quarters = tileQuarters(tiles, n, s, e, w, cuts)
    const qk = quarters.join(',')
    if (!atlasIndex.has(qk)) { atlasIndex.set(qk, quartersList.length); quartersList.push(quarters) }
    cellTile.set(k, atlasIndex.get(qk))
  }
  const COLS = Math.max(1, Math.ceil(Math.sqrt(quartersList.length))), ROWS = Math.max(1, Math.ceil(quartersList.length / COLS))

  // マスごとに板を作る
  const pos = [], nrm = [], uv = [], index = []
  const EPS = 0.001   // テクスチャの隣の絵がにじまないよう、端を少し内側にする
  const v = new THREE.Vector3()
  for (const [k, t] of cellTile) {
    const [i, j] = k.split(',').map(Number)
    const col = t % COLS, row = Math.floor(t / COLS)   // row 0 がテクスチャの上
    const base = pos.length / 3
    for (let b = 0; b <= SUB; b++) for (let a = 0; a <= SUB; a++) {
      const gi = i * SUB + a, gj = j * SUB + b
      dirAt(gi * TILE / SUB, gj * TILE / SUB, v)
      nrm.push(v.x, v.y, v.z)
      v.multiplyScalar(vertexR(gi, gj) + LIFT)
      pos.push(v.x, v.y, v.z)
      const fs = EPS + (1 - 2 * EPS) * a / SUB, ft = EPS + (1 - 2 * EPS) * b / SUB   // 東・北へ 0〜1
      uv.push((col + fs) / COLS, (ROWS - 1 - row + ft) / ROWS)
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
    map: createAtlasTexture(tiles, quartersList, COLS, ROWS), alphaTest: 0.5 * opacity,   // 透明なドットだけ捨てる（alphaTest は opacity を掛けたあとの値と比べるので、合わせて下げる）
    ...(opacity < 1 && { transparent: true, opacity, depthWrite: false }),   // 透けるときは、重なった地面を隠さないよう深度を書かない
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.name = name
  return mesh
}
