import * as THREE from 'three'

// ============================================================
//  夜のマイグレーション — うれー・さめれー・ゆでれー（絵に migrate: true）が、時刻によって五重塔へ集まり、また散らばる
//  時刻は見ている人の端末の時計（URL の ?clock=23:30 で、その時刻から始まる時計にできる。確かめる用）
//    21:00〜0:00  集まる:   気ままに歩きながら、向きを GATHER_BIAS の強さで五重塔のほうへ寄せる
//    0:00〜1:00   たむろ:   五重塔から STAY_R の中でうろうろする（外にいる子は寄ってくる。基壇に近すぎたら離れる）
//    1:00〜6:00   解散:     向きを DISPERSE_BIAS の強さで五重塔と逆のほうへ寄せる
//    6:00〜21:00  ふだんどおり気ままに歩く
//  ページを開いた時刻に合わせて、出す場所も五重塔へ寄せる（集まる途中なら途中まで、たむろ中なら塔のまわり、解散中なら散らばり具合に合わせて）
// ============================================================

const GATHER_BIAS   = 0.3   // 集まるときに五重塔へ向きを寄せる強さ（1 秒あたり、向きのずれのこの割合だけ回す）
const DISPERSE_BIAS = 0.2   // 解散するときに五重塔と逆へ向きを寄せる強さ
const STAY_BIAS     = 0.5   // たむろの範囲の外から戻る・基壇から離れる強さ
const STAY_R        = 40    // たむろする範囲（五重塔の中心からの距離 m）
const AVOID_R       = 18    // これより近づいたら離れる（基壇の半分の幅 約 13m ＋ 余白）

// 時刻 → { mode: 'gather' | 'stay' | 'disperse' | null, progress: その時間帯のどこまで来たか 0〜1 }
function phaseAt(h) {
  if (h >= 21) return { mode: 'gather', progress: (h - 21) / 3 }
  if (h < 1)   return { mode: 'stay', progress: h }
  if (h < 6)   return { mode: 'disperse', progress: (h - 1) / 5 }
  return { mode: null, progress: 0 }
}

// ?clock=HH:MM があれば、ページを開いたときにその時刻から進む時計にする
const clockOffset = (() => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('clock') ?? '')
  if (!m) return 0
  const now = new Date()
  const want = new Date(now); want.setHours(+m[1], +m[2], 0, 0)
  return want - now
})()
const hoursNow = () => {
  const d = new Date(Date.now() + clockOffset)
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

const _toward = new THREE.Vector3()
const _cross  = new THREE.Vector3()
const _axis   = new THREE.Vector3()

// target: 集まる先（惑星の中心から見た単位ベクトル） / radius: 惑星の半径 (m)
export function createMigration({ target, radius }) {
  let phase = phaseAt(hoursNow())
  let timer = 0

  // 毎フレームの最初に 1 回呼ぶ（時刻は 1 秒ごとに見直す）
  function tick(dt) {
    timer -= dt
    if (timer <= 0) { phase = phaseAt(hoursNow()); timer = 1 }
  }

  // dir にいる子の向き fwd を、今の時間帯に合わせて回す（歩いているあいだだけ呼ぶ）
  function steer(dir, fwd, dt) {
    if (!phase.mode) return
    const dist = Math.acos(THREE.MathUtils.clamp(dir.dot(target), -1, 1)) * radius
    let sign, bias
    if (phase.mode === 'gather') { sign = 1; bias = GATHER_BIAS }
    else if (phase.mode === 'disperse') { sign = -1; bias = DISPERSE_BIAS }
    else if (dist > STAY_R) { sign = 1; bias = STAY_BIAS }
    else if (dist < AVOID_R) { sign = -1; bias = STAY_BIAS }
    else return
    // 五重塔のほう（地面に沿った向き）。ちょうど塔の上か真裏にいたら向きが決まらないので寄せない
    _toward.copy(target).addScaledVector(dir, -target.dot(dir))
    if (_toward.lengthSq() < 1e-10) return
    _toward.normalize().multiplyScalar(sign)
    // fwd から寄せたい向きまでの角度（dir まわり、左回りが正）のこの割合だけ回す
    const ang = Math.atan2(_cross.crossVectors(fwd, _toward).dot(dir), fwd.dot(_toward))
    fwd.applyAxisAngle(dir, ang * bias * dt)
  }

  // 出すときの場所 dir（ランダムな地点）を、ページを開いた時刻に合わせて五重塔へ寄せる（dir を書き換える）
  function placeSpawn(dir) {
    const f = phase.mode === 'gather' ? phase.progress
      : phase.mode === 'stay' ? 1
      : phase.mode === 'disperse' ? 1 - phase.progress
      : 0
    if (f <= 0) return
    const a0 = Math.acos(THREE.MathUtils.clamp(dir.dot(target), -1, 1))
    _axis.crossVectors(target, dir)
    if (_axis.lengthSq() < 1e-10) return
    _axis.normalize()
    // 寄せきったら（f = 1）たむろの範囲の中のどこか（基壇の下は避ける）
    const a = a0 * (1 - f) + f * (AVOID_R + Math.random() * (STAY_R - AVOID_R)) / radius
    dir.copy(target).applyAxisAngle(_axis, a).normalize()
  }

  return { tick, steer, placeSpawn }
}
