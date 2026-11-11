// ============================================================
//  coccolith の訪問者カウンター（Cloudflare Workers + D1）
//  1 日ごと（日本時間の 0 時で切り替わる）の訪問者数を数える
//  POST: 今日の訪問者として +1 して今日の数を返す（ページ側がその日の初回だけ送る）
//  GET:  今日の数を返すだけ
//  数えるのは公開ページ（ALLOWED_ORIGINS）からの POST だけ。ほかのサイトや開発サーバーからは数を読むだけ
//  （数を読むのは誰でもよいので、CORS はどこからでも通す）
//
//  板の書き込み（/notes）。名前なし・承認なしで、書いたらすぐ出る
//  GET    /notes?board=1          その板の新しい順 NOTES_LIST 件 → { notes: [{ id, text, at, pin }] }
//  POST   /notes  { board, text, pin } 書き込む（pin: ピンの色 NOTE_PINS のどれか。なければ red）（公開ページか開発サーバーから）。NOTE_MAX 文字まで・URL は不可・同じ IP は NOTE_GAP 秒あける
//  DELETE /notes?id=12&key=...    消す（key は wrangler secret の ADMIN_KEY）
// ============================================================

const ALLOWED_ORIGINS = ['https://iwakicyan.github.io']
const NOTE_ORIGINS = [...ALLOWED_ORIGINS, /^http:\/\/localhost:\d+$/]   // 書き込めるページ（開発サーバーからも試せるように）
const NOTE_BOARDS = 5      // 板の数
const NOTE_MAX    = 60     // 1 回に書ける文字数
const NOTE_GAP    = 30     // 同じ IP が次に書けるまでの秒数
const NOTE_LIST   = 50     // GET で返す件数
const NOTE_PINS   = ['red', 'blue', 'yellow', 'green']   // ピンの色
// URL らしいもの（http・www.・ドメインっぽい「英数.英字2文字以上」）。全角の英数・記号は半角に寄せてから見る
const URL_RE = /(https?:|www\.|[a-z0-9-]+\s*[.．。]\s*(com|net|org|jp|io|me|ly|co|app|dev|xyz|info|link|site|gg|tv|to|cc|be|us)\b|\/\/)/i
const halfWidth = t => t.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
const sha256 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('')

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
      return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type' } })
    }
    const url = new URL(req.url)
    if (url.pathname === '/notes') return notes(req, env, url, origin, headers)

    const day = todayJST()
    const row = req.method === 'POST' && allowed
      ? await env.DB.prepare('INSERT INTO daily (day, n) VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 RETURNING n').bind(day).first()
      : await env.DB.prepare('SELECT n FROM daily WHERE day = ?1').bind(day).first()
    return Response.json({ count: row?.n ?? 0 }, { headers })
  },
}

async function notes(req, env, url, origin, headers) {
  const json = (body, status = 200) => Response.json(body, { status, headers })
  if (req.method === 'GET') {
    const board = parseInt(url.searchParams.get('board'), 10)
    if (!(board >= 1 && board <= NOTE_BOARDS)) return json({ error: 'board' }, 400)
    const { results } = await env.DB.prepare('SELECT id, text, at, pin FROM notes WHERE board = ?1 ORDER BY id DESC LIMIT ?2').bind(board, NOTE_LIST).all()
    return json({ notes: results })
  }
  if (req.method === 'DELETE') {
    if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return json({ error: 'key' }, 403)
    const id = parseInt(url.searchParams.get('id'), 10)
    const r = await env.DB.prepare('DELETE FROM notes WHERE id = ?1').bind(id).run()
    return json({ deleted: r.meta.changes })
  }
  if (req.method === 'POST') {
    if (!NOTE_ORIGINS.some(o => typeof o === 'string' ? o === origin : o.test(origin))) return json({ error: 'origin' }, 403)
    let body
    try { body = await req.json() } catch { return json({ error: 'body' }, 400) }
    const board = parseInt(body?.board, 10)
    if (!(board >= 1 && board <= NOTE_BOARDS)) return json({ error: 'board' }, 400)
    const text = String(body?.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return json({ error: 'empty' }, 400)
    if ([...text].length > NOTE_MAX) return json({ error: 'long' }, 400)
    if (URL_RE.test(halfWidth(text))) return json({ error: 'url' }, 400)
    const pin = NOTE_PINS.includes(body?.pin) ? body.pin : 'red'
    const ip = await sha256((req.headers.get('CF-Connecting-IP') || '') + (env.ADMIN_KEY || ''))
    const now = Date.now()
    const last = await env.DB.prepare('SELECT at FROM notes WHERE ip = ?1 ORDER BY at DESC LIMIT 1').bind(ip).first()
    if (last && now - last.at < NOTE_GAP * 1000) return json({ error: 'wait', wait: Math.ceil((NOTE_GAP * 1000 - (now - last.at)) / 1000) }, 429)
    const row = await env.DB.prepare('INSERT INTO notes (board, text, at, ip, pin) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, text, at, pin').bind(board, text, now, ip, pin).first()
    return json({ note: row })
  }
  return json({ error: 'method' }, 405)
}
