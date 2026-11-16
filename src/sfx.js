// ============================================================
//  SE — 音のファイルを使わず、Web Audio でその場で音を作って鳴らす
//  スマホは画面を触るまで音を出せないので、最初のタッチ・キーで AudioContext を作って起こす
//
//  coinToWater(): 水面にコインを投げ込んだとき（チャリン → ちゃぽん）
//  bubbleRise():  泡玉が浮かんできたとき（ぷくっ）
//  bubblePop():   泡玉をタッチして消したとき（ぽんっ）
//  coinToSlot():  コイン箱・自販機の投入口にコインを入れたとき、コインを拾ったとき（チャリンッ）
//  kanDrop():     自販機の取り出し口に缶が出たとき（ガチャン）
//  kanTake():     取り出し口の缶・台の上の花を取ったとき（コトッ）
//  setMoving(k): sabちゃんが動いている強さ（0〜1）を毎フレーム渡す。動いている間「フォン…フォン…」と鳴らす
//  initSoundButton(btn): HUD の歯車の横のスピーカーを、音のオン・オフの切り替えにする（選んだほうは localStorage に残す）
// ============================================================

import { t, onLangChange } from './i18n.js'

const VOLUME = 0.5   // 全体の音量
const SOUND_KEY = 'coccolith.sound'

let muted = false
try { muted = localStorage.getItem(SOUND_KEY) === '0' } catch { /* 読めなければ音を出す */ }

let ctx = null, master = null, noiseBuf = null

function audio() {
  if (muted) return null
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
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (!muted) audio() }, { capture: true, passive: true })
// ページが裏へ行ったら止め、戻ったら起こす
document.addEventListener('visibilitychange', () => {
  if (!ctx) return
  if (document.hidden || muted) ctx.suspend(); else ctx.resume()
})

// 音量の山（立ち上がり attack 秒 → 指数で減って dur 秒で消える）を付けた GainNode
function envelope(t0, peak, attack, dur, out = master) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  g.connect(out)
  return g
}
// 音程のある音。f0 → f1 へ dur 秒かけて高さを変える
function tone({ at = 0, type = 'sine', f0, f1 = f0, dur, peak = 0.3, attack = 0.005, glide = dur, out }) {
  const t0 = ctx.currentTime + at
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + glide)
  o.connect(envelope(t0, peak, attack, dur, out))
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}
// ノイズを帯域フィルタに通した音（シャッ・パチッ）
function noise({ at = 0, freq, q = 1, dur, peak = 0.2, attack = 0.003, type = 'bandpass', out }) {
  const t0 = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  s.connect(f).connect(envelope(t0, peak, attack, dur, out))
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
  tone({ f0: 780, f1: 2200, dur: 0.09, peak: 0.35, glide: 0.05 })
  noise({ freq: 5000, q: 0.7, dur: 0.05, peak: 0.12, type: 'highpass' })
}

export function coinToSlot() {
  if (!audio()) return
  // チャリンッ（短い高い 2 つの音を重ねて金属っぽく）
  tone({ type: 'triangle', f0: 2349, dur: 0.14, peak: 0.12 })
  tone({ type: 'sine', f0: 3520, dur: 0.1, peak: 0.06 })
  tone({ at: 0.05, type: 'triangle', f0: 2794, dur: 0.1, peak: 0.07 })
}

export function kanDrop() {
  if (!audio()) return
  // ガチャン（金属の箱に当たる明るめの音 + ジャッという響き）
  tone({ f0: 420, f1: 180, dur: 0.16, peak: 0.35, glide: 0.1 })
  noise({ freq: 1800, q: 0.9, dur: 0.14, peak: 0.22 })
  tone({ type: 'triangle', f0: 1250, f1: 980, dur: 0.2, peak: 0.08 })
  tone({ type: 'triangle', f0: 1870, dur: 0.14, peak: 0.05 })
  // 少し跳ねて止まる
  tone({ at: 0.12, f0: 360, f1: 240, dur: 0.08, peak: 0.15 })
  noise({ at: 0.12, freq: 2200, q: 1.2, dur: 0.06, peak: 0.08 })
}

export function kanTake() {
  if (!audio()) return
  // コトッ（短い軽い音）
  tone({ type: 'triangle', f0: 900, f1: 600, dur: 0.07, peak: 0.15, glide: 0.04 })
  noise({ freq: 2500, q: 1.5, dur: 0.03, peak: 0.06 })
}

// --- 動いている間の「フォン…フォン…」 ---
const HUM_PERIOD = 1.05   // 1 つの「フォン」から次まで (s)
const HUM_MIN    = 0.1    // これより弱い入力では鳴らさない
const HUM_DELAY  = 0.11   // ディレイの間隔 (s)。短めにして「ブワワワ…」と細かく繰り返す
const HUM_FEEDBACK = 0.55 // 繰り返すたびに残る割合
const HUM_WET    = 0.6    // ディレイの音の大きさ（元の音に対して）
let humNext = 0           // 次の「フォン」を鳴らす時刻（ctx.currentTime）。止まっているときは 0
let humBus = null         // 「フォン」の行き先。元の音 + ディレイ（繰り返すたびにこもって、間隔が少し揺れる）
function humOut() {
  if (humBus) return humBus
  humBus = ctx.createGain()
  humBus.connect(master)
  const delay = ctx.createDelay(1)
  delay.delayTime.value = HUM_DELAY
  const fb = ctx.createGain(); fb.gain.value = HUM_FEEDBACK
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
  const wet = ctx.createGain(); wet.gain.value = HUM_WET
  humBus.connect(delay)
  delay.connect(lp).connect(fb).connect(delay)
  lp.connect(wet).connect(master)
  // 間隔をゆっくり揺らして、ワウワウした感じにする
  const lfo = ctx.createOscillator(); lfo.frequency.value = 3
  const depth = ctx.createGain(); depth.gain.value = 0.012
  lfo.connect(depth).connect(delay.delayTime)
  lfo.start()
  return humBus
}
function hum(at, k) {
  const t0 = at - ctx.currentTime
  const out = humOut()
  // ふわっと立ち上がって、少し下がりながら消える丸い音
  tone({ at: t0, f0: 260, f1: 200, dur: 1.1, peak: 0.065 * k, attack: 0.18, out })
  tone({ at: t0, type: 'triangle', f0: 520, f1: 400, dur: 0.8, peak: 0.014 * k, attack: 0.18, out })
  noise({ at: t0, freq: 600, q: 0.6, dur: 0.9, peak: 0.02 * k, attack: 0.2, type: 'lowpass', out })
}
export function setMoving(k) {
  if (k < HUM_MIN || document.hidden) { humNext = 0; return }
  if (!audio()) return
  const now = ctx.currentTime
  if (humNext === 0) humNext = now
  // 先に 0.05 秒だけ予約しておく（フレームの間隔で途切れないように）
  if (humNext <= now + 0.05) {
    hum(Math.max(humNext, now), Math.min(1, k))
    humNext = Math.max(humNext, now) + HUM_PERIOD
  }
}

// スピーカー（音を出しているとき）と、斜線を引いたスピーカー（消しているとき）
const SPEAKER = 'M2.5 6 L5 6 L8.5 3 L8.5 13 L5 10 L2.5 10 Z'
const ICON_ON  = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${SPEAKER}"/><path d="M10.8 5.8 Q12 8 10.8 10.2"/><path d="M12.6 4.2 Q14.8 8 12.6 11.8"/></svg>`
const ICON_OFF = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${SPEAKER}"/><path d="M11 6 L15 10 M15 6 L11 10"/></svg>`

export function initSoundButton(btn) {
  const draw = () => {
    btn.innerHTML = muted ? ICON_OFF : ICON_ON
    btn.setAttribute('aria-label', t(muted ? 'soundOn' : 'soundOff'))
    btn.setAttribute('aria-pressed', muted)
  }
  onLangChange(draw)
  btn.addEventListener('click', () => {
    muted = !muted
    try { localStorage.setItem(SOUND_KEY, muted ? '0' : '1') } catch { /* 残せなくても今回は効く */ }
    if (ctx) { if (muted) ctx.suspend(); else ctx.resume() }
    else if (!muted) audio()
    draw()
  })
}
