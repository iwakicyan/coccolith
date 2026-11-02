// ============================================================
//  ジャイロ — 端末の傾き（deviceorientation）で主観視点を動かす
//  傾きそのものではなく、前のフレームからの変化（左右の回転・上下の向き）を main.js が視点に足す
//  iOS はボタンを押したときに許可を取る必要がある（設定の ON から enableGyro を呼ぶ）。https でないと値が来ない
// ============================================================
import * as THREE from 'three'

export const gyro = { on: false }

let ori = null                 // 最後に届いた { alpha, beta, gamma }（度）
let prevYaw = null, prevPitch = 0
const _q     = new THREE.Quaternion()
const _qScr  = new THREE.Quaternion()
const _qCam  = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))   // 端末の背面 → カメラの前（X 軸まわりに -90°）
const _euler = new THREE.Euler()
const _zee   = new THREE.Vector3(0, 0, 1)
const _f     = new THREE.Vector3()
const RAD = Math.PI / 180

function onOrientation(e) {
  if (e.alpha == null) return
  ori = { alpha: e.alpha, beta: e.beta, gamma: e.gamma }
}

// 傾きが取れる端末・ブラウザか（PC でも true になることがあり、そのときは値が届かないだけ）
export const gyroSupported = () => typeof window.DeviceOrientationEvent !== 'undefined'

// ON にする。iOS は許可を聞く（ボタンの click の中で呼ぶこと）。使えなければ false
export async function enableGyro() {
  if (!gyroSupported()) return false
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const res = await DeviceOrientationEvent.requestPermission().catch(() => 'denied')
    if (res !== 'granted') return false
  }
  window.addEventListener('deviceorientation', onOrientation)
  gyro.on = true
  prevYaw = null
  return true
}

export function disableGyro() {
  window.removeEventListener('deviceorientation', onOrientation)
  gyro.on = false
  ori = null
}

// 前に呼んだときからの向きの変化（rad）。yaw は左へ回すと +、pitch は上を向くと +
// 主観でないときも毎フレーム呼んで、主観に切り替えた瞬間に溜まった変化で視点が跳ねないようにする
const ZERO = { yaw: 0, pitch: 0 }
export function takeGyroDelta() {
  if (!gyro.on || !ori) return ZERO
  // three.js の DeviceOrientationControls と同じ手順で、端末を覗いたときのカメラの向きを出す
  const screenAngle = (screen.orientation?.angle ?? window.orientation ?? 0) * RAD
  _euler.set(ori.beta * RAD, ori.alpha * RAD, -ori.gamma * RAD, 'YXZ')
  _q.setFromEuler(_euler).multiply(_qCam).multiply(_qScr.setFromAxisAngle(_zee, -screenAngle))
  _f.set(0, 0, -1).applyQuaternion(_q)
  const pitch = Math.asin(Math.max(-1, Math.min(1, _f.y)))
  // 真上・真下を向いていると左右の向きが定まらないので、そのあいだは左右を動かさない
  const yaw = Math.abs(_f.y) < 0.97 ? Math.atan2(-_f.x, -_f.z) : prevYaw
  if (prevYaw === null || yaw === null) { prevYaw = yaw; prevPitch = pitch; return ZERO }
  let dYaw = yaw - prevYaw
  if (dYaw > Math.PI) dYaw -= Math.PI * 2
  else if (dYaw < -Math.PI) dYaw += Math.PI * 2
  const d = { yaw: dYaw, pitch: pitch - prevPitch }
  prevYaw = yaw
  prevPitch = pitch
  return d
}
