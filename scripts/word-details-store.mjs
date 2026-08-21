/**
 * 单词详情的存储层：数据按单词组织，与词库无关。
 *
 * 雅思在本项目里有 59 个变种词库、去重后 19453 个词，重叠率 0%-79%。
 * 按词库存会大量重复生成，且用户换个变种就查不到，所以统一按单词存。
 *
 * public/word-details/words/<编码后的词>.json   单条单词详情
 * public/word-details/index.json                已覆盖的单词清单，前端据此判断要不要发请求
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
export const BASE = path.join(ROOT, 'public/word-details')
export const WORDS_DIR = path.join(BASE, 'words')
export const INDEX_FILE = path.join(BASE, 'index.json')

/**
 * 单词里存在 / ? % & ' 空格 é 等文件名和 URL 都不安全的字符，
 * 统一把 [a-z0-9-] 之外的字符编码成 ~xx（十六进制码点）。
 * 因为 ~ 自身也会被编码成 ~7e，所以解码是无歧义的。
 * 前端 src/pages/Typing/hooks/useWordDetail.ts 里有一份同样的实现，改动要同步。
 */
export function wordFileName(word) {
  return word.toLowerCase().replace(/[^a-z0-9-]/g, (c) => `~${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

export function decodeWordFileName(name) {
  return name.replace(/~([0-9a-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

export const wordPath = (word) => path.join(WORDS_DIR, `${wordFileName(word)}.json`)

export const hasWord = (word) => fs.existsSync(wordPath(word))

/** 内容没变就不重写，避免每次跑都把几万个文件的 mtime 全刷一遍 */
export function writeWord(word, detail) {
  fs.mkdirSync(WORDS_DIR, { recursive: true })
  const file = wordPath(word)
  const next = `${JSON.stringify(detail)}\n`
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === next) return false

  fs.writeFileSync(file, next)
  return true
}

/** 索引直接由 words/ 目录反推，不额外维护状态 */
export function rebuildIndex() {
  const words = fs.existsSync(WORDS_DIR)
    ? fs
        .readdirSync(WORDS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => decodeWordFileName(f.slice(0, -'.json'.length)))
        .sort()
    : []

  fs.mkdirSync(BASE, { recursive: true })
  fs.writeFileSync(INDEX_FILE, `${JSON.stringify(words)}\n`)
  return words.length
}
