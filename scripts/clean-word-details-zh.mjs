/**
 * 洗掉已生成详情里译文的列表编号前缀。
 *
 * 成因：translate() 让模型一次翻多条，模型常把它理解成「输出一个编号列表」，
 * 于是每条译文自带 "1. " 前缀。gen-word-details.mjs 的 cleanTranslation 当初只处理了
 * 「回显原文」一种脏数据，没管编号，所以这批前缀一路存进了 json 并发到线上。
 * 生成侧已在 cleanTranslation 里补上同样的剥离规则，这个脚本负责洗存量。
 *
 * 只动 zh 字段，不碰英文原句，也不调用模型，纯本地字符串处理。
 * 幂等：洗过的再跑一次不会有任何改动。
 *
 * 用法：
 *   node scripts/clean-word-details-zh.mjs --dry-run   只报告，不落盘
 *   node scripts/clean-word-details-zh.mjs
 */
import { WORDS_DIR, decodeWordFileName, writeWord } from './word-details-store.mjs'
import fs from 'node:fs'
import path from 'node:path'

// 与 gen-word-details.mjs 里的 LIST_NUMBERING 保持一致，改一处要同步另一处。
// 只有「编号后不紧跟数字」才剥，否则 "1.5 米" 会被切成 "5 米"。
const LIST_NUMBERING = /^\s*\d{1,2}\s*[.、)]\s*(?!\d)/

const strip = (zh) => (typeof zh === 'string' ? zh.replace(LIST_NUMBERING, '') : zh)

function cleanDetail(detail) {
  let changed = 0
  for (const key of ['sentences', 'phrases']) {
    for (const item of detail[key] ?? []) {
      const next = strip(item.zh)
      if (next !== item.zh) {
        item.zh = next
        changed++
      }
    }
  }
  return changed
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  if (!fs.existsSync(WORDS_DIR)) throw new Error(`找不到 ${WORDS_DIR}`)

  const files = fs.readdirSync(WORDS_DIR).filter((f) => f.endsWith('.json'))
  let touchedWords = 0
  let touchedFields = 0
  const samples = []

  for (const file of files) {
    const full = path.join(WORDS_DIR, file)
    const detail = JSON.parse(fs.readFileSync(full, 'utf8'))
    const before = JSON.stringify(detail)
    const changed = cleanDetail(detail)
    if (!changed) continue

    touchedWords++
    touchedFields += changed
    if (samples.length < 5) {
      const word = decodeWordFileName(file.slice(0, -'.json'.length))
      const oldZh = JSON.parse(before).sentences?.find((s, i) => s.zh !== detail.sentences?.[i]?.zh)?.zh
      if (oldZh) samples.push(`  [${word}] ${oldZh}`)
    }
    if (!dryRun) writeWord(decodeWordFileName(file.slice(0, -'.json'.length)), detail)
  }

  console.log(`扫描 ${files.length} 个词，${dryRun ? '将清理' : '已清理'} ${touchedWords} 个词的 ${touchedFields} 条译文`)
  if (samples.length) {
    console.log('样例（清理前）：')
    samples.forEach((s) => console.log(s))
  }
  if (dryRun) console.log('\n--dry-run，未写盘')
}

main()
