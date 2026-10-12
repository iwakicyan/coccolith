// ============================================================
//  訪問者数 — HUD 1行目の veth の右に「| visitors: 123」と出す（数えるのは counter/ の Cloudflare Worker）
//  1 人 1 カウント: このブラウザで初めて開いたときだけ +1 を送り、送ったことを localStorage に残す
//  開発サーバー・撮影モードでは数えず、今の数を読むだけ。localStorage が使えないときも数えない
// ============================================================

// counter/ をデプロイしたら、その URL（https://coccolith-counter.<アカウント>.workers.dev）を入れる。空なら何も出さない
const COUNTER_URL = 'https://coccolith-counter.kassymokku-884.workers.dev'
const VISITED_KEY = 'coccolith.visited'

// el: 区切りごと出し入れする枠、numEl: 数を入れるところ
export function initVisitCounter(el, numEl, { countable }) {
  if (!COUNTER_URL) return
  let isNew = false
  if (countable) {
    try {
      isNew = !localStorage.getItem(VISITED_KEY)
      if (isNew) localStorage.setItem(VISITED_KEY, '1')   // 送る前に残す（読み込み直しで二重に数えない）
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
