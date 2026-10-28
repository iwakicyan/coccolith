// ============================================================
//  投稿の中身（本文の材料と代替テキスト）を、撮った JSON から作る
//  Bluesky（post.mjs）と Mastodon（post-mastodon.mjs）で同じものを使う
// ============================================================

import { readFile, readdir } from 'node:fs/promises'

export const HASHTAGS = ['planet', 'planet_coccolith', 'time_of_coccolith', 'claude']   // 本文に並べるハッシュタグ（# なし）
export const SITE_URL = 'https://iwakicyan.github.io/coccolith/'

// 引数で JSON を指定されていなければ shots/ のいちばん新しいものを読む
export async function loadMeta(args) {
  let metaPath = args.find(a => !a.startsWith('--'))
  if (!metaPath) {
    const jsons = (await readdir('shots')).filter(f => f.endsWith('.json')).sort()
    if (!jsons.length) throw new Error('shots/ に撮影済みの画像がない（先に npm run shot）')
    metaPath = `shots/${jsons.at(-1)}`
  }
  return JSON.parse(await readFile(metaPath, 'utf8'))
}

// head: 1 行目（エリアと座標）、link: 動画のときだけ、撮り始めた地点・向きから始まるサイトへのリンク
export function buildPost(meta) {
  const fmt = (v) => v.toFixed(1)
  const isVideo = meta.file.endsWith('.mp4')
  const head = `${meta.area} | lat: ${fmt(meta.lat)}°  lon: ${fmt(meta.lon)}°`
  const link = isVideo
    ? {
        url: `${SITE_URL}?lat=${meta.lat}&lon=${meta.lon}&heading=${meta.heading}`,
        label: SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, ''),
      }
    : null
  const alt = isVideo
    ? `惑星 coccolith の lat ${fmt(meta.lat)}° lon ${fmt(meta.lon)}° から、方位 ${Math.round(meta.heading)}° へ ${meta.video.seconds * (meta.video.slow ?? 1)} 秒まっすぐ走った景色`
    : meta.view === 'overview'
      ? `惑星 coccolith を、lat ${fmt(meta.lat)}° lon ${fmt(meta.lon)}° の上空から見下ろした全体の姿`
      : `惑星 coccolith の lat ${fmt(meta.lat)}° lon ${fmt(meta.lon)}° から、方位 ${Math.round(meta.heading)}° を向いて撮った景色`
  return { isVideo, head, link, hashtags: HASHTAGS, alt }
}
