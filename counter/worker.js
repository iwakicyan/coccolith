// ============================================================
//  coccolith の訪問者カウンター（Cloudflare Workers + D1）
//  1 日ごと（日本時間の 0 時で切り替わる）の訪問者数を数える
//  POST: 今日の訪問者として +1 して今日の数を返す（ページ側がその日の初回だけ送る）
//  GET:  今日の数を返すだけ
//  数えるのは公開ページ（ALLOWED_ORIGINS）からの POST だけ。ほかのサイトや開発サーバーからは数を読むだけ
//  （数を読むのは誰でもよいので、CORS はどこからでも通す）
// ============================================================

const ALLOWED_ORIGINS = ['https://iwakicyan.github.io']

// 日本時間の今日の日付（YYYY-MM-DD）。ページ側の visitCounter.js と同じ式
const todayJST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

export default {
  async fetch(req, env) {
    const origin  = req.headers.get('Origin') || ''
    const allowed = ALLOWED_ORIGINS.includes(origin)
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST' } })
    }

    const day = todayJST()
    const row = req.method === 'POST' && allowed
      ? await env.DB.prepare('INSERT INTO daily (day, n) VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 RETURNING n').bind(day).first()
      : await env.DB.prepare('SELECT n FROM daily WHERE day = ?1').bind(day).first()
    return Response.json({ count: row?.n ?? 0 }, { headers })
  },
}
