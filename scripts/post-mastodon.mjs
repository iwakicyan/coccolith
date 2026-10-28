// ============================================================
//  scripts/shot.mjs・video.mjs で撮った画像や動画を Mastodon に投稿する（Bluesky への post.mjs と同じ中身）
//
//    MASTODON_ACCESS_TOKEN=… npm run post:mastodon                  … shots/ のいちばん新しい 1 枚
//    npm run post:mastodon -- shots/20261005-125526.json             … 指定した 1 枚
//    npm run post:mastodon -- --dry-run                              … 投稿せず中身だけ表示
//    npm run post:mastodon -- --skip-if-posted-within=100            … 直近 100 分以内に写真の投稿があれば投稿しない
//
//  トークンは Mastodon の「ユーザー設定 → 開発 → 新規アプリ」で、権限 write:media・write:statuses・
//  read:accounts・read:statuses（read の 2 つは --skip-if-posted-within で自分の投稿を見るのに使う）をつけて作る
//  サーバーは MASTODON_INSTANCE（省略時は mastodon.social）
// ============================================================

import { readFile } from 'node:fs/promises'
import { loadMeta, buildPost } from './post-text.mjs'

const INSTANCE      = process.env.MASTODON_INSTANCE ?? 'https://mastodon.social'
const VISIBILITY    = 'public'        // public: 公開（ローカル・連合タイムラインにも流れる）、unlisted: 未収載（フォロワーとプロフィールにだけ出る）
const MEDIA_TIMEOUT = 10 * 60_000     // 動画の変換を待つ上限

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const skipWithin = Number(args.find(a => a.startsWith('--skip-if-posted-within='))?.split('=')[1] ?? 0)
const meta = await loadMeta(args)
const { isVideo, head, link, hashtags, alt } = buildPost(meta)

// Mastodon は URL もハッシュタグも本文に書けばリンクになる（URL は長さによらず 23 文字と数えられる）
const status = [head, link?.url, hashtags.map(t => `#${t}`).join(' ')].filter(Boolean).join('\n\n')

if (dryRun) {
  console.log(JSON.stringify({ instance: INSTANCE, visibility: VISIBILITY, status, alt, file: meta.file }, null, 2))
  process.exit(0)
}

const { MASTODON_ACCESS_TOKEN } = process.env
if (!MASTODON_ACCESS_TOKEN) throw new Error('MASTODON_ACCESS_TOKEN を環境変数で渡す')

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${INSTANCE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${MASTODON_ACCESS_TOKEN}`, ...headers },
    body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} が失敗した: ${res.status} ${JSON.stringify(json)}`)
  return { status: res.status, json }
}

// やり直しの回で、Bluesky には失敗したが Mastodon には投稿できていたときに二重に出さないため
// （朝の動画の投稿は数えない）
if (skipWithin > 0) {
  const { json: me } = await api('GET', '/api/v1/accounts/verify_credentials')
  const { json: recent } = await api('GET', `/api/v1/accounts/${me.id}/statuses?limit=5&exclude_replies=true&exclude_reblogs=true`)
  const last = recent.find(s => s.media_attachments?.[0]?.type !== 'video')
  if (last && Date.now() - Date.parse(last.created_at) < skipWithin * 60_000) {
    console.log(`直近 ${skipWithin} 分以内に投稿済み（${last.url}）なので投稿しない`)
    process.exit(0)
  }
}

// 画像・動画を上げる。動画は変換が済むまで url が null なので待つ
const form = new FormData()
form.append('file', new Blob([await readFile(meta.file)], { type: isVideo ? 'video/mp4' : 'image/jpeg' }), meta.file.split('/').at(-1))
form.append('description', alt)
let { json: media } = await api('POST', '/api/v2/media', form)
const deadline = Date.now() + MEDIA_TIMEOUT
while (!media.url) {
  if (Date.now() > deadline) throw new Error('画像・動画の変換が終わらない')
  await new Promise(r => setTimeout(r, 3000))
  const res = await fetch(`${INSTANCE}/api/v1/media/${media.id}`, { headers: { Authorization: `Bearer ${MASTODON_ACCESS_TOKEN}` } })
  if (res.status === 206) continue   // まだ変換中
  if (!res.ok) throw new Error(`GET /api/v1/media/${media.id} が失敗した: ${res.status}`)
  media = await res.json()
}

// 同じ撮影を二度投稿しないよう、撮影ファイル名を Idempotency-Key にする（同じキーは 1 時間のあいだ 1 回だけ投稿される）
const { json: posted } = await api('POST', '/api/v1/statuses',
  JSON.stringify({ status, media_ids: [media.id], visibility: VISIBILITY, language: 'ja' }),
  { 'Content-Type': 'application/json', 'Idempotency-Key': meta.file },
)
console.log(posted.url)
