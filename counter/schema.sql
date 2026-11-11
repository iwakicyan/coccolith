-- 日ごとの訪問者数（day は日本時間の YYYY-MM-DD）
CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, n INTEGER NOT NULL);

-- 板の書き込み（board は板の番号 1〜5、pin はピンの色、at は書いた時刻のミリ秒、ip は書いた人の IP のハッシュ。連投を止めるだけに使う）
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, board INTEGER NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, ip TEXT NOT NULL, pin TEXT NOT NULL DEFAULT 'red');
CREATE INDEX IF NOT EXISTS notes_board ON notes (board, id);
CREATE INDEX IF NOT EXISTS notes_ip ON notes (ip, at);

-- pin はピンの色（red・blue・yellow・green）。あとから足した列で、本番の D1 には次で足した：
-- ALTER TABLE notes ADD COLUMN pin TEXT NOT NULL DEFAULT 'red';
