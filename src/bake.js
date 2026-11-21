// ============================================================
//  起動のたびに同じ答えになる重い計算を、書き出しておいたもの（baked.json）から読む
//
//  地形は決まった種から作るので、道沿いの地面の高さや、草・ドット絵の地面をどこに置くかは毎回同じになる
//  開くたびに計算すると起動が止まるので、scripts/bake.mjs で一度だけ計算して書き出し、ここではそれを読むだけにする
//
//  書き出したものは、数が合い、何か所か計算し直して合うときだけ使う
//  （地形・道・建物などを変えて書き出し直していなければ、今まで通りその場で全部計算する。コンソールに知らせる）
//  ?bake で開くと書き出したものは使わずに全部計算し、window.__bake に入れる（scripts/bake.mjs が読む）
//
//  rideHeights(key, N, measure)  … 動く台（gondola・gondeer）の道沿いの高さ。measure(i) で点 i の高さ (m) を測る
//  bakeBits(key, n, test)        … n 個の候補のうちどれを使うか。test(k) で候補 k を使うかを計算する。返すのは k → 使うか
// ============================================================

import BAKED from './baked.json'

export const baking = typeof location !== 'undefined' && new URLSearchParams(location.search).has('bake')
const computed = {}  // ?bake のとき、計算したもの
if (baking) window.__bake = computed

const warn = key => console.warn(`[bake] ${key}: 書き出したものが今の地形と合わないので、その場で計算します（node scripts/bake.mjs で書き出し直す）`)

// --- 動く台の道沿いの高さ（cm の整数で書き出す） ---
const CHECK = 16     // 書き出したものが今の地形と合うか、測り直して確かめる点の数
const TOL   = 0.02   // 合っているとみなす差 (m)。書き出しは cm に丸めている
const SCALE = 100    // 書き出しの単位（m → cm の整数）

export function rideHeights(key, N, measure) {
  const b = baking ? null : BAKED[`ride:${key}`]
  if (b) {
    let ok = b.length === N
    for (let k = 0; ok && k < CHECK; k++) {
      const i = Math.round(k * (N - 1) / (CHECK - 1))
      ok = Math.abs(measure(i) - b[i] / SCALE) <= TOL
    }
    if (ok) return Float32Array.from(b, v => v / SCALE)
  }
  if (!baking) warn(`ride:${key}`)
  const raw = new Float32Array(N)
  for (let i = 0; i < N; i++) raw[i] = measure(i)
  if (baking) computed[`ride:${key}`] = Array.from(raw, v => Math.round(v * SCALE))
  return raw
}

// --- 候補のうちどれを使うか（1 候補 1 ビットにして base64 で書き出す） ---
//   確かめるのは、候補の数と、候補全体から等間隔に CHECK 個・使う候補から等間隔に CHECK 個を計算し直したもの
const bitOf = (bits, k) => (bits[k >> 3] >> (k & 7)) & 1
const toBase64 = bits => { let s = ''; for (const v of bits) s += String.fromCharCode(v); return btoa(s) }
const fromBase64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0))

export function bakeBits(key, n, test) {
  const b = baking || !key ? null : BAKED[key]
  if (b) {
    const bits = fromBase64(b.bits)
    let ok = b.n === n && bits.length === Math.ceil(n / 8)
    const on = []
    if (ok) for (let k = 0; k < n; k++) if (bitOf(bits, k)) on.push(k)
    const check = k => ok = ok && !!test(k) === !!bitOf(bits, k)
    for (let c = 0; ok && n > 0 && c < CHECK; c++) check(Math.round(c * (n - 1) / (CHECK - 1)))
    for (let c = 0; ok && on.length > 0 && c < CHECK; c++) check(on[Math.round(c * (on.length - 1) / (CHECK - 1))])
    if (ok) return k => bitOf(bits, k) === 1
  }
  if (key && !baking) warn(key)
  const bits = new Uint8Array(Math.ceil(n / 8))
  for (let k = 0; k < n; k++) if (test(k)) bits[k >> 3] |= 1 << (k & 7)
  if (baking && key) computed[key] = { n, bits: toBase64(bits) }
  return k => bitOf(bits, k) === 1
}
