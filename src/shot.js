import * as THREE from 'three'

// ============================================================
//  立ち位置の URL パラメータと、SNS 用の自動撮影モード
//
//  ?lat=33.5&lon=-1&heading=120&pitch=10&light=1
//    その地点・向きから始める（heading: 北=0 東=90 の度、pitch: カメラの見上げ角の度、light: sabちゃんのライト 1=ON 0=OFF）
//  ?shot=1
//    下のコントローラーを隠し、指定がない値はランダムにして（夜側ではライトも SHOT_LIGHT_CHANCE の確率で点ける）、
//    画像の読み込みと起動演出が済んだら window.__shot.ready を true にする（scripts/shot.mjs が待って撮る）
//
//  画像の読み込み待ちのため、ほかのモジュールより先に import する
// ============================================================

const SHOT_FRAMES = 90   // 起動演出（コイン）が終わるまで待つフレーム数（30fps で 3 秒）
const SHOT_LIGHT_CHANCE = 0.5   // 撮影モードで夜側にいるとき、ライトを点けて撮る確率
const SHOT_NIGHT_X      = -0.2  // pDir.x がこれより小さければ夜側（太陽は +X。昼夜の境目のまだ明るいところは除く）

const params = new URLSearchParams(location.search)
const isShot = params.has('shot')
const num = (key) => {
  const v = parseFloat(params.get(key))
  return Number.isFinite(v) ? v : null
}
const round2 = (v) => Math.round(v * 100) / 100

// 撮影モードではパラメータのない値をランダムにする（球面上で一様になるよう lat は asin で引く）
// 撮った場所をそのままリンクにできるよう、小数 2 桁に丸めた値で立たせる
let lat = num('lat'), lon = num('lon'), heading = num('heading'), pitchDeg = num('pitch')
const lightParam = num('light')
if (isShot) {
  lat      ??= round2(Math.asin(Math.random() * 2 - 1) * 180 / Math.PI)
  lon      ??= round2(Math.random() * 360 - 180)
  heading  ??= round2(Math.random() * 360)
  pitchDeg ??= 'random'
}

if (isShot) {
  document.body.classList.add('shot')
  window.__shot = { ready: false }
}

// 読み込み中の画像の数（three のローダーはすべて DefaultLoadingManager を通る）
let pending = 0
if (isShot) {
  const mgr = THREE.DefaultLoadingManager
  const { itemStart, itemEnd } = mgr
  mgr.itemStart = (url) => { pending++; itemStart(url) }
  mgr.itemEnd   = (url) => { pending--; itemEnd(url) }
}
let pageLoaded = document.readyState === 'complete'
window.addEventListener('load', () => { pageLoaded = true })

// 立ち位置を pDir・pFwd に入れ、カメラの見上げ角 (rad) を返す（指定がなければ null）
// pitchMin / pitchMax: main.js のピッチの可動範囲 (rad)
export function applyStartPose(pDir, pFwd, pitchMin, pitchMax) {
  if (lat !== null && lon !== null) {
    const la = THREE.MathUtils.degToRad(lat)
    const th = THREE.MathUtils.degToRad(lon + 180)   // HUD の lon と同じ向き
    pDir.set(Math.cos(la) * Math.cos(th), Math.sin(la), Math.cos(la) * Math.sin(th))
    if (heading !== null) {
      // 北 = lat が増える向き、東 = lon が増える向き
      const north = new THREE.Vector3(-Math.sin(la) * Math.cos(th), Math.cos(la), -Math.sin(la) * Math.sin(th))
      const east  = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th))
      const h = THREE.MathUtils.degToRad(heading)
      pFwd.copy(north).multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h))
    } else {
      pFwd.addScaledVector(pDir, -pFwd.dot(pDir))
      if (pFwd.lengthSq() < 1e-6) pFwd.set(1, 0, 0).addScaledVector(pDir, -pDir.x)
    }
    pFwd.normalize()
  }
  if (pitchDeg === 'random') pitchDeg = round2(THREE.MathUtils.radToDeg(pitchMin + Math.random() * (pitchMax - pitchMin)))
  if (isShot) Object.assign(window.__shot, { lat, lon, heading, pitch: pitchDeg })
  if (pitchDeg === null) return null
  return THREE.MathUtils.clamp(THREE.MathUtils.degToRad(pitchDeg), pitchMin, pitchMax)
}

// 最初からライトを点けておくか。applyStartPose のあとに呼ぶ
export function startWithLight(pDir) {
  const on = lightParam !== null
    ? lightParam > 0
    : isShot && pDir.x < SHOT_NIGHT_X && Math.random() < SHOT_LIGHT_CHANCE
  if (isShot) window.__shot.light = on
  return on
}

// 毎フレームの描画のあとに呼ぶ。読み込みが済んでから SHOT_FRAMES 描いたら撮影の合図を出す
let framesAfterLoad = 0
export function shotFrameRendered() {
  if (!isShot || window.__shot.ready) return
  if (!pageLoaded || pending > 0) { framesAfterLoad = 0; return }
  if (++framesAfterLoad >= SHOT_FRAMES) window.__shot.ready = true
}

export const shotMode = isShot
