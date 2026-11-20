import * as THREE from 'three'
import { createMicroraptor, createMicroraptorFlight, MICRORAPTOR_FLIGHT } from '../my-3d-parts/parts/microraptor.js'

// ============================================================
//  螺旋階段の板にとまるミクロラプトル（my-3d-parts/parts/microraptor.js）
//  1 時間ごとに、はじめの PERCH_S 秒（5 分）は板の真ん中にとまり、残り FLY_S 秒（55 分）は星を広く飛び回って、また板に戻る
//    時計（Date.now）で決めるので、いつ開いても・だれが見ても同じ所にいる（毎時 0〜5 分に板の上）
//    とまる所: 板の中心線の真ん中。板に直角（a から b へ進むときの左）を向く
//    飛ぶ道: とまる所を通り、正面へ進む大円を LAPS 周する。そのあいだ、道に直角に SWAY まで左右へ WAVES 回ゆれて星を広く回る
//      （ゆれは飛び立ちと降りる前は小さくして、板に直角に出入りする）。終わりはもとの所へ同じ向きで戻る
//      高さは板の上面のまま。飛び立ってから CLIMB_D 進むあいだに FLY_UP だけ上がり（欄干・芯柱の上を越す）、戻りは同じだけ下りる
//    飛ぶあいだは部品の飛ぶ動き（羽ばたき・体を傾けて浮く など）。降りる直前に着地の動き（降りて、うなずいて止まる）
//  createMicroraptorTour({ plank, height }) → { group, update(time) }
//    plank: rasenPair.plank（path に板の中心線）。group は板と同じ置き先（plank.mesh.parent）に入れる
// ============================================================

export const MICRORAPTOR_TOUR = {
  HEIGHT: 8,                  // 全体の高さ (m)
  PERCH_S: 5 * 60,            // 板にとまっている時間 (s)
  FLY_S: 55 * 60,             // 飛び回る時間 (s)
  ACCEL_S: 8,                 // 飛び立ちで速さが上がりきるまで・降りる前に止まるまでの時間 (s)
  LAPS: 6,                    // 大円を回る周の数
  WAVES: 13,                  // 左右へゆれる回数（LAPS と割り切れない数にして、周ごとに違う所を通る）
  SWAY: 50 * Math.PI / 180,   // 左右へゆれる大きさ（星の中心から見た角度）
  FLY_UP: 6,                  // 飛ぶときに板の上面から上がる高さ (m)
  CLIMB_D: 40,                // 飛び立ってから FLY_UP まで上がるあいだに進む距離 (m)。降りるときも同じ
}

// t 秒でどれだけ進んだか（0〜1）。始めの a 秒で速さが上がり、終わりの a 秒で止まる。あいだは同じ速さ（birdFlight.js と同じ）
const progress = (t, T, a) => {
  const v = 1 / (T - a)
  if (t < a) return v * t * t / (2 * a)
  if (t > T - a) { const u = T - t; return 1 - v * u * u / (2 * a) }
  return v * (t - a / 2)
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export function createMicroraptorTour({ plank, height = MICRORAPTOR_TOUR.HEIGHT }) {
  const C = MICRORAPTOR_TOUR
  const { u0, u1, n, span, surfR } = plank.path

  // とまる所：板の中心線の真ん中。up0 = 星の中心からの向き、F = 正面（板に直角）、G = 大円を回す軸（up0 を F のほうへ回す）
  const phi = span / 2
  const up0 = u0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(u1, Math.sin(phi)).normalize()
  const R0 = surfR(phi)
  const F = n.clone().addScaledVector(up0, -n.dot(up0)).normalize()
  const G = new THREE.Vector3().crossVectors(up0, F).normalize()

  // 道（s = 0〜1）の向き。s = 0 と 1 で up0 に戻り、どちらも F の向きに進む
  const dirAt = (s, out) => {
    const th = 2 * Math.PI * C.LAPS * s
    const b = C.SWAY * Math.sin(2 * Math.PI * C.WAVES * s) * Math.sin(Math.PI * s)
    return out.copy(up0).multiplyScalar(Math.cos(th)).addScaledVector(F, Math.sin(th))
      .multiplyScalar(Math.cos(b)).addScaledVector(G, Math.sin(b)).normalize()
  }
  // 道の長さ（高さは R0 で測る）
  const LEN = (() => {
    const N = 4000, a = new THREE.Vector3(), b = new THREE.Vector3()
    let len = 0; dirAt(0, a)
    for (let i = 1; i <= N; i++) { dirAt(i / N, b); len += a.angleTo(b) * R0; a.copy(b) }
    return len
  })()

  const raptor = createMicroraptor({ height })
  const flight = createMicroraptorFlight(raptor)
  const group = new THREE.Group(); group.name = 'ミクロラプトル'
  group.matrixAutoUpdate = false
  group.add(raptor)
  plank.mesh.parent.add(group)

  const dir = new THREE.Vector3(), ahead = new THREE.Vector3(), fwd = new THREE.Vector3(), x = new THREE.Vector3(), basis = new THREE.Matrix4()
  const LAND = MICRORAPTOR_FLIGHT.LAND
  const place = (s, r) => {
    dirAt(s, dir)
    if (s < 1 - 1e-4) { dirAt(s + 1e-4, ahead); fwd.subVectors(ahead, dir) } else fwd.copy(F)
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize()
    if (fwd.lengthSq() < 0.5) fwd.copy(F)
    x.crossVectors(dir, fwd).normalize()
    basis.makeBasis(x, dir, fwd).setPosition(dir.x * r, dir.y * r, dir.z * r)
    group.matrix.copy(basis)
    group.matrixWorldNeedsUpdate = true
  }

  // time: 部品の動きに渡す時間（秒。performance.now() / 1000）。どこにいるかは時計（Date.now）で決める
  const update = (time = performance.now() / 1000) => {
    const tt = (Date.now() / 1000) % (C.PERCH_S + C.FLY_S)
    if (tt < C.PERCH_S) {   // 板にとまっている
      if (flight.flying && !flight.landing) flight.stop()
      flight.update(time)
      place(0, R0)
      return
    }
    const tf = tt - C.PERCH_S
    if (!flight.flying && tf < C.FLY_S - LAND) flight.start(time - tf)                    // 飛び立つ（途中から開いたときは飛んでいる姿勢から）
    if (flight.flying && !flight.landing && tf >= C.FLY_S - LAND) flight.land(time - (tf - (C.FLY_S - LAND)))   // 降りる直前に着地の動き
    flight.update(time)
    const s = progress(tf, C.FLY_S, C.ACCEL_S), d = s * LEN
    const r = R0 + C.FLY_UP * smooth(0, C.CLIMB_D, d) * smooth(0, C.CLIMB_D, LEN - d)
    place(s, r)
  }
  update()
  return { group, update, length: LEN }
}
