// ============================================================
//  定数 — 全モジュール共有
//  単位: 1 unit = 1m
// ============================================================

export const R_C        = 358     // coccolith 半径 (m)
export const R_V        = 300     // veth 半径 (m)
export const ORBIT      = 2000    // veth 軌道半径・惑星中心から (m)
export const LAND_LIFT  = 9       // 陸地の押し出し量 (m)  → 陸地頂点半径 R_C+9 = 367m

// 光の粒の立ちのぼり（sparkleFountain.js）の場所。地面の EF のドット絵も同じ範囲に貼る（coccolith.js）
//   edgeSeed: 縁のギザギザの形（場所ごとに変える）
export const SPARKLE_AT = [
  { lat: -11, lon: -136, edgeSeed: 7 },
  { lat: -11, lon: -31, edgeSeed: 23 },
]
