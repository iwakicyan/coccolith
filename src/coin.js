import * as THREE from 'three'

// ============================================================
//  coin — 猫エンブレムのメタリックコイン（ローポリ）
//  my-3d-parts/workspace/coin.html より Three.js 単体版として移植
//
//  createCoin({ renderer, radius })
//    renderer: 金属の映り込み用 envMap を作るのに使う（省略時は映り込みなし）
//    radius:   コインの半径 (m)
//  コインは XY 平面に立ち、表面が +Z を向く。厚みの中心が原点。
// ============================================================

const RING_COLOR   = 0xf4c46a  // 外周リング（明るい金）
const EMBLEM_COLOR = 0xc99a48  // 彫り込まれたエンブレム（濃い金）
const LINE_COLOR   = 0x444444

const R_IN   = 0.65   // 中央の円孔の半径（エンブレム単位: 頭の半径 = 1）
const COIN_R = 1.46   // コインの半径
const COIN_T = 0.30   // コインの厚み
const RECESS = 0.10   // エンブレムの彫り込みの深さ（表裏とも）
const EMBLEM_Y = -0.2 / 3  // コイン中心に対するエンブレムのずれ
const DISC_SEG  = 12  // 外側の円の頂点数
const CURVE_SEG = 4   // 頭の上辺（曲線）の分割数

const deg = Math.PI / 180

// 金属の映り込み用の環境マップ（空・床のグラデーション + 明るいパネル）。renderer ごとに1回だけ作る
const envCache = new WeakMap()
export function getMetalEnv(renderer) {   // 看板のフレームなど、ほかの金属にも使う
  if (!renderer) return null
  if (envCache.has(renderer)) return envCache.get(renderer)
  const env = new THREE.Scene()
  const sky = new THREE.SphereGeometry(10, 32, 16)
  const cols = [], c = new THREE.Color(), top = new THREE.Color(0xfff6e8), pos = sky.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 10  // -1(下)〜1(上)
    c.setHex(0x6a5e52).lerp(top, THREE.MathUtils.smoothstep(t, -0.6, 0.3))
    cols.push(c.r, c.g, c.b)
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })))
  ;[[5, 6, 4], [-6, 3, -3], [0, -2, 7]].forEach(([x, y, z], i) => {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 2),
      new THREE.MeshBasicMaterial({ color: i === 2 ? 0x888888 : 0xffffff, side: THREE.DoubleSide }),
    )
    panel.position.set(x, y, z)
    panel.lookAt(0, 0, 0)
    env.add(panel)
  })
  const pmrem = new THREE.PMREMGenerator(renderer)
  const tex = pmrem.fromScene(env, 0.02).texture
  pmrem.dispose()
  envCache.set(renderer, tex)
  return tex
}

export function createCoin({ renderer = null, radius = 4.38 } = {}) {
  const S = radius / COIN_R
  const V = (x, y) => new THREE.Vector2(x * S, (y + EMBLEM_Y) * S)
  const arc = (r, a0, a1, n, cx = 0, cy = 0) => {
    const pts = []
    for (let i = 0; i <= n; i++) {
      const a = (a0 + (a1 - a0) * i / n) * deg
      pts.push(V(cx + r * Math.cos(a), cy + r * Math.sin(a)))
    }
    return pts
  }

  // 上の穴: 円孔から 斜め上の2本の腕・中央の玉・ジグザグの山形 を除いた形
  function upperHole() {
    const W = 0.14, D = 0.37  // 腕の半幅・腕先の中心からの距離
    const armA = Math.asin(W / R_IN) / deg
    const arm = (ang) => {
      const a = ang * deg, ux = Math.cos(a), uy = Math.sin(a), nx = -Math.sin(a), ny = Math.cos(a)
      return [V(D * ux - W * nx, D * uy - W * ny), V(D * ux + W * nx, D * uy + W * ny)]
    }
    const aR = Math.atan2(-0.19, 0.63) / deg, aL = 180 - aR
    return [
      ...arc(R_IN, aR, 45 - armA, 3), ...arm(45),
      ...arc(R_IN, 45 + armA, 135 - armA, 4), ...arm(135),
      ...arc(R_IN, 135 + armA, aL, 3),
      V(-0.43, -0.10), V(-0.36, -0.22),
      ...arc(0.12, 210, -30, 6, 0, 0.03),  // 中央の玉の上側
      V(0.36, -0.22), V(0.43, -0.10),
    ]
  }

  // 下の穴: 山形の下側（頂点から円孔までの扇形）
  function lowerHole() {
    const ay = -0.276, dx = 0.372, dy = -0.276, len = Math.hypot(dx, dy)
    const ux = dx / len, uy = dy / len, b = ay * uy
    const t = -b + Math.sqrt(b * b - (ay * ay - R_IN * R_IN))
    const aP = Math.atan2(ay + t * uy, t * ux) / deg
    return [V(0, ay), ...arc(R_IN, aP, -180 - aP, 4)]
  }

  const earL = [V(-0.81, 0.75), V(-0.59, 0.76), V(-0.79, 0.54)]
  const earR = earL.map((p) => new THREE.Vector2(-p.x, p.y)).reverse()
  const holes = () => [upperHole(), lowerHole(), earL, earR].map((p) => new THREE.Path(p))

  // 猫の頭の輪郭
  const head = new THREE.Shape(arc(1, 15, -195, 8))
  const top = V(1.0, 0.94), ctrl = V(0, 1.06)
  head.lineTo(-top.x, top.y)
  head.quadraticCurveTo(ctrl.x, ctrl.y, top.x, top.y)
  head.closePath()
  head.holes = holes()

  // 外周リング: 多角形の円盤を猫の頭の形にくり抜く
  const disc = new THREE.Shape(Array.from({ length: DISC_SEG }, (_, i) => {
    const a = i / DISC_SEG * Math.PI * 2
    return new THREE.Vector2(COIN_R * S * Math.cos(a), COIN_R * S * Math.sin(a))
  }))
  disc.holes = [new THREE.Path(head.getPoints(CURVE_SEG))]

  const group = new THREE.Group()
  group.name = 'coin'
  const envMap = getMetalEnv(renderer)
  const lineMat = new THREE.LineBasicMaterial({ color: LINE_COLOR })
  function part(shape, depth, color, roughness, z) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: CURVE_SEG })
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, metalness: 1, roughness, envMap, envMapIntensity: 1.2, flatShading: true,
    }))
    mesh.position.z = z
    mesh.castShadow = true
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), lineMat))
    group.add(mesh)
  }
  part(disc, COIN_T * S, RING_COLOR, 0.12, -COIN_T / 2 * S)                       // 外周リング
  part(head, (COIN_T - 2 * RECESS) * S, EMBLEM_COLOR, 0.28, (RECESS - COIN_T / 2) * S)  // 表裏から彫り込まれたエンブレム
  return group
}
