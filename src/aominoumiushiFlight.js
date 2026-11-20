import * as THREE from 'three'
import { createAominoumiushiSwarm, AOMINOUMIUSHI_FLAP } from '../my-3d-parts/parts/aominoumiushi.js'

// ============================================================
//  螺旋階段の板の欄干にとまるアオミノウミウシの群れ（my-3d-parts/parts/aominoumiushi.js）
//  COUNT 匹が 1 匹ずつ別の柱の玉の上にとまる（左右の欄干に半分ずつ、間をあけて互い違いに）
//  CYCLE（50 分）ごとに、はじめの PERCH_S 秒（10 分）は玉の上で羽を止めて休み、残り FLY_S 秒（40 分）は星を周遊して、またもとの玉に戻る
//    時計（Date.now）で決めるので、いつ開いても・だれが見ても同じ所にいる。とまる時刻は 1 匹ずつ 50 分の中でばらばらにずらす（いつ見ても何匹かとまっている）
//    とまる所: 柱の玉のてっぺん。板から外向き（左の欄干は左、右は右）を ±HEADING まで振った向きを向く
//    飛ぶ道: とまる所を通り、正面へ進む大円を LAPS 周する（microraptorFlight.js と同じ作り）。そのあいだ、道に直角に SWAY まで左右へ WAVES 回ゆれる
//      周の数・ゆれ・高さ・向きは 1 匹ずつ変えて、星じゅうに散らばる。終わりはもとの所へ同じ向きで戻る
//      飛び立ってから CLIMB_D 進むあいだに FLY_UP だけ上がり、戻りは同じだけ下りる
//    飛ぶあいだは部品の羽ばたき（飛び立ちで強くなり、降りる前に弱めて止める）
//  まとめて描く（InstancedMesh 5 つ。何匹でも描画 5 回）
//  createAominoumiushiTour({ plank }) → { group, update(time) }
//    plank: rasenPair.plank（posts に欄干の柱の玉、path.n に板の左）。group は板と同じ置き先（plank.mesh.parent）に入れる
// ============================================================

export const AOMINOUMIUSHI_TOUR = {
  COUNT: 20,                    // 匹の数
  WIDTH: 2,                     // 羽を広げた幅 (m)
  PERCH_S: 10 * 60,             // 玉の上で休む時間 (s)
  FLY_S: 40 * 60,               // 周遊する時間 (s)
  ACCEL_S: 8,                   // 飛び立ちで速さが上がりきるまで・降りる前に止まるまでの時間 (s)
  FLAP_IN: 1.5,                 // 飛び立ってから羽ばたきが強くなりきるまで (s)
  FLAP_OUT: 3,                  // 降りる前に羽ばたきを弱めて止めるまで (s)
  LAPS: [2, 4],                 // 大円を回る周の数（1 匹ずつこの間の整数）
  WAVES: [5, 11],               // 左右へゆれる回数（1 匹ずつこの間の整数）
  SWAY: [25, 60],               // 左右へゆれる大きさ（星の中心から見た角度。度）
  FLY_UP: [12, 30],             // 飛ぶときに玉の上から上がる高さ (m)
  HEADING: 50,                  // とまる向き・飛び立つ向きを板から外向きから振る最大（度）
  CLIMB_D: 60,                  // 飛び立ってから FLY_UP まで上がるあいだに進む距離 (m)。降りるときも同じ
}

// t 秒でどれだけ進んだか（0〜1）。始めの a 秒で速さが上がり、終わりの a 秒で止まる。あいだは同じ速さ（microraptorFlight.js と同じ）
const progress = (t, T, a) => {
  const v = 1 / (T - a)
  if (t < a) return v * t * t / (2 * a)
  if (t > T - a) { const u = T - t; return 1 - v * u * u / (2 * a) }
  return v * (t - a / 2)
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
// 決まった並びの乱数（seed ごとに同じ）
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const DEG = Math.PI / 180

export function createAominoumiushiTour({ plank, count = AOMINOUMIUSHI_TOUR.COUNT, width = AOMINOUMIUSHI_TOUR.WIDTH }) {
  const C = AOMINOUMIUSHI_TOUR
  const CYCLE = C.PERCH_S + C.FLY_S
  const n = plank.path.n

  // とまる柱：左右の欄干に半分ずつ、等しい間をあけて、左と右で半分ずらす
  const perches = []
  for (const sd of [1, -1]) {
    const row = plank.posts.filter(p => p.side === sd).sort((a, b) => a.i - b.i)
    const k = sd > 0 ? Math.ceil(count / 2) : Math.floor(count / 2)
    for (let j = 0; j < k; j++) perches.push(row[Math.min(row.length - 1, Math.floor((j + (sd > 0 ? 0.25 : 0.75)) * row.length / k))])
  }

  const birds = perches.map((post, idx) => {
    const rand = rng(idx * 7919 + 13)
    const between = ([a, b]) => a + (b - a) * rand()
    const LAPS = Math.round(between([C.LAPS[0] - 0.49, C.LAPS[1] + 0.49]))
    const WAVES = Math.round(between([C.WAVES[0] - 0.49, C.WAVES[1] + 0.49]))
    const SWAY = between(C.SWAY) * DEG, FLY_UP = between(C.FLY_UP)
    // とまる時刻：50 分を匹の数で分けた枠を、となりの柱どうしが続かないよう飛び飛びに（7 つおき）割り当て、枠の中でもばらばらに
    const offset = ((idx * 7) % perches.length + rand()) / perches.length * CYCLE
    const up0 = post.dir.clone().normalize(), R0 = post.r
    // 正面：板から外向き（左の欄干は +n、右は -n）を、上を軸に ±HEADING 振る
    const F = n.clone().multiplyScalar(post.side).addScaledVector(up0, -n.dot(up0) * post.side).normalize()
      .applyAxisAngle(up0, (rand() * 2 - 1) * C.HEADING * DEG)
    const G = new THREE.Vector3().crossVectors(up0, F).normalize()
    const dirAt = (s, out) => {
      const th = 2 * Math.PI * LAPS * s
      const b = SWAY * Math.sin(2 * Math.PI * WAVES * s) * Math.sin(Math.PI * s)
      return out.copy(up0).multiplyScalar(Math.cos(th)).addScaledVector(F, Math.sin(th))
        .multiplyScalar(Math.cos(b)).addScaledVector(G, Math.sin(b)).normalize()
    }
    const LEN = (() => {
      const N = 2000, a = new THREE.Vector3(), b = new THREE.Vector3()
      let len = 0; dirAt(0, a)
      for (let i = 1; i <= N; i++) { dirAt(i / N, b); len += a.angleTo(b) * R0; a.copy(b) }
      return len
    })()
    return { up0, R0, F, dirAt, LEN, FLY_UP, offset }
  })

  const swarm = createAominoumiushiSwarm(birds.length, { width })
  const group = swarm.group
  group.name = 'アオミノウミウシ'
  plank.mesh.parent.add(group)

  const dir = new THREE.Vector3(), ahead = new THREE.Vector3(), fwd = new THREE.Vector3(), x = new THREE.Vector3(), basis = new THREE.Matrix4()
  const place = (b, s, r) => {
    b.dirAt(s, dir)
    if (s < 1 - 1e-4) { b.dirAt(s + 1e-4, ahead); fwd.subVectors(ahead, dir) } else fwd.copy(b.F)
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize()
    if (fwd.lengthSq() < 0.5) fwd.copy(b.F)
    x.crossVectors(dir, fwd).normalize()
    return basis.makeBasis(x, dir, fwd).setPosition(dir.x * r, dir.y * r, dir.z * r)
  }

  // time は使わない（どこにいるか・羽の角度は時計 Date.now で決める）。ほかの update とそろえて受け取るだけ
  const update = () => {
    const clock = Date.now() / 1000
    birds.forEach((b, i) => {
      const tt = ((clock - b.offset) % CYCLE + CYCLE) % CYCLE
      if (tt < C.PERCH_S) { swarm.set(i, place(b, 0, b.R0), 0, 0); return }   // 玉の上で休む（羽を止める）
      const tf = tt - C.PERCH_S
      const s = progress(tf, C.FLY_S, C.ACCEL_S), d = s * b.LEN
      const r = b.R0 + b.FLY_UP * smooth(0, C.CLIMB_D, d) * smooth(0, C.CLIMB_D, b.LEN - d)
      const k = Math.min(1, tf / C.FLAP_IN, (C.FLY_S - tf) / C.FLAP_OUT)
      swarm.set(i, place(b, s, r), tf, Math.max(0, k))
    })
    swarm.commit()
  }
  update()
  return { group, update, count: birds.length, flap: AOMINOUMIUSHI_FLAP }
}
