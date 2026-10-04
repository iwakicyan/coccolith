import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

// 看板の電光掲示板に出す更新履歴（git のコミットの件名。新しい順・マージは除く）
// 開発サーバーでは起動時に読むので、最新を出すには再起動する
function readChangelog(n = 30) {   // 看板に入る行数より多めに読む（ledBoard.js が入るぶんだけ使う）
  try {
    return execSync(`git log --no-merges -n ${n} --format=%cs%x09%s`, { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
      .map(line => {
        const [date, ...rest] = line.split('\t')
        return { date, subject: rest.join('\t') }
      })
  } catch {
    return []
  }
}

export default defineConfig({
  base: '/coccolith/',
  define: {
    __CHANGELOG__: JSON.stringify(readChangelog()),
  },
  server: {
    fs: {
      allow: ['..']
    },
    watch: {
      ignored: ['!**/my-3d-parts/**']
    }
  }
})
