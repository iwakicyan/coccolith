import * as THREE from 'three'

// ============================================================
//  マイグレーション — ドット絵の生き物が、時刻によって 1 か所へ集まり、また散らばる
//  絵に migrate: '<集まる先の名前>' を書いたものが、main.js で作った同じ名前の集まりに加わる
//    gojunoto:  うれー・さめれー・ゆでれーが、夜（0 時）に五重塔へ
//    cakestand: いぬやつ・みどれー・ねこやつ・れっどれー・さとうくま・さとうさぎが、昼（12 時）にケーキスタンドへ
//  時刻は見ている人の端末の時計（URL の ?clock=23:30 で、その時刻から始まる時計にできる。確かめる用）
//  集まる時刻 at を 0 時とすると（夜なら 0:00、昼なら 12:00）:
//    at-3h〜at   集まる:   気ままに歩きながら、向きを GATHER_BIAS の強さで集まる先のほうへ寄せる
//    at〜at+1h   たむろ:   集まる先から STAY_R の中でうろうろする（外にいる子は寄ってくる。建物に近すぎたら離れる）
//    at+1h〜+6h  解散:     向きを DISPERSE_BIAS の強さで集まる先と逆のほうへ寄せる
//    そのほか    ふだんどおり気ままに歩く
//  ページを開いた時刻に合わせて、出す場所も集まる先へ寄せる（集まる途中なら途中まで、たむろ中ならまわり、解散中なら散らばり具合に合わせて）
//  海を歩けない生き物は、集まるときも海を渡らない（地続きでない陸にいる子は、海岸でうろうろする）
// ============================================================

const GATHER_BIAS   = 0.3   // 集まるときに五重塔へ向きを寄せる強さ（1 秒あたり、向きのずれのこの割合だけ回す）
const DISPERSE_BIAS = 0.2   // 解散するときに五重塔と逆へ向きを寄せる強さ
const STAY_BIAS     = 0.5   // たむろの範囲の外から戻る・基壇から離れる強さ
const STAY_R        = 40    // たむろする範囲（集まる先の中心からの距離 m）

// 時刻 h（集まる時刻 at からの時間に直して見る）→ { mode: 'gather' | 'stay' | 'disperse' | null, progress: その時間帯のどこまで来たか 0〜1 }
function phaseAt(h, at) {
  const t = ((h - at) % 24 + 24) % 24   // at からの時間（0〜24）
  if (t >= 21) return { mode: 'gather', progress: (t - 21) / 3 }
  if (t < 1)   return { mode: 'stay', progress: t }
  if (t < 6)   return { mode: 'disperse', progress: (t - 1) / 5 }
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
// at: 集まる時刻（時。0 = 0 時、12 = 正午） / avoid: 集まる先の中心からこれより近づいたら離れる (m)（建物の大きさ＋余白）
export function createMigration({ target, radius, at, avoid }) {
  const AVOID_R = avoid
  let phase = phaseAt(hoursNow(), at)
  let timer = 0

  // 毎フレームの最初に 1 回呼ぶ（時刻は 1 秒ごとに見直す）
  function tick(dt) {
    timer -= dt
    if (timer <= 0) { phase = phaseAt(hoursNow(), at); timer = 1 }
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
    // 集まる先のほう（地面に沿った向き）。ちょうど真上か真裏にいたら向きが決まらないので寄せない
    _toward.copy(target).addScaledVector(dir, -target.dot(dir))
    if (_toward.lengthSq() < 1e-10) return
    _toward.normalize().multiplyScalar(sign)
    // fwd から寄せたい向きまでの角度（dir まわり、左回りが正）のこの割合だけ回す
    const ang = Math.atan2(_cross.crossVectors(fwd, _toward).dot(dir), fwd.dot(_toward))
    fwd.applyAxisAngle(dir, ang * bias * dt)
  }

  // 出すときの場所 dir（ランダムな地点）を、ページを開いた時刻に合わせて集まる先へ寄せる（dir を書き換える）
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
    // 寄せきったら（f = 1）たむろの範囲の中のどこか（建物の下は避ける）
    const a = a0 * (1 - f) + f * (AVOID_R + Math.random() * (STAY_R - AVOID_R)) / radius
    dir.copy(target).applyAxisAngle(_axis, a).normalize()
  }

  return { tick, steer, placeSpawn }
}
