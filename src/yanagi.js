import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// ============================================================
//  光の粒のヤナギ：垂れた枝（すだれ）を、クラゲの触手（kurage.js）と同じ「光の粒を数珠つなぎにして、上から下へ遅れて波がなびく」作りで描いたヤナギの木
//  すだれは光の粒で描き、色を足し合わせて光らせる（AdditiveBlending）。幹と枝はふつうの形（先ほど細くなる管）
//    幹：TRUNK_H (m) の高さまで、少し傾けて曲げる
//    枝：幹の上の方から BRANCHES 本、外へのびて先が垂れる弧
//    すだれ：枝に沿って STRAND_GAP (m) ごとに 1 本垂らす。1 本 STRAND_DOTS 粒（本ごとにまちまち）を DOT_GAP (m) おきに。先は地面から CLEAR (m) より下へは垂らさない
//    ゆれ：風で、下（先）ほど大きくゆれる。上の時刻を遅れてなぞるので、波が上から下へ伝わる（シェーダーで時刻から計算）
//    よける：sabちゃんが入ると、すだれが 1 本ずつばねでふわっと押しのけられ、出ると揺れながら戻る（JS で毎フレーム、近いときだけ）
//  位置はヤナギの根元を原点、上を +y にしたローカル座標で作り、根元の地面に置く
// ============================================================

const TRUNK_H    = 5.1            // 幹の高さ (m)
const TRUNK_R    = [0.22, 0.12]   // 幹の太さ（根元・上）(m)
const TRUNK_BEND = 0.7            // 幹の曲がり（真ん中あたりで、まっすぐからずれる幅）(m)
const BRANCHES   = 7              // 枝の数
const BRANCH_L   = [2.2, 3.4]     // 枝ののびる長さ（横に）(m)
const BRANCH_Y   = [2.6, 5.2]     // 枝の出る高さ (m)
const STRAND_GAP = 0.6            // すだれを垂らす間隔（枝に沿って）(m)
const STRAND_DOTS = [6, 10]       // すだれ 1 本の粒の数（本ごとにこの間で選ぶ。粒が多いほど長い）
const DOT_GAP    = 0.45           // すだれの粒の間隔 (m)。地面に届いてしまうときは詰める
const LEAF_TAPER = [1.25, 0.7]    // すだれの粒の大きさの倍率（いちばん上・いちばん下）。あいだはなめらかに変える
const LEAF_HARD  = 0.5            // すだれの粒の硬さ（0 = ふんわりぼかす / 1 = ふちまでくっきり）
const LEAF_SIZE  = 0.34           // すだれの粒の大きさ (m)
const CLEAR      = 0.15           // すだれの先は、地面からこれより下へは垂らさない (m)
const SWAY       = 0.07           // ゆれの大きさ（垂れた長さ (m) の 1.3 乗に掛ける）
const LAG        = 0.55           // 1m 下がるごとのゆれの遅れ (rad)
const PUSH_R     = 0.8            // sabちゃんの真ん中からこれより近いすだれを押しのける (m)
const PUSH_NEAR  = 12             // sabちゃんがこれより遠いときは、押しのけの計算をしない (m)
const SPRING     = 30             // 押しのけのばねの強さ
const DAMP       = 5              // 押しのけのばねの減り方（小さいほど戻るときに揺れる）
const LEAF_COLORS = [0x8aff9d, 0xb3ff7e, 0x76f4ba, 0xcbff90]   // すだれの色（すだれごとに選ぶ）
const WOOD_COLOR  = 0x5e4838      // 幹と枝の色
const BRANCH_R    = [0.07, 0.025] // 枝の太さ（付け根・先）(m)

const rand = ([a, b]) => a + Math.random() * (b - a)
const f2 = v => v.toFixed(3)

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixel;   // 画面の高さ / (2 tan(fov/2))。m の大きさを画面のピクセルにする
  attribute vec3 aBase;   // 粒のもとの位置（ローカル）。すだれは垂らす所から t だけ下
  attribute vec4 aInfo;   // x: 1 = すだれ, y: すだれの垂れた長さ t (m), z: ゆれの位相, w: 粒の大きさ (m)
  attribute vec3 aPush;   // すだれの押しのけ（x, z）と、押しのけがいっぱいになる垂れた長さ（y）
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = aBase;
    float t = aInfo.y, ph = aInfo.z;
    {
      // 風のゆれ：先ほど大きく、上から遅れて波が下へ伝わる
      float a = ${f2(SWAY)} * pow(t, 1.3);
      float tt = uTime - t * ${f2(LAG)};
      p.x += a * (0.7 * sin(tt * 0.8 + ph) + 0.3 * sin(tt * 1.7 + ph * 2.3));
      p.z += a * 0.5 * sin(tt * 1.1 + ph * 3.1);
      // 押しのけ：垂らす所は動かず、sabちゃんの頭の高さまででいっぱいになる
      float w = smoothstep(0.0, 1.0, clamp(t / max(aPush.y, 0.3), 0.0, 1.0));
      p.x += aPush.x * w;
      p.z += aPush.z * w;
      vAlpha = 0.55 * (1.0 - 0.35 * smoothstep(0.0, 4.0, t));
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aInfo.w * uPixel / -mv.z;
    vColor = aColor;
  }
`
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // やや硬めの粒：真ん中ほど明るい丸いぼかし（クラゲの触手の粒）と、ふちの近くまで同じ明るさの硬い粒の、ちょうど半分ずつ
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = length(q), d = r * r;
    if (r > 1.0) discard;
    float soft = (1.0 - d) * (1.0 - d);
    float hard = (1.0 - smoothstep(0.6, 1.0, r)) * (0.85 + 0.15 * (1.0 - r));
    float glow = mix(soft, hard, ${f2(LEAF_HARD)});
    gl_FragColor = vec4(vColor * glow * vAlpha, 1.0);
  }
`

// dir: 根元の向き（星の中心から。長さ 1）/ ground: 根元の地面の高さ（星の中心から m）
export function createYanagi({ scene, dir, ground }) {
  const base = [], info = [], color = [], strands = []
  const c = new THREE.Color()
  const dot = (x, y, z, kind, t, ph, size, col) => {
    base.push(x, y, z); info.push(kind, t, ph, size)
    c.set(col); color.push(c.r, c.g, c.b)
  }

  // 幹と枝の形：曲線に沿った管を、付け根 r0 から先 r1 へ細くする
  const woodGeos = []
  // ローポリ：長さ方向 seg 区切り・まわり rad 角（面はフラットに塗る）
  const tube = (pts, r0, r1, seg, rad) => {
    const curve = new THREE.CatmullRomCurve3(pts)
    const g = new THREE.TubeGeometry(curve, seg, 1, rad, false)
    const pos = g.attributes.position, ctr = new THREE.Vector3(), v = new THREE.Vector3()
    for (let n = 0; n < pos.count; n++) {
      const u = Math.floor(n / (rad + 1)) / seg
      curve.getPointAt(u, ctr)
      v.fromBufferAttribute(pos, n).sub(ctr).multiplyScalar(r0 + (r1 - r0) * u).add(ctr)
      pos.setXYZ(n, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    woodGeos.push(g)
  }
  // 幹：少し傾けて曲げる（根元は地面に少し埋める）
  const lean = Math.random() * Math.PI * 2
  const trunkAt = y => { const b = TRUNK_BEND * Math.sin(y / TRUNK_H * Math.PI * 0.8); return [Math.cos(lean) * b, Math.sin(lean) * b] }
  {
    const pts = []
    for (let k = 0; k <= 8; k++) { const y = -0.2 + (TRUNK_H + 0.4) * k / 8; const [bx, bz] = trunkAt(y); pts.push(new THREE.Vector3(bx, y, bz)) }
    tube(pts, TRUNK_R[0], TRUNK_R[1], 4, 5)
  }

  // 枝：外へのびて先が垂れる弧。枝に沿ってすだれを垂らす
  const a0 = Math.random() * Math.PI * 2
  for (let b = 0; b < BRANCHES; b++) {
    const ang = a0 + (b + (Math.random() - 0.5) * 0.5) * Math.PI * 2 / BRANCHES
    const L = rand(BRANCH_L), y0 = rand(BRANCH_Y), rise = 0.9 + Math.random() * 0.9
    const [bx, bz] = trunkAt(y0)
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const at = u => [bx + ca * L * u, y0 + rise * (2.2 * u - 1.8 * u * u), bz + sa * L * u]   // 上がってから先が垂れる
    const len = Math.hypot(L, rise)
    tube(Array.from({ length: 8 }, (_, k) => new THREE.Vector3(...at(k / 7))), BRANCH_R[0], BRANCH_R[1], 3, 4)
    // すだれ
    for (let s = len * 0.2; s <= len; s += STRAND_GAP) {
      const [x0, y0s, z0] = at(s / len)
      // 枝のまわりに少し散らす
      const x = x0 + (Math.random() - 0.5) * 0.25, z = z0 + (Math.random() - 0.5) * 0.25
      const nDots = STRAND_DOTS[0] + Math.floor(Math.random() * (STRAND_DOTS[1] - STRAND_DOTS[0] + 1))
      const L2 = Math.min((nDots - 1) * DOT_GAP, y0s - CLEAR), bottom = y0s - L2
      const ph = Math.random() * Math.PI * 2
      const col = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]
      const first = base.length / 3
      for (let k = 0; k < nDots; k++) { const t = L2 * k / (nDots - 1); const u = k / (nDots - 1); dot(x, y0s - t, z, 1, t, ph, LEAF_SIZE * (LEAF_TAPER[0] + (LEAF_TAPER[1] - LEAF_TAPER[0]) * u), col) }
      strands.push({ x, z, top: y0s, bottom, first, count: base.length / 3 - first, ox: 0, oz: 0, vx: 0, vz: 0, hinge: 1 })
    }
  }

  const total = base.length / 3
  const push = new Float32Array(total * 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3))   // 見えるかどうかの判定に使う（描く位置はシェーダーで決める）
  geo.setAttribute('aBase', new THREE.BufferAttribute(new Float32Array(base), 3))
  geo.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(info), 4))
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(color), 3))
  const pushAttr = new THREE.BufferAttribute(push, 3).setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aPush', pushAttr)
  geo.computeBoundingSphere()
  geo.boundingSphere.radius += 1.5   // ゆれ・押しのけの分

  const uniforms = { uTime: { value: 0 }, uPixel: { value: 500 } }
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.name = '光の粒のヤナギ（すだれ）'

  const wood = new THREE.Mesh(mergeGeometries(woodGeos), new THREE.MeshLambertMaterial({ color: WOOD_COLOR, flatShading: true }))
  for (const g of woodGeos) g.dispose()
  wood.name = 'ヤナギの幹と枝'
  wood.castShadow = wood.receiveShadow = true

  const group = new THREE.Group()
  group.name = '光の粒のヤナギ'
  group.add(wood, points)
  group.position.copy(dir).multiplyScalar(ground)
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  scene.add(group)
  group.updateMatrixWorld(true)
  const toLocal = group.matrixWorld.clone().invert()

  const _size = new THREE.Vector2(), _feet = new THREE.Vector3(), _top = new THREE.Vector3()
  let moving = false   // 押しのけたすだれがまだ動いているか
  // timeSec: 秒 / dt: 前のフレームからの秒 / camera・renderer: 粒の大きさを画面に合わせる
  // sabFeet・sabTop: sabちゃんの足先と頭のてっぺんの位置（ワールド）
  function update(timeSec, dt, camera, renderer, sabFeet, sabTop) {
    uniforms.uTime.value = timeSec
    renderer.getDrawingBufferSize(_size)
    uniforms.uPixel.value = _size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))

    _feet.copy(sabFeet).applyMatrix4(toLocal)
    _top.copy(sabTop).applyMatrix4(toLocal)
    const near = Math.hypot(_feet.x, _feet.z) < PUSH_NEAR
    if (!near && !moving) return
    dt = Math.min(dt, 0.05)
    const sx = (_feet.x + _top.x) / 2, sz = (_feet.z + _top.z) / 2
    moving = false
    for (const S of strands) {
      // 押しのける先：sabちゃんの真ん中から PUSH_R の所まで（sabちゃんの高さがすだれの高さと重なるときだけ）
      let tx = 0, tz = 0
      if (near && _top.y > S.bottom - 0.1 && _feet.y < S.top) {
        let dx = S.x - sx, dz = S.z - sz
        const d = Math.hypot(dx, dz)
        if (d < PUSH_R) {
          if (d < 1e-3) { dx = S.x; dz = S.z } else { dx /= d; dz /= d }
          const n = Math.hypot(dx, dz) || 1
          tx = dx / n * (PUSH_R - d); tz = dz / n * (PUSH_R - d)
          S.hinge = Math.max(0.3, S.top - _top.y)
        }
      }
      // ばねでふわっと寄せる（戻るときは少し揺れる）
      S.vx += ((tx - S.ox) * SPRING - S.vx * DAMP) * dt
      S.vz += ((tz - S.oz) * SPRING - S.vz * DAMP) * dt
      S.ox += S.vx * dt; S.oz += S.vz * dt
      if (Math.abs(S.ox) + Math.abs(S.oz) + Math.abs(S.vx) + Math.abs(S.vz) > 1e-3) moving = true
      else { S.ox = S.oz = S.vx = S.vz = 0 }
      for (let k = 0; k < S.count; k++) {
        const o = (S.first + k) * 3
        push[o] = S.ox; push[o + 1] = S.hinge; push[o + 2] = S.oz
      }
    }
    pushAttr.needsUpdate = true
  }
  return { group, update }
}
