// ============================================================
//  coccolith の訪問者カウンター（Cloudflare Workers + D1）
//  POST: 1 人目の訪問として +1 して今の数を返す（ページ側が初回だけ送る）
//  GET:  今の数を返すだけ
//  数えるのは公開ページ（ALLOWED_ORIGINS）からの POST だけ。ほかのサイトや開発サーバーからは数を読むだけ
//  （数を読むのは誰でもよいので、CORS はどこからでも通す）
// ============================================================

const ALLOWED_ORIGINS = ['https://iwakicyan.github.io']

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

    const row = req.method === 'POST' && allowed
      ? await env.DB.prepare("UPDATE counter SET n = n + 1 WHERE id = 'visitors' RETURNING n").first()
      : await env.DB.prepare("SELECT n FROM counter WHERE id = 'visitors'").first()
    return Response.json({ count: row?.n ?? 0 }, { headers })
  },
}
