// ============================================================
//  動く台（gondola・gondeer）の道沿いの地面の高さを、書き出しておいたもの（rideHeights.json）から読む
//
//  地形は決まった種から作るので、道沿いに測る高さは毎回同じになる。開くたびに何万回もレイを飛ばして測ると
//  起動が止まるので、scripts/bake-rides.mjs で一度だけ測って書き出し、ここではそれを読むだけにする
//
//  rideHeights(key, N, measure)
//    key:     台ごとの名前（rideHeights.json のキー）
//    N:       道の点の数
//    measure: measure(i) で点 i の高さを測る（書き出したものが使えないときと、確かめるときに使う）
//  書き出したものは、点の数が合い、道に沿って CHECK か所を測り直して TOL 以内で合うときだけ使う
//  （地形・道・道沿いの建物を変えて書き出し直していなければ、今まで通りその場で全部測る。コンソールに知らせる）
//
//  ?bake-rides で開くと書き出したものは使わずに全部測り、window.__rideBake に入れる（scripts/bake-rides.mjs が読む）
// ============================================================

import BAKED from './rideHeights.json'

const CHECK = 16     // 書き出したものが今の地形と合うか、測り直して確かめる点の数
const TOL   = 0.02   // 合っているとみなす差 (m)。書き出しは cm に丸めている
const SCALE = 100    // 書き出しの単位（m → cm の整数）

export const bakingRides = typeof location !== 'undefined' && new URLSearchParams(location.search).has('bake-rides')
const measured = {}  // ?bake-rides のとき、測った高さ（cm の整数）
if (bakingRides) window.__rideBake = measured

export function rideHeights(key, N, measure) {
  const b = BAKED[key]
  if (!bakingRides && b) {
    let ok = b.length === N
    for (let k = 0; ok && k < CHECK; k++) {
      const i = Math.round(k * (N - 1) / (CHECK - 1))
      ok = Math.abs(measure(i) - b[i] / SCALE) <= TOL
    }
    if (ok) return Float32Array.from(b, v => v / SCALE)
  }
  if (!bakingRides) console.warn(`[rideHeights] ${key}: 書き出した高さが今の地形と合わないので、その場で測ります（node scripts/bake-rides.mjs で書き出し直す）`)
  const raw = new Float32Array(N)
  for (let i = 0; i < N; i++) raw[i] = measure(i)
  if (bakingRides) measured[key] = Array.from(raw, v => Math.round(v * SCALE))
  return raw
}
