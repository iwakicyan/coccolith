import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRasen, RASEN } from '../my-3d-parts/landmark/rasen.js'
import { BRIDGE01_SIZE } from '../my-3d-parts/landmark/bridge01.js'

// ============================================================
//  螺旋階段 2 本と、その踊り場どうしを渡す板（documents/sketch/柱.PNG の左）
//
//  踊り場（90° の扇）の終わりの縁（芯から外へまっすぐ伸びる切れ目）を、2 本とも板の進む向きと直角にそろえる
//    a の階段は上りきって踊り場の終わりの縁から板へまっすぐ出る。b の階段へは踊り場の終わりの縁から入り、そのまま下りになる
//    螺旋はどちらも同じ巻き方なので、板の中心線は a では芯の右、b では芯の左を通る（芯から踏み板の幅の真ん中の距離）
//  板は踊り場の高さ（星の中心から一定の距離）で、2 本を結ぶ大円に沿って曲げる。歩く人には水平でまっすぐに見える
//    まっすぐな板にすると、星の丸みで真ん中が 28m ほど下がり、両端が 20° の坂になるため
//
//  返すもの:
//    stairs: [a, b] それぞれ createRasen() の Group（wrapper の中で向きを決めたもの）
//    plank:  板のメッシュ（輪郭線つき）と、上を歩くための floor(dir, feetR, up) / keepOn(dir, pad)
// ============================================================

export const PLANK = {
  T: 0.3,          // 板の厚さ (m)
  SEGS: 10,        // 板の長さ方向の分割数
  OVERLAP: 0.2,    // 踊り場の上へ重ねる長さ (m)（継ぎ目にすき間が見えないように）
  DROP: 0.02,      // 板の上面を踊り場より下げる量 (m)（重ねたところがちらつかないように）
  COLOR: { plank: 0x4a4a4a, under: 0x000000, line: 0x161616 },   // under: 板の裏（下面）
  // 欄干：橋 bridge01 の柱（先端に正十二面体の玉が付いた四角柱）と同じ形・色・大きさ（coccolith では橋を 3 倍にしてあるので 3 倍）を、板の両側に並べる
  POST: { SPACING: 10, SCALE: 3, COLOR: 0x4a4a50 },
}
const BP = BRIDGE01_SIZE.POST
export const PLANK_POST_INSET = (BP.INSET + BP.ROD_W / 2) * PLANK.POST.SCALE   // 板の縁から欄干の棒の内側の面まで (m)

const MID = (RASEN.CORE_R + RASEN.R) / 2    // 踏み板の幅の真ん中の、芯からの距離
const WIDTH = RASEN.R - RASEN.CORE_R        // 板の幅 = 踏み板の幅
const LANDING_END = (() => {                // 踊り場の終わりの縁の角度（rasen.js と同じ式）
  const N = Math.round(RASEN.TURNS * RASEN.STEPS), dA = Math.PI * 2 / RASEN.STEPS
  return (N - 1) * dA + RASEN.LANDING
})()

// group: 置き先、a・b: { lat, lon }、baseR: 階段の底の、星の中心からの距離、placeOnSurface: coccolith.js の同じ名前の関数
export function createRasenPair(group, a, b, baseR, placeOnSurface) {
  const topR = baseR + RASEN.H   // 踊り場の上面の、星の中心からの距離
  const make = (at) => {
    const wrapper = new THREE.Group()
    const stair = createRasen()
    wrapper.add(stair)
    placeOnSurface(group, wrapper, at.lat, at.lon, baseR)
    wrapper.updateMatrixWorld(true)
    return { wrapper, stair, up: wrapper.position.clone().normalize() }
  }
  const A = make(a), B = make(b)

  // 板の中心線の大円（面の法線 n）。a では芯から右へ MID、b では左へ MID ずらした 2 点を通る
  //   右 = 進む向き × 上。ずらすと面が少し回るので、数回繰り返して合わせる
  let n = new THREE.Vector3().crossVectors(A.up, B.up).normalize()
  const ea = new THREE.Vector3(), eb = new THREE.Vector3()
  for (let i = 0; i < 4; i++) {
    // 大円の面の法線 n は、a から b へ進むとき左を向く（A.up × B.up）。右へずらす = -n
    const s = Math.sin(MID / topR)
    ea.copy(A.up).multiplyScalar(Math.cos(MID / topR)).addScaledVector(n, -s).normalize()
    eb.copy(B.up).multiplyScalar(Math.cos(MID / topR)).addScaledVector(n, s).normalize()
    n = new THREE.Vector3().crossVectors(ea, eb).normalize()
  }

  // 階段の向き：踊り場の終わりの縁（角度 LANDING_END の向き）を、芯から板の中心線の点へ向ける
  //   a は右（-n）、b は左（+n）。ローカルの角度 a の向きは (cos a, 0, -sin a)、rotation.y = θ で角度が θ 増える
  const aim = (S, side) => {
    const to = n.clone().multiplyScalar(side)
    to.addScaledVector(S.up, -to.dot(S.up)).applyQuaternion(S.wrapper.quaternion.clone().invert())
    S.stair.rotation.y = Math.atan2(-to.z, to.x) - LANDING_END
    S.stair.updateMatrixWorld(true)
  }
  aim(A, -1)
  aim(B, 1)

  // 板：ea から eb まで、大円に沿って星の中心から topR（上面）。幅 WIDTH、厚さ T
  const u0 = ea.clone(), u1 = new THREE.Vector3().crossVectors(n, ea).normalize()   // 大円の面の中の、ea と、ea から eb へ進む向き
  const span = ea.angleTo(eb)
  const ov = PLANK.OVERLAP / topR
  const phi0 = -ov, phi1 = span + ov
  const M = PLANK.SEGS
  const beta = (WIDTH / 2) / topR   // 幅の半分の角度
  const rTop = topR - PLANK.DROP, rBot = rTop - PLANK.T
  const pos = [], idx = [], under = []   // under: 板の裏（下面）の三角形
  const c = new THREE.Vector3(), d = new THREE.Vector3()
  for (let k = 0; k <= M; k++) {
    const phi = phi0 + (phi1 - phi0) * k / M
    c.copy(u0).multiplyScalar(Math.cos(phi)).addScaledVector(u1, Math.sin(phi))
    // 断面の 4 隅：左上・右上・右下・左下（左 = +n）
    for (const [side, r] of [[1, rTop], [-1, rTop], [-1, rBot], [1, rBot]]) {
      d.copy(c).multiplyScalar(Math.cos(beta)).addScaledVector(n, side * Math.sin(beta)).multiplyScalar(r)
      pos.push(d.x, d.y, d.z)
    }
  }
  for (let k = 0; k < M; k++) {
    const p = k * 4, q = p + 4
    for (let e = 0; e < 4; e++) { const e1 = (e + 1) % 4; (e === 2 ? under : idx).push(p + e, p + e1, q + e1, p + e, q + e1, q + e) }   // e = 2: 右下→左下 = 裏
  }
  idx.push(0, 2, 1, 0, 3, 2)
  const L = M * 4; idx.push(L, L + 1, L + 2, L, L + 2, L + 3)
  const indexed = new THREE.BufferGeometry()
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  indexed.setIndex([...idx, ...under])
  indexed.addGroup(0, idx.length, 0)                // 上面・側面・両端
  indexed.addGroup(idx.length, under.length, 1)     // 裏
  const geo = indexed.toNonIndexed()
  // 法線はぜんぶ星の外向き（地面と同じ当たり方）。板は昼と夜の境をまたぐので、夜の側で下から太陽が当たって裏が光らないように
  {
    const p = geo.attributes.position, nrm = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      d.fromBufferAttribute(p, i).normalize()
      nrm.set([d.x, d.y, d.z], i * 3)
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  }
  const mesh = new THREE.Mesh(geo, [
    new THREE.MeshLambertMaterial({ color: PLANK.COLOR.plank }),
    new THREE.MeshLambertMaterial({ color: PLANK.COLOR.under }),
  ])
  mesh.name = '螺旋階段の板'
  const line = new THREE.LineSegments(new THREE.EdgesGeometry(indexed, 20), new THREE.LineBasicMaterial({ color: PLANK.COLOR.line }))
  line.userData.outline = true
  mesh.add(line)
  group.add(mesh)

  // 欄干：板の両側の縁から INSET だけ内側に、SPACING ごとに星の外向きに立てる（ea から eb まで）
  //   全部で 60 本ほど。1 つのメッシュにまとめる。昼と夜の境をまたぐので、夜の側（x < 0）の棒は法線を星の外向きにして
  //   下から当たる太陽で光らないようにする（昼の側は面ごとの平らな陰影）
  {
    const k = PLANK.POST.SCALE
    const rod = new THREE.BoxGeometry(BP.ROD_W * k, BP.ROD_L * k, BP.ROD_W * k).translate(0, (BP.ROD_L / 2 - BP.SINK) * k, 0)
    const knob = new THREE.DodecahedronGeometry(BP.KNOB_R * k).translate(0, (BP.ROD_L - BP.SINK) * k, 0)
    const post = mergeGeometries([rod.toNonIndexed(), knob])   // 正十二面体は初めから頂点を面ごとに分けてある
    post.deleteAttribute('uv')
    const sideAng = (WIDTH / 2 - BP.INSET * k) / topR
    const count = Math.floor(span * topR / PLANK.POST.SPACING)
    const geos = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1)
    for (let i = 0; i <= count; i++) {
      const phi = span * i / count
      c.copy(u0).multiplyScalar(Math.cos(phi)).addScaledVector(u1, Math.sin(phi))
      for (const sd of [1, -1]) {
        d.copy(c).multiplyScalar(Math.cos(sideAng)).addScaledVector(n, sd * Math.sin(sideAng)).normalize()
        const up = d.clone()
        q.setFromUnitVectors(yAxis, up)
        // 棒の面を板の向きにそろえる（棒のローカル z を板の進む向きへ）
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q), along = new THREE.Vector3().crossVectors(n, up).normalize()
        const twist = Math.atan2(new THREE.Vector3().crossVectors(fwd, along).dot(up), fwd.dot(along))
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(up, twist))
        m.compose(d.clone().multiplyScalar(rTop), q, one)
        const g = post.clone().applyMatrix4(m)
        if (up.x < 0) {
          const nr = g.attributes.normal
          for (let j = 0; j < nr.count; j++) nr.setXYZ(j, up.x, up.y, up.z)
        }
        geos.push(g)
      }
    }
    const posts = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: PLANK.POST.COLOR }))
    posts.name = '螺旋階段の板の欄干'
    posts.castShadow = true
    group.add(posts)
  }

  // 板の上を歩く
  //   floor(dir, feetR, up): dir の向きの板の上面の、星の中心からの距離。板の外か、足（feetR）から up より高ければ null
  //   keepOn(dir, pad): 板の左右の縁から pad (m) の内側へ dir を戻す（戻したら true）
  const halfAng = beta
  const floor = (dir, feetR, up) => {
    const side = Math.asin(Math.max(-1, Math.min(1, dir.dot(n))))
    if (Math.abs(side) > halfAng) return null
    const phi = Math.atan2(dir.dot(u1), dir.dot(u0))
    if (phi < phi0 || phi > phi1) return null
    return rTop <= feetR + up ? rTop : null
  }
  // side(dir): 中心線から左（+）右（-）への角度 / setSide(dir, side): dir をその角度へ寄せる / along(dir, out): ea から eb へ進む向き（大円に沿う）
  const side = dir => Math.asin(Math.max(-1, Math.min(1, dir.dot(n))))
  const setSide = (dir, a) => {
    const flat = d.copy(dir).addScaledVector(n, -dir.dot(n)).normalize()
    dir.copy(flat).multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a)).normalize()
  }
  const along = (dir, out) => out.crossVectors(n, dir).normalize()
  const keepOn = (dir, pad) => {
    const max = halfAng - pad / topR
    const side = Math.asin(Math.max(-1, Math.min(1, dir.dot(n))))
    if (Math.abs(side) <= max) return false
    const flat = d.copy(dir).addScaledVector(n, -dir.dot(n)).normalize()
    dir.copy(flat).multiplyScalar(Math.cos(max)).addScaledVector(n, Math.sign(side) * Math.sin(max)).normalize()
    return true
  }

  return { stairs: [A.stair, B.stair], wrappers: [A.wrapper, B.wrapper], plank: { mesh, floor, keepOn, side, setSide, along } }
}
