-- 日ごとの訪問者数（day は日本時間の YYYY-MM-DD）
CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, n INTEGER NOT NULL);

-- 板の書き込み（board は板の番号 1〜5、pin はピンの色、ord は板の中の順位（大きいほど上）、coins は入ったコインの数、at は書いた時刻のミリ秒、ip は書いた人の IP のハッシュ。連投を止めるだけに使う）
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, board INTEGER NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, ip TEXT NOT NULL, pin TEXT NOT NULL DEFAULT 'red', ord INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS notes_board ON notes (board, id);
CREATE INDEX IF NOT EXISTS notes_ip ON notes (ip, at);
CREATE INDEX IF NOT EXISTS notes_ord ON notes (board, ord);

-- 書き込みにコインを入れた記録（同じ IP は同じ書き込みに 1 日 1 枚まで。day は日本時間の YYYY-MM-DD）
CREATE TABLE IF NOT EXISTS coin_log (note INTEGER NOT NULL, ip TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (note, ip, day));

-- pin はピンの色（red・blue・yellow・green）。あとから足した列で、本番の D1 には次で足した：
-- ALTER TABLE notes ADD COLUMN pin TEXT NOT NULL DEFAULT 'red';
-- ord（順位。大きいほど上）と coins（入ったコインの数）もあとから足した：
-- ALTER TABLE notes ADD COLUMN ord INTEGER NOT NULL DEFAULT 0; ALTER TABLE notes ADD COLUMN coins INTEGER NOT NULL DEFAULT 0; UPDATE notes SET ord = id;
