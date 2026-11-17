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
//  kanGive():     ドット絵のキャラに缶をあげたとき（コトッ → ピロン）
//  setMoving(k): sabちゃんが動いている強さ（0〜1）を毎フレーム渡す。動いている間「フォン…フォン…」と鳴らす
//  setAmbience({ wind, wave, water }): 環境音の大きさ（0〜1）を毎フレーム渡す。風（いつも小さくサー…）と波（海の近くでザザー…と寄せては返す）。water（カメラが水中）なら風・波を消してフォーンをこもらせる。silent（俯瞰中）なら風・波を消す
//  setMusic(name, k): BGM の曲ごとの大きさ（0〜1）を毎フレーム渡す。ドット絵のキャラの近くで流す（ambient: Abi・ゆっくり重なる和音とベル / light: Rifta・軽い分散和音）
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

export function kanGive() {
  if (!audio()) return
  // コトッ（渡す）→ ピロン（上がっていく 2 音。喜んでいる感じ）
  tone({ type: 'triangle', f0: 900, f1: 600, dur: 0.07, peak: 0.12, glide: 0.04 })
  noise({ freq: 2500, q: 1.5, dur: 0.03, peak: 0.05 })
  for (const [at, f] of [[0.12, 1318.5], [0.24, 1760]]) {   // E6 → A6
    tone({ at, f0: f, dur: 0.5, peak: 0.07, attack: 0.004 })
    tone({ at, type: 'triangle', f0: f * 2, dur: 0.15, peak: 0.012, attack: 0.002 })   // 少しきらっと
  }
}

// --- 動いている間の「フォン…フォン…」 ---
const HUM_PERIOD = 1.05   // 1 つの「フォン」から次まで (s)
const HUM_MIN    = 0.1    // これより弱い入力では鳴らさない
const HUM_DELAY  = 0.2    // ディレイの間隔 (s)
const HUM_FEEDBACK = 0.55 // 繰り返すたびに残る割合
const HUM_WET    = 0.6    // ディレイの音の大きさ（元の音に対して）
const HUM_VOL    = 0.8    // フォーン全体の音量（ディレイも含めてこの倍にする）
let humNext = 0           // 次の「フォン」を鳴らす時刻（ctx.currentTime）。止まっているときは 0
const HUM_MUFFLE_HZ = 200  // 水中でフォーンをこもらせるときのフィルタ (Hz)。2 段に重ねて高い音をばっさり落とす
const HUM_WATER_PITCH = 0.65  // 水中ではフォーンの音程をこの倍率に下げる（ボワ…と重く）
let humMuffle = null   // 2 段のローパス [1 段目, 2 段目]
let underwater = false    // カメラが水中にあるか（setAmbience で受け取る）
let humBus = null         // 「フォン」の行き先。元の音 + ディレイ（繰り返すたびにこもる。間隔は揺らさない（揺らすと繰り返しの音程がずれる））
function humOut() {
  if (humBus) return humBus
  humBus = ctx.createGain()
  // 水中ではこもらせる（元の音もディレイも、このフィルタを通して出す）
  humMuffle = [0, 1].map(() => {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.1
    f.frequency.value = underwater ? HUM_MUFFLE_HZ : 20000
    return f
  })
  const vol = ctx.createGain(); vol.gain.value = HUM_VOL
  humMuffle[0].connect(humMuffle[1]).connect(vol).connect(master)
  humBus.connect(humMuffle[0])
  const delay = ctx.createDelay(1)
  delay.delayTime.value = HUM_DELAY
  const fb = ctx.createGain(); fb.gain.value = HUM_FEEDBACK
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
  const wet = ctx.createGain(); wet.gain.value = HUM_WET
  humBus.connect(delay)
  delay.connect(lp).connect(fb).connect(delay)
  lp.connect(wet).connect(humMuffle[0])
  return humBus
}
function hum(at, k) {
  const t0 = at - ctx.currentTime
  const out = humOut()
  // ふわっと立ち上がって消える丸い音。鳴っている間は音程を変えない（変えると、ディレイで重なる前の音と音程がずれる）
  // 水中では音程を下げ、こもって小さくなる分を少し大きくする
  const p = underwater ? HUM_WATER_PITCH : 1, v = underwater ? 1.6 : 1
  tone({ at: t0, f0: 230 * p, dur: 1.1, peak: 0.065 * k * v, attack: 0.18, out })
  tone({ at: t0, type: 'triangle', f0: 460 * p, dur: 0.8, peak: 0.014 * k * v, attack: 0.18, out })
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

// --- 環境音（風・波） ---
// どちらもノイズを流し続け、フィルタと音量をゆっくり動かして作る。大きさは setAmbience で渡した値へなめらかに寄せる
const WIND_VOL = 0.05     // 風のいちばん大きいときの音量
const WAVE_VOL = 0.12     // 波のいちばん大きいとき（海のすぐそば）の音量
const WAVE_LOW = 0.58     // 波が引いたときの大きさ（寄せたときは 0.68〜0.74）。見た目にはほとんど打ち寄せないので、幅は小さく
const WAVE_GAP = [5.5, 8] // 波が寄せてから次に寄せるまで (s)
const AMB_TAU  = 0.8      // 大きさを寄せる速さ（時定数 s）
let amb = null            // { windLevel, waveLevel, waveEnv, waveFilter }
let waveNext = 0

function loopNoise(buf, offset) {
  const s = ctx.createBufferSource()
  s.buffer = buf; s.loop = true
  s.start(0, offset)
  return s
}
function startAmbience() {
  // 4 秒のノイズを繰り返して流す（短いと繰り返しが聞こえる）
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const lfo = (freq, depth, param) => {
    const o = ctx.createOscillator(); o.frequency.value = freq
    const g = ctx.createGain(); g.gain.value = depth
    o.connect(g).connect(param); o.start()
  }

  // 風: こもったサー…。音量と明るさを、周期の違うゆっくりした揺れでふくらませたりしぼめたりする
  const windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 420; windFilter.Q.value = 0.7
  const windSwell = ctx.createGain(); windSwell.gain.value = 0.6
  const windLevel = ctx.createGain(); windLevel.gain.value = 0
  loopNoise(buf, 0).connect(windFilter).connect(windSwell).connect(windLevel).connect(master)
  lfo(0.07, 0.1, windSwell.gain)
  lfo(0.17, 0.05, windSwell.gain)
  lfo(0.05, 160, windFilter.frequency)

  // 波: 寄せるたびに waveEnv の音量とフィルタを上げて下げる（ザザー…）
  const waveFilter = ctx.createBiquadFilter(); waveFilter.type = 'lowpass'; waveFilter.frequency.value = 400; waveFilter.Q.value = 0.5
  const waveEnv = ctx.createGain(); waveEnv.gain.value = WAVE_LOW
  const waveLevel = ctx.createGain(); waveLevel.gain.value = 0
  loopNoise(buf, 2).connect(waveFilter).connect(waveEnv).connect(waveLevel).connect(master)
  amb = { windLevel, waveLevel, waveEnv, waveFilter }
}
// 1 回の波を at（ctx.currentTime）に寄せる。強さは毎回少し変える
function waveSwash(at) {
  const k = 0.68 + Math.random() * 0.06
  const { waveEnv: g, waveFilter: f } = amb
  g.gain.setValueAtTime(WAVE_LOW, at)
  g.gain.linearRampToValueAtTime(k, at + 1.6)              // 寄せる
  g.gain.exponentialRampToValueAtTime(WAVE_LOW, at + 1.6 + 3.2) // 引いていく
  f.frequency.setValueAtTime(500, at)
  f.frequency.linearRampToValueAtTime(560 + 150 * k, at + 1.5)
  f.frequency.exponentialRampToValueAtTime(500, at + 1.6 + 3.2)
}
// water: カメラが水中にあるか。水中では風・波をプツッと消し、フォーンをこもらせる（出入りした瞬間に切り替える）
// silent: 風・波をプツッと消す（俯瞰中）。消す・戻すのも出入りした瞬間に切り替える
let ambSilent = false
export function setAmbience({ wind = 0, wave = 0, water = false, silent = false }) {
  if (!ctx || muted || document.hidden) return   // 最初のタッチ・キーで音が起きるまでは何もしない
  if (!amb) startAmbience()
  const now = ctx.currentTime
  const off = water || silent
  const windV = off ? 0 : WIND_VOL * wind, waveV = off ? 0 : WAVE_VOL * wave
  if (off !== (underwater || ambSilent)) {
    for (const [g, v] of [[amb.windLevel.gain, windV], [amb.waveLevel.gain, waveV]]) { g.cancelScheduledValues(now); g.setValueAtTime(v, now) }
  }
  ambSilent = silent
  if (water !== underwater) {
    underwater = water
    if (humMuffle) for (const f of humMuffle) { f.frequency.cancelScheduledValues(now); f.frequency.setValueAtTime(water ? HUM_MUFFLE_HZ : 20000, now) }
  }
  amb.windLevel.gain.setTargetAtTime(windV, now, AMB_TAU)
  amb.waveLevel.gain.setTargetAtTime(waveV, now, AMB_TAU)
  // 波は聞こえていてもいなくても寄せ続ける（近づいたとき途中から聞こえるように）
  if (waveNext <= now + 0.1) {
    const at = Math.max(waveNext, now + 0.05)
    waveSwash(at)
    waveNext = at + WAVE_GAP[0] + Math.random() * (WAVE_GAP[1] - WAVE_GAP[0])
  }
}

// --- BGM（ドット絵のキャラの近く） ---
// 曲ごとに音量のつまみ（level）を持ち、setMusic(name, k) で渡した値へ MUSIC_TAU 秒で寄せる（距離で変わる大きさになめらかについていく）
// 聞こえないあいだは新しい音を作らず、また聞こえはじめたら曲の頭から鳴らす
//   ambient（Abi）: パッド（三角波を 2 本ずつ少しずらして重ね、こもらせた和音）を 8 秒ごとに重ねながら入れ替え、ペンタトニックのベルをときどき 1 つディレイで残す
//   light（Rifta）: 50 BPM（8 分音符 0.6 秒）。木琴の分散和音・柔らかいベース・小さなシェイカー、ときどき高い木琴のメロディ
const MUSIC_TAU = 0.3       // 大きさを寄せる速さ（時定数 s）
const hz = n => 440 * 2 ** ((n - 69) / 12)   // MIDI の音番号 → Hz
const musics = {}   // 曲の名前 → { level, next, ...曲ごとのもの }

// ディレイで残響のように残す行き先（out へ。元の音もそのまま out へ出す）
function echoBus(out, time, feedback, cutoff) {
  const bus = ctx.createGain()
  const delay = ctx.createDelay(2); delay.delayTime.value = time
  const fb = ctx.createGain(); fb.gain.value = feedback
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff
  bus.connect(out)
  bus.connect(delay).connect(lp).connect(fb).connect(delay)
  lp.connect(out)
  return bus
}

// ambient（Abi）
const AMBIENT_VOL = 0.6       // いちばん大きいときの音量（風 0.05・波 0.12 と同じ物差し。パッド 1 音がこの 0.04 倍ほど）
const AMBIENT_CHORD_GAP = 8   // 和音を入れ替える間隔 (s)
const AMBIENT_CHORD_FADE = 4  // 和音の立ち上がり・消える長さ (s)
const AMBIENT_BELL_GAP = [2.5, 7]   // ベルの間隔 (s)
// Dmaj9 → Bm9 → Gmaj9 → Asus4（D メジャー）。1 つめはベース
const AMBIENT_CHORDS = [[38, 57, 61, 64, 66], [35, 54, 57, 61, 62], [31, 54, 59, 62, 69], [33, 52, 57, 62, 64]]
const AMBIENT_BELLS = [74, 76, 78, 81, 83, 86]   // D メジャーのペンタトニック（D5〜D6）

// light（Rifta）
const LIGHT_VOL = 0.6
const LIGHT_STEP = 0.6   // 8 分音符 (s)。50 BPM
// G → Em → C → D（G メジャー）を 1 小節（8 分音符 8 つ）ずつ。bass: ベースの音 / arp: 分散和音に使う 4 音
const LIGHT_CHORDS = [
  { bass: 43, arp: [62, 67, 71, 74] },
  { bass: 40, arp: [64, 67, 71, 76] },
  { bass: 36, arp: [64, 67, 72, 76] },
  { bass: 38, arp: [62, 66, 69, 74] },
]
const LIGHT_ARP = [0, 1, 2, 1, 3, 2, 1, 2]   // 小節の中で分散和音のどの音を鳴らすか
const LIGHT_SKIP = 0.4                      // 分散和音の音をこの割合だけ抜いて、軽く聞かせる（小節の頭は抜かない）
const LIGHT_MELODY = [79, 81, 83, 86, 88]   // 木琴のメロディ（G メジャーのペンタトニック。G5〜E6）
const LIGHT_MELODY_CHANCE = 0.08           // 8 分音符ごとにメロディの音を鳴らす割合（表拍だけ）

// 木琴の 1 音: 丸い基音に、すぐ消える 3 倍の倍音（木の板らしいコン）と、ごく小さな打撃のコツッを重ねる（丸く聞こえるよう倍音・打撃は控えめ）
//   立ち上がりが速すぎるとプチッと聞こえるので少しなだらかにし、高い音ほど倍音・打撃を弱める（高い音の倍音・打撃がいちばんプチッと聞こえる）
const MALLET_ATTACK = 0.012   // 基音の立ち上がり (s)
function mallet(at, f, peak, out, dur = 0.8) {
  const soft = Math.min(1, 440 / f)   // A4 より高い音ほど倍音・打撃を弱める
  tone({ at, f0: f, dur, peak, attack: MALLET_ATTACK, out })
  tone({ at, f0: f * 3, dur: 0.07, peak: peak * 0.12 * soft, attack: 0.008, out })
  noise({ at, freq: Math.min(f * 2, 1500), q: 1, dur: 0.03, peak: peak * 0.1 * soft, attack: 0.008, type: 'lowpass', out })
}

const MUSIC_TRACKS = {
  ambient: {
    vol: AMBIENT_VOL,
    start(m) {
      m.pad = ctx.createBiquadFilter(); m.pad.type = 'lowpass'; m.pad.frequency.value = 700; m.pad.Q.value = 0.3
      m.pad.connect(m.level)
      m.bell = echoBus(m.level, 0.45, 0.45, 2200)
      m.chord = 0; m.bellNext = 0
    },
    reset(m) { m.bellNext = 0 },
    // m.next: 次の和音を鳴らす時刻
    schedule(m, now) {
      if (m.next <= now + 0.1) {
        const at = Math.max(m.next, now + 0.05)
        const dur = AMBIENT_CHORD_GAP + AMBIENT_CHORD_FADE
        AMBIENT_CHORDS[m.chord].forEach((n, i) => {
          const g = ctx.createGain()
          const peak = i === 0 ? 0.05 : 0.035   // ベースだけ少し大きく
          g.gain.setValueAtTime(0, at)
          g.gain.linearRampToValueAtTime(peak, at + AMBIENT_CHORD_FADE)
          g.gain.setValueAtTime(peak, at + dur - AMBIENT_CHORD_FADE)
          g.gain.linearRampToValueAtTime(0, at + dur)
          g.connect(m.pad)
          for (const cents of [-6, 6]) {
            const o = ctx.createOscillator(); o.type = 'triangle'
            o.frequency.value = hz(n); o.detune.value = cents
            o.connect(g); o.start(at); o.stop(at + dur + 0.05)
          }
        })
        m.chord = (m.chord + 1) % AMBIENT_CHORDS.length
        m.next = at + AMBIENT_CHORD_GAP
      }
      if (m.bellNext <= now + 0.1) {
        const at = Math.max(m.bellNext, now + 0.05) + (m.bellNext ? 0 : AMBIENT_CHORD_FADE)   // 鳴りはじめはパッドが立ち上がってから
        const n = AMBIENT_BELLS[Math.floor(Math.random() * AMBIENT_BELLS.length)]
        tone({ at: at - now, f0: hz(n), dur: 3, peak: 0.03, attack: 0.02, out: m.bell })
        m.bellNext = at + AMBIENT_BELL_GAP[0] + Math.random() * (AMBIENT_BELL_GAP[1] - AMBIENT_BELL_GAP[0])
      }
    },
  },
  light: {
    vol: LIGHT_VOL,
    start(m) {
      // 曲全体をこもらせて、鳴りはじめのプチッとした高い成分を削る（ベース・シェイカー以外はここを通す）
      m.soft = ctx.createBiquadFilter(); m.soft.type = 'lowpass'; m.soft.frequency.value = 2400; m.soft.Q.value = 0.5
      m.soft.connect(m.level)
      m.out = echoBus(m.soft, LIGHT_STEP * 1.5, 0.12, 1800)   // 付点 8 分のディレイを薄く（木琴らしく、響きは短めに）
      m.step = 0
    },
    reset(m) { m.step = 0 },
    // m.next: 次の 8 分音符の時刻。少し先（0.2 秒）まで予約しておく
    schedule(m, now) {
      if (m.next < now) m.next = now + 0.05
      while (m.next < now + 0.2) {
        const at = m.next - now
        const beat = m.step % 8, chord = LIGHT_CHORDS[Math.floor(m.step / 8) % LIGHT_CHORDS.length]
        // 分散和音（木琴のコロン）
        if (beat === 0 || Math.random() > LIGHT_SKIP) mallet(at, hz(chord.arp[LIGHT_ARP[beat]]), 0.032, m.out)
        // ベース（1 拍目と 3 拍目。低い木琴の音を 1 オクターブ上の音も混ぜて柔らかく）
        if (beat === 0 || beat === 4) {
          tone({ at, f0: hz(chord.bass), dur: 0.9, peak: 0.05, attack: 0.015, out: m.level })
          mallet(at, hz(chord.bass + 12), 0.02, m.soft, 0.5)
        }
        // シェイカー（2 拍目と 4 拍目の裏だけ。ごく小さく）
        if (beat === 3 || beat === 7) noise({ at, freq: 6000, q: 0.8, dur: 0.05, peak: 0.006, attack: 0.003, type: 'highpass', out: m.level })
        // ときどき高い木琴のメロディ（表拍だけ。ペンタトニックなので、どの和音の上でも合う）
        if (beat % 2 === 0 && Math.random() < LIGHT_MELODY_CHANCE) {
          const n = LIGHT_MELODY[Math.floor(Math.random() * LIGHT_MELODY.length)]
          mallet(at, hz(n), 0.022, m.out, 0.5)
        }
        m.step = (m.step + 1) % (8 * LIGHT_CHORDS.length)
        m.next += LIGHT_STEP
      }
    },
  },
}

// name: 曲の名前（MUSIC_TRACKS）/ k: 大きさ（0〜1）。毎フレーム曲ごとに渡す
export function setMusic(name, k) {
  if (!ctx || muted || document.hidden) return   // 最初のタッチ・キーで音が起きるまでは何もしない
  const track = MUSIC_TRACKS[name]
  if (!track) return
  let m = musics[name]
  if (!m) {
    if (k <= 0) return
    const level = ctx.createGain(); level.gain.value = 0
    level.connect(master)
    m = musics[name] = { level, next: 0 }
    track.start(m)
  }
  const now = ctx.currentTime
  m.level.gain.setTargetAtTime(track.vol * k, now, MUSIC_TAU)
  if (k <= 0 && m.level.gain.value < 0.001) { m.next = 0; track.reset(m); return }   // 聞こえなくなったら音を作らない（次は曲の頭から）
  track.schedule(m, now)
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
