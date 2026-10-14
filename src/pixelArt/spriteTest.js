// 8 方向スプライト（pixelSprite.js）の仮の絵。本番の絵ができたら同じ形のデータに差し替える
//  { palette, width, height, views: { front, frontRight, right, backRight, back, top } }（views は grid: [行][列] = 番号）
//  側面の 5 枚は、オブジェクトのまわりを右回りに回り込んで見た絵。左側の 3 方向はこの右側の絵を左右反転して使う
//    front: 正面から / frontRight: 右斜め前から / right: 右から（オブジェクトの前が画面の右） / backRight: 右斜め後ろから / back: 後ろから
//  top: 真上から見た絵（オブジェクトの前が画像の上、右が画像の右）
//  側面はどの絵も、いちばん下の行が地面に接し、左右の中心がオブジェクトの中心
//
//  仮の絵: 胴体の色を絵ごとに変え、黄色い鼻で前の向きを、上の文字で絵の名前を示す（鼻が向こう側に回ると暗くなる）

const W = 48, H = 48

const palette = {
  0: null,
  1: '#1A1C2C',   // 縁取り・文字
  2: '#FFD23F',   // 鼻（手前に見える）
  3: '#8A6F1E',   // 鼻（向こう側）
  4: '#E9E4D4',   // 文字の地
  10: '#D9534F',  // front
  11: '#F0883E',  // frontRight
  12: '#5CB85C',  // right
  13: '#3FA7D6',  // backRight
  14: '#8E6CCF',  // back
  15: '#C9C9C9',  // top
}

// 3×5 の文字
const FONT = {
  F: ['111', '100', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  T: ['111', '010', '010', '010', '010'],
}

const blank = () => Array.from({ length: H }, () => new Array(W).fill(0))

function label(g, text, cy) {
  const w = text.length * 4 + 1
  const x0 = Math.floor((W - w) / 2)
  for (let y = cy - 1; y < cy + 6; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = 4
  ;[...text].forEach((ch, i) => FONT[ch].forEach((row, dy) => [...row].forEach((b, dx) => {
    if (b === '1') g[cy + dy][x0 + 1 + i * 4 + dx] = 1
  })))
}

function ellipse(g, cx, cy, rx, ry, n, edge) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
    if (d <= 1) g[y][x] = edge && d > 0.8 ? 1 : n
  }
}

// 横から見た角度 a（0 = 正面、90° = 右）での側面の絵
function side(a, n, text) {
  const g = blank()
  ellipse(g, W / 2, 30, 13, 17, n, true)
  // 鼻: 画面の横位置は sin、手前か向こう側かは cos
  const s = Math.sin(a * Math.PI / 180), c = Math.cos(a * Math.PI / 180)
  const nx = Math.round(W / 2 + s * 12), ny = 30
  if (c > -0.01 || Math.abs(s) > 0.5) {
    const k = c > -0.01 ? 2 : 3
    for (let y = ny - 2; y < ny + 2; y++) for (let x = nx - 2; x < nx + 2; x++) g[y][x] = k
    if (Math.abs(s) > 0.9) for (let y = ny - 1; y < ny + 1; y++) for (let x = nx; x < nx + 4; x++) if (x < W) g[y][x] = k
  }
  label(g, text, 4)
  return g
}

function top() {
  const g = blank()
  ellipse(g, W / 2, H / 2 + 2, 14, 14, 15, true)
  for (let y = 8; y < 14; y++) for (let x = W / 2 - 2; x < W / 2 + 2; x++) g[y][x] = 2   // 鼻（前 = 上）
  label(g, 'T', 20)
  return g
}

export const SPRITE_TEST = {
  palette, width: W, height: H,
  views: {
    front:      side(0,   10, 'F'),
    frontRight: side(45,  11, 'FR'),
    right:      side(90,  12, 'R'),
    backRight:  side(135, 13, 'BR'),
    back:       side(180, 14, 'B'),
    top:        top(),
  },
}
