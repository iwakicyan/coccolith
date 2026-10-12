// ============================================================
//  金属の映り込み用の夜景（public/env/kanban.png）を、PMREM（roughness ごとにぼかした CubeUV）にして画像で書き出す
//
//    node scripts/bake-env.mjs        … public/env/kanban_pmrem.png を作り直す
//
//  ページを開くたびに PMREMGenerator で作ると、専用シェーダーのコンパイルとぼかしの描画でスマホの起動が 1 秒近く止まる
//  中身は毎回同じなので、ここで一度だけ作り、nightEnv.js はその画像を読むだけにする
//  kanban.png を描き直したら、これを実行し直す
// ============================================================

import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const SRC  = 'public/env/kanban.png'
const OUT  = 'public/env/kanban_pmrem.png'
const BASE = 'http://bake.local/'

const files = {
  'index.html': { type: 'text/html', body: `<script type="importmap">{"imports":{"three":"./three.module.js"}}</script>` },
  'three.module.js': { type: 'text/javascript', body: await readFile('node_modules/three/build/three.module.js') },
  'kanban.png': { type: 'image/png', body: await readFile(SRC) },
}

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.error('[page]', e.message))
  await page.route(`${BASE}**`, route => {
    const f = files[route.request().url().slice(BASE.length)]
    route.fulfill(f ? { contentType: f.type, body: f.body } : { status: 404 })
  })
  await page.goto(`${BASE}index.html`)

  const dataUrl = await page.evaluate(async () => {
    const THREE = await import('three')
    const renderer = new THREE.WebGLRenderer()
    const gl = renderer.getContext()
    gl.getExtension('EXT_color_buffer_float')   // 半精度のレンダーターゲットを float で読み出すため

    // nightEnv.js が実行時にしていたのと同じ設定で PMREM を作る
    const tex = await new THREE.TextureLoader().loadAsync('kanban.png')
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.SRGBColorSpace
    const rt = new THREE.PMREMGenerator(renderer).fromEquirectangular(tex)

    const { width: w, height: h } = rt
    const px = new Float32Array(w * h * 4)
    renderer.setRenderTarget(rt)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px)

    // リニア → sRGB の 8bit にし（読むときに GPU がリニアへ戻す）、GL の下から上の行順を画像の上から下へ並べ替える
    const toSRGB = v => {
      v = Math.min(1, Math.max(0, v))
      return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))
    }
    const img = new ImageData(w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4
        img.data[d] = toSRGB(px[s]); img.data[d + 1] = toSRGB(px[s + 1]); img.data[d + 2] = toSRGB(px[s + 2]); img.data[d + 3] = 255
      }
    }
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    cv.getContext('2d').putImageData(img, 0, 0)
    return cv.toDataURL('image/png')
  })

  const png = Buffer.from(dataUrl.split(',')[1], 'base64')
  await writeFile(OUT, png)
  console.log(`${OUT} (${png.length} bytes)`)
} finally {
  await browser.close()
}
