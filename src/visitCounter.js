// ============================================================
//  今日の訪問者数 — HUD 1行目の veth の右に「| visitors today: 12」と出す（数えるのは counter/ の Cloudflare Worker）
//  1 日 1 人 1 カウント: このブラウザでその日（日本時間）初めて開いたときだけ +1 を送り、送った日付を localStorage に残す
//  開発サーバー・撮影モードでは数えず、今の数を読むだけ。localStorage が使えないときも数えない
// ============================================================

// counter/ をデプロイしたら、その URL（https://coccolith-counter.<アカウント>.workers.dev）を入れる。空なら何も出さない
const COUNTER_URL = 'https://coccolith-counter.kassymokku-884.workers.dev'
const VISITED_KEY = 'coccolith.visitedDay'

// 日本時間の今日の日付（YYYY-MM-DD）。counter/worker.js と同じ式
const todayJST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

// el: 区切りごと出し入れする枠、numEl: 数を入れるところ
export function initVisitCounter(el, numEl, { countable }) {
  if (!COUNTER_URL) return
  let isNew = false
  if (countable) {
    try {
      const today = todayJST()
      isNew = localStorage.getItem(VISITED_KEY) !== today
      if (isNew) localStorage.setItem(VISITED_KEY, today)   // 送る前に残す（読み込み直しで二重に数えない）
    } catch { isNew = false }
  }
  fetch(COUNTER_URL, { method: isNew ? 'POST' : 'GET' })
    .then(r => r.json())
    .then(({ count }) => {
      if (!Number.isFinite(count)) return
      numEl.textContent = count.toLocaleString()
      el.hidden = false
    })
    .catch(() => { /* 数が取れなければ出さない */ })
}
