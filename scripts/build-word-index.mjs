/**
 * 把早期按「词库 + 章节」生成的详情数据迁移成按「单词」组织，并重建索引。
 *
 * gen-word-details.mjs 现在直接写 words/，正常流程不需要这个脚本；
 * 保留它用于两件事：
 *   1. 合并历史遗留的 public/word-details/<dictId>/<chapter>.json
 *   2. 手工改动 words/ 之后重建 index.json
 *
 * 幂等，可以反复执行。
 *
 * 用法：node scripts/build-word-index.mjs
 */
import { BASE, INDEX_FILE, WORDS_DIR, rebuildIndex, writeWord } from './word-details-store.mjs'
import fs from 'node:fs'
import path from 'node:path'

const weight = (detail) => (detail?.sentences?.length ?? 0) + (detail?.phrases?.length ?? 0)

function collectLegacy() {
  const merged = new Map()
  const dicts = fs
    .readdirSync(BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'words')
    .map((entry) => entry.name)

  for (const dict of dicts) {
    for (const file of fs.readdirSync(path.join(BASE, dict))) {
      if (!file.endsWith('.json')) continue

      const chapter = JSON.parse(fs.readFileSync(path.join(BASE, dict, file), 'utf8'))
      for (const [word, detail] of Object.entries(chapter)) {
        if (weight(detail) === 0) continue

        // 同一个词被多个词库生成过时，留内容多的那份
        const prev = merged.get(word)
        if (!prev || weight(detail) > weight(prev)) merged.set(word, detail)
      }
    }
  }
  return { merged, dicts }
}

function main() {
  if (!fs.existsSync(BASE)) throw new Error(`找不到 ${BASE}，请先运行 gen-word-details.mjs`)

  const { merged, dicts } = collectLegacy()
  let written = 0
  for (const [word, detail] of merged) if (writeWord(word, detail)) written++

  const total = rebuildIndex()
  const bytes = fs.readdirSync(WORDS_DIR).reduce((sum, f) => sum + fs.statSync(path.join(WORDS_DIR, f)).size, 0)

  console.log(dicts.length ? `遗留词库产物：${dicts.join(', ')}，其中 ${merged.size} 个词，新写入 ${written}` : '没有遗留的词库产物')
  console.log(`words/ 合计 ${total} 个词 ${(bytes / 1024 / 1024).toFixed(2)}MB，索引 ${(fs.statSync(INDEX_FILE).size / 1024).toFixed(1)}KB`)
}

main()
