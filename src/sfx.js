// ============================================================
//  SE — 音のファイルを使わず、Web Audio でその場で音を作って鳴らす
//  スマホは画面を触るまで音を出せないので、最初のタッチ・キーで AudioContext を作って起こす
//
//  coinToWater(): 水面にコインを投げ込んだとき（チャリン → ちゃぽん）
//  bubbleRise():  泡玉が浮かんできたとき（ぷくっ）
//  bubblePop():   泡玉をタッチして消したとき（ぽんっ）
// ============================================================

const VOLUME = 0.5   // 全体の音量

let ctx = null, master = null, noiseBuf = null

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = VOLUME
    master.connect(ctx.destination)
    // ホワイトノイズ 0.5 秒（水しぶき・はじける音に使い回す）
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}
// 最初のタッチ・キーで起こしておく（タップの中で鳴らす音は、そのときに起こしても間に合う）
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio(), { capture: true, passive: true })
// ページが裏へ行ったら止め、戻ったら起こす
document.addEventListener('visibilitychange', () => {
  if (!ctx) return
  if (document.hidden) ctx.suspend(); else ctx.resume()
})

// 音量の山（立ち上がり attack 秒 → 指数で減って dur 秒で消える）を付けた GainNode
function envelope(t0, peak, attack, dur) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  g.connect(master)
  return g
}
// 音程のある音。f0 → f1 へ dur 秒かけて高さを変える
function tone({ at = 0, type = 'sine', f0, f1 = f0, dur, peak = 0.3, attack = 0.005, glide = dur }) {
  const t0 = ctx.currentTime + at
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + glide)
  o.connect(envelope(t0, peak, attack, dur))
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}
// ノイズを帯域フィルタに通した音（シャッ・パチッ）
function noise({ at = 0, freq, q = 1, dur, peak = 0.2, attack = 0.003, type = 'bandpass' }) {
  const t0 = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  s.connect(f).connect(envelope(t0, peak, attack, dur))
  s.start(t0)
  s.stop(t0 + dur + 0.02)
}

export function coinToWater() {
  if (!audio()) return
  // チャリン（高い 2 つの音を重ねて金属っぽく）
  tone({ type: 'triangle', f0: 2637, dur: 0.35, peak: 0.12 })
  tone({ type: 'sine', f0: 3951, dur: 0.25, peak: 0.07 })
  // ちゃぽん（高いところから一気に下がる丸い音 + 水しぶき）
  tone({ at: 0.12, f0: 1100, f1: 260, dur: 0.22, peak: 0.35, glide: 0.09 })
  noise({ at: 0.12, freq: 1800, q: 0.8, dur: 0.18, peak: 0.08 })
  // 小さいしずくの返り
  tone({ at: 0.3, f0: 700, f1: 1300, dur: 0.08, peak: 0.08, glide: 0.06 })
}

export function bubbleRise() {
  if (!audio()) return
  // ぷく・ぷくっ（下から上へ上がる丸い音を 2 つ）
  tone({ f0: 260, f1: 620, dur: 0.12, peak: 0.25, glide: 0.1 })
  tone({ at: 0.11, f0: 340, f1: 900, dur: 0.14, peak: 0.3, glide: 0.11 })
}

export function bubblePop() {
  if (!audio()) return
  // ぽんっ（短く跳ね上がる音 + はじけるパチッ）
  tone({ f0: 520, f1: 1500, dur: 0.09, peak: 0.35, glide: 0.05 })
  noise({ freq: 3500, q: 0.7, dur: 0.05, peak: 0.12, type: 'highpass' })
}
