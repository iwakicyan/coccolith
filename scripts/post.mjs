// ============================================================
//  scripts/shot.mjs で撮った画像を Bluesky に投稿する
//
//    BLUESKY_HANDLE=… BLUESKY_APP_PASSWORD=… npm run post            … shots/ のいちばん新しい 1 枚
//    npm run post -- shots/20261005-125526.json                      … 指定した 1 枚
//    npm run post -- --dry-run                                       … 投稿せず中身だけ表示
//
//  本文は座標とハッシュタグ（サイトへのリンクはプロフィールに置く）
//  JSON の file が .mp4（scripts/video.mjs で撮った動画）なら動画として投稿する
// ============================================================

import { readFile, readdir } from 'node:fs/promises'
import { AtpAgent } from '@atproto/api'

const HASHTAGS  = ['planet', 'planet_coccolith', 'time_of_coccolith', 'claude']   // 本文に並べるハッシュタグ（# なし）
const IMG_SIZE  = { width: 2400, height: 1350 }   // shot.mjs の書き出しサイズ

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
let metaPath = args.find(a => !a.startsWith('--'))
if (!metaPath) {
  const jsons = (await readdir('shots')).filter(f => f.endsWith('.json')).sort()
  if (!jsons.length) throw new Error('shots/ に撮影済みの画像がない（先に npm run shot）')
  metaPath = `shots/${jsons.at(-1)}`
}
const meta = JSON.parse(await readFile(metaPath, 'utf8'))

const fmt = (v) => v.toFixed(1)
// ハッシュタグは、本文のどこからどこまでかを UTF-8 のバイト数で指定する
const bytes = (s) => new TextEncoder().encode(s).length
let text = ''
const facets = []
function append(s, feature) {
  if (feature) facets.push({ index: { byteStart: bytes(text), byteEnd: bytes(text) + bytes(s) }, features: [feature] })
  text += s
}
append(`${meta.area} | lat: ${fmt(meta.lat)}°  lon: ${fmt(meta.lon)}°\n\n`)
HASHTAGS.forEach((tag, i) => {
  if (i > 0) append(' ')
  append(`#${tag}`, { $type: 'app.bsky.richtext.facet#tag', tag })
})
const isVideo = meta.file.endsWith('.mp4')
const alt = isVideo
  ? `惑星 coccolith の lat ${fmt(meta.lat)}° lon ${fmt(meta.lon)}° から、方位 ${Math.round(meta.heading)}° へ ${meta.video.seconds} 秒まっすぐ走った景色`
  : `惑星 coccolith の lat ${fmt(meta.lat)}° lon ${fmt(meta.lon)}° から、方位 ${Math.round(meta.heading)}° を向いて撮った景色`

if (dryRun) {
  console.log(JSON.stringify({ text, facets, alt, image: meta.file }, null, 2))
  process.exit(0)
}

const { BLUESKY_HANDLE, BLUESKY_APP_PASSWORD } = process.env
if (!BLUESKY_HANDLE || !BLUESKY_APP_PASSWORD) throw new Error('BLUESKY_HANDLE と BLUESKY_APP_PASSWORD を環境変数で渡す')

const agent = new AtpAgent({ service: 'https://bsky.social' })
await agent.login({ identifier: BLUESKY_HANDLE, password: BLUESKY_APP_PASSWORD })
const { data: blob } = await agent.uploadBlob(await readFile(meta.file), { encoding: isVideo ? 'video/mp4' : 'image/jpeg' })
const res = await agent.post({
  text,
  facets,
  langs: ['ja'],
  embed: isVideo
    ? { $type: 'app.bsky.embed.video', video: blob.blob, alt, aspectRatio: { width: meta.video.width, height: meta.video.height } }
    : { $type: 'app.bsky.embed.images', images: [{ image: blob.blob, alt, aspectRatio: IMG_SIZE }] },
  createdAt: new Date().toISOString(),
})
console.log(res.uri)
