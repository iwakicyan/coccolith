import * as THREE from 'three'
import { createBirdInstances, birdFlapAngle } from '../my-3d-parts/parts/bird.js'

// ============================================================
//  北極の上空の枝にとまっている鳥（my-3d-parts/parts/bird.js）
//  枝にしばらくとまる → 飛び立って coccolith を大円に沿って一周 → もとの所にとまる、のくり返し
//    とまる所: 枝の部品（eda.js）の userData.perches の 1 つ。主枝に直角な向き（正面）を向いてとまる
//    飛ぶ道: とまる所と正面の向きを通る大円。とまる所から弧で CLIMB_D 進むあいだに FLY_UP だけ上がり、戻りは同じだけ下りて降りる
//    飛ぶあいだはずっと羽ばたく（作業台と同じ 1 秒に 2 回・振れ幅 30°）。とまっているあいだは翼を下ろす
//  createBirdFlock({ scene, eda, count, length, colors, set, seed }) → { group, update(dt) }
//    length: 全長 (m)、colors: パーツごとの色（bird.js の createBird と同じ）、set: 枝のとまり場所の組（eda.js の PERCH_TS）
//    群れごとにまとめて描く。群れどうしでとまり場所が重ならないよう、組を分ける
//    鳥はまとめて描く（bird.js の createBirdInstances。何羽でも描画 3 回。輪郭線ありなら 6 回）
//    count 羽を、枝のとまり場所（perches）から重ならないように選んで置く（とまり場所の数まで）
//    鳥ごとに、とまる側（主枝のどちら側を向くか＝飛ぶ大円の向き）・とまる時間（PERCH_S の範囲）・一周の時間（FLY_S × FLY_VAR の範囲）・
//    始めの時点（とまっている途中か一周の途中か）・羽ばたきの拍子を乱数でばらす
//  createBirdFlight({ eda, perch, flip, perchS, flyS, phase, flapPhase }) → { matrix, th, update(dt) }: 1 羽の動き
//    matrix: 鳥の原点（足の下の端）の世界での行列、th: 翼を上げる角度。描くのは群れの側
//    eda: シーンに置いた枝（向き・位置を決めてから渡す）、perch: perches の何番目にとまるか、flip: 主枝の反対側を向く
// ============================================================

export const BIRD_FLIGHT = {
  LENGTH: 5,        // 鳥の全長 (m)（群れで指定しなかったとき）
  GLOW: 0.8,        // 自発光（色に対する割合。部品の標準は 0.45）
  COUNT: 30,        // 鳥の数（群れで指定しなかったとき。とまり場所の組の数まで）
  OUTLINE: false,   // 輪郭線
  PERCH_S: [20, 60],   // とまっている時間 (s)。鳥ごと・とまるごとにこの範囲でばらす
  FLY_S: 600,       // 一周する時間 (s)（10 分）
  FLY_VAR: [0.85, 1.15],   // 一周の時間の鳥ごとの倍率
  ACCEL_S: 8,       // 飛び立ちで速さが上がりきるまで・降りる前に止まるまでの時間 (s)
  FLY_UP: 20,       // 飛ぶ高さ（とまる所から上へ, m）
  CLIMB_D: 60,       // 飛び立ってから FLY_UP まで上がるあいだに進む距離（弧, m）。降りるときも同じ
}

// 一周のうち t 秒でどれだけ進んだか（0〜1）。始めの a 秒で速さが上がり、終わりの a 秒で止まる。あいだは同じ速さ
const progress = (t, T, a) => {
  const v = 1 / (T - a)
  if (t < a) return v * t * t / (2 * a)
  if (t > T - a) { const u = T - t; return 1 - v * u * u / (2 * a) }
  return v * (t - a / 2)
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export function createBirdFlight({ eda, perch = 0, flip = false, perchS = () => 30, flyS = BIRD_FLIGHT.FLY_S, phase = 0, flapPhase = 0 }) {
  const B = BIRD_FLIGHT
  const self = { matrix: new THREE.Matrix4(), th: 0, update }
  const flap = { update(th) { self.th = th }, stop() { self.th = 0 } }

  // とまる所（世界の座標）と、大円の 2 つの軸（P: とまる所の向き、F: 正面の向き）
  eda.updateMatrixWorld(true)
  const p = eda.userData.perches[perch] ?? eda.userData.perches[0]
  const pos0 = eda.localToWorld(p.pos.clone())
  const R0 = pos0.length()
  const P = pos0.clone().divideScalar(R0)
  const along = p.along.clone().transformDirection(eda.matrixWorld)
  const F = new THREE.Vector3().crossVectors(P, along).normalize()   // 主枝に直角で地面に平行
  if (p.from) {   // 脇枝にとまるときは、親の枝から離れる側を向く（飛び立ちで親の枝をくぐらない）
    const away = pos0.clone().sub(eda.localToWorld(p.from.clone()))
    if (F.dot(away) < 0) F.negate()
  } else if (flip) F.negate()

  const _pos = new THREE.Vector3(), _ahead = new THREE.Vector3(), _fwd = new THREE.Vector3()
  const _x = new THREE.Vector3(), _y = new THREE.Vector3()
  const at = (th, out) => {   // 道の上の点（th: とまる所からの角度 0〜2π）
    const arc = Math.min(th, 2 * Math.PI - th) * R0
    const r = R0 + B.FLY_UP * smooth(0, B.CLIMB_D, arc)
    return out.copy(P).multiplyScalar(Math.cos(th)).addScaledVector(F, Math.sin(th)).multiplyScalar(r)
  }
  const place = th => {
    at(th, _pos)
    at(th + 0.5 / R0, _ahead)                // 0.5m 先の点への向きを正面にする（上り下りで前が上がる・下がる）
    _fwd.subVectors(_ahead, _pos).normalize()
    _y.copy(_pos).normalize()                // 上 = 星の中心から外
    _x.crossVectors(_y, _fwd).normalize()
    _y.crossVectors(_fwd, _x)
    self.matrix.makeBasis(_x, _y, _fwd).setPosition(_pos)
  }

  // 始めの時点：phase 秒が、とまる時間の中ならとまっている途中、過ぎていれば一周の途中
  let wait = perchS(), state = 'perch', t = phase, flapT = flapPhase
  if (t >= wait) { t -= wait; state = 'fly'; if (t >= flyS) t %= flyS }
  if (state === 'perch') { place(0); flap.stop() }

  function update(dt) {
    t += dt
    if (state === 'perch') {
      if (t >= wait) { state = 'fly'; t = 0 }
      return
    }
    const s = t >= flyS ? 1 : progress(t, flyS, B.ACCEL_S)
    place(2 * Math.PI * s)
    flapT += dt
    flap.update(birdFlapAngle(flapT))
    if (s >= 1) { state = 'perch'; t = 0; wait = perchS(); place(0); flap.stop() }
  }

  return self
}

// 群れ：とまり場所を重ならないように選び、鳥ごとに向き・時間・始めの時点をばらす
export function createBirdFlock({ scene, eda, count = BIRD_FLIGHT.COUNT, length = BIRD_FLIGHT.LENGTH, colors = null, set = 0, seed = 1 }) {
  const B = BIRD_FLIGHT
  let s = (seed >>> 0) || 1   // 決まった乱数（mulberry32）
  const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const rr = (a, b) => a + (b - a) * rnd()
  const spots = eda.userData.perches.map((p, i) => p.set === set ? i : -1).filter(i => i >= 0)
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]] }
  const perchS = () => rr(...B.PERCH_S)
  const flights = spots.slice(0, count).map(perch => {
    const flyS = B.FLY_S * rr(...B.FLY_VAR)
    return createBirdFlight({ eda, perch, flip: rnd() < 0.5, perchS, flyS, phase: rnd() * (B.PERCH_S[1] + flyS), flapPhase: rnd() })
  })
  const inst = createBirdInstances(flights.length, { length, glow: B.GLOW, outline: B.OUTLINE, colors })
  scene.add(inst.group)
  const update = dt => {
    flights.forEach((f, i) => { f.update(dt); inst.set(i, f.matrix, f.th) })
    inst.commit()
  }
  update(0)
  return { group: inst.group, update }
}
