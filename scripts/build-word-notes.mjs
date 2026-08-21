/**
 * 从本地全部英文词库里，为每个单词提取释义和记忆辅助，补进单词详情。
 *
 * 起因：不同词库的释义质量差异极大，同一个 stare，有的词库只有「盯」，
 * 隔壁词库是「n. 凝视；注视 vt. 凝视，盯着看 vi. 凝视，盯着看；显眼」。
 * 释义按单词挑一次，练哪个词库都用同一份，避免受当前词库的抓取质量拖累。
 *
 * 词库还把助记、同义反义、同根词、固定搭配用【】标注塞在 trans 里。
 * 这些作为「释义」是噪声（所以 cleanTrans 会截掉），但作为记忆材料恰恰最有价值，
 * 单独抽出来放进各自的字段。
 *
 * 只给已有详情的单词补数据，不新建文件——卡片本来就只在有例句时才出现。
 *
 * 输入：public/dicts/*.json（dictionary.ts 里 language: 'en' 的词库）
 * 输出：往 public/word-details/words/<词>.json 里加
 *       senses / mnemonic / synonyms / antonyms / cognates / collocations
 *
 * 幂等。用法：node scripts/build-word-notes.mjs
 */
import { WORDS_DIR, decodeWordFileName, wordPath } from './word-details-store.mjs'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')

// 词库里实际出现的词性缩写，按长度倒序，避免 v. 抢先匹配掉 vt.
const POS_TAGS = [
  'vt&vi',
  'v.&n',
  'abbr',
  'prep',
  'pron',
  'conj',
  'auxv',
  'adj',
  'adv',
  'art',
  'num',
  'int',
  'aux',
  'pl',
  'vt',
  'vi',
  'na',
  'n',
  'v',
  'a',
  'ad',
].sort((a, b) => b.length - a.length)

const POS_RE = new RegExp(`(?:^|[\\s；;，,])((?:${POS_TAGS.join('|')})\\.)`, 'gi')

// 抓取源里混进了语法表（时态/复数/副词变形等），从标签处整段截掉
const TABLE_LABEL = /(时\s*态|复\s*数|比较级|最高级|第三人称|现在分词|过去[式分]词?|[名动副形]\s*词)\s*[:：]/

// "(Stare)人名；(瑞典)斯塔勒" 这类是词典的人名地名义项，对背单词没用
const isNameGloss = (zh) => /^\([^)]{1,16}\)\s*(人名|地名)/.test(zh)

// 部分词库把助记、同根词、搭配用【】标注拼在释义后面
const ANNOTATION = /【/

// 也有把英文例句直接接在中文释义后面的，连续 4 个以上英文单词就当例句截掉
const EMBEDDED_EN = /[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){3,}/

function cleanTrans(trans) {
  let text = String(trans).replace(/\r/g, '')
  for (const pattern of [TABLE_LABEL, ANNOTATION, EMBEDDED_EN]) {
    const hit = pattern.exec(text)
    if (hit) text = text.slice(0, hit.index)
  }

  return text.replace(/\s*\n+\s*/g, ' ').trim()
}

/**
 * 一条 trans 里可能塞了多个词性的释义：
 *   "n. 凝视；注视 vt. 凝视，盯着看 vi. 显眼" -> 三条
 * 按词性标记切开，没有标记的整条作为一条无词性释义。
 */
function splitSenses(raw) {
  const trans = cleanTrans(raw)
  if (!trans) return []

  const marks = [...trans.matchAll(POS_RE)]
  if (marks.length === 0) return isNameGloss(trans) ? [] : [{ pos: '', zh: trans }]

  const senses = []
  marks.forEach((mark, i) => {
    const start = mark.index + mark[0].length
    const end = i + 1 < marks.length ? marks[i + 1].index : trans.length
    const zh = trans
      .slice(start, end)
      .trim()
      .replace(/^[，,；;、\s]+/, '')
      .replace(/[，,；;、]$/, '')
    if (zh && !isNameGloss(zh)) senses.push({ pos: mark[1].toLowerCase(), zh })
  })
  return senses
}

const parse = (transList) => transList.flatMap((t) => splitSenses(String(t)))

/** 有词性标注的、条目多的、内容长的优先；长度收敛，避免超长堆砌的词条压倒精准词条 */
function score(senses) {
  const withPos = senses.filter((s) => s.pos).length
  const chars = senses.reduce((sum, s) => sum + s.zh.length, 0)
  return withPos * 60 + senses.length * 20 + Math.min(chars, 120)
}

// ---------------------------------------------------------------- 记忆辅助

// 各词库的标注写法不统一，归到同一类
const TAG_FIELD = {
  记忆: 'mnemonic',
  记: 'mnemonic',
  同义: 'synonyms',
  近: 'synonyms',
  反义: 'antonyms',
  反: 'antonyms',
  同根: 'cognates',
  派: 'cognates',
  搭配: 'collocations',
  考: 'collocations',
}

const CJK = /[\u4e00-\u9fa5]/

/** 把 "【搭配】xxx【同义】yyy" 切成一段段标注，每段到下一个【为止 */
function extractAnnotations(trans) {
  const marks = [...String(trans).matchAll(/【([^】]{1,6})】/g)]
  return marks.map((mark, i) => ({
    field: TAG_FIELD[mark[1]],
    body: String(trans)
      .slice(mark.index + mark[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined)
      .replace(/\s+/g, ' ')
      .trim(),
  }))
}

/**
 * 同义/反义/同根的内容是一串挤在一起的 "词 词性. 释义"：
 *   "great adj. 大量的；很大程度的large adj. 巨大的much adv. 大量"
 * 靠词性标记定位，取紧挨在它前面的那个英文单词。
 */
function parseWordList(body) {
  const words = []
  for (const m of body.matchAll(/([A-Za-z][A-Za-z'-]{1,})\s*(?:vt|vi|adj|adv|prep|conj|pron|ad|n|v|a)\./g)) {
    const word = m[1].toLowerCase()
    if (word.length > 1 && !words.includes(word)) words.push(word)
  }
  return words.slice(0, 6)
}

/**
 * 一段【搭配】里常常挤着多条，中间没有任何分隔：
 *   "drug abuse 滥用药物，吸毒abuse one's authority (office) 滥用权威（职权）child abuse 虐待儿童"
 * 按「英文段 + 中文段」交替切分，逐条还原。
 */
function parseCollocations(body) {
  const pairs = []
  const re = /([A-Za-z][A-Za-z0-9'’\-./\s()]*?)\s*([\u4e00-\u9fa5][^A-Za-z]*)/g

  for (const m of body.matchAll(re)) {
    const en = m[1].trim().replace(/[，,;；.]$/, '')
    const zh = m[2]
      .trim()
      .replace(/^[，,；;、\s]+/, '')
      .replace(/[，,；;、]$/, '')

    // 词库里也有把例句拼进搭配的，英文里出现句首大写词、或中文带句号，都当例句丢弃
    if (!en || !zh || /\s[A-Z]/.test(en) || /。/.test(zh)) continue
    if (en.length < 2 || en.length > 50 || en.split(/\s+/).length > 8) continue

    pairs.push({ en, zh })
  }
  return pairs
}

/** 助记里混着 "词根记忆：" 这类前缀，保留——它说明了助记类型，对记忆有用 */
const parseMnemonic = (body) => {
  const text = body.replace(/^[:：\s]+/, '').trim()
  return text.length >= 4 && CJK.test(text) ? text : null
}

function collectNotes(transList, into) {
  for (const trans of transList) {
    for (const { field, body } of extractAnnotations(trans)) {
      if (!field || !body) continue

      if (field === 'mnemonic') {
        const text = parseMnemonic(body)
        // 多个词库都有助记时留最详细的那条
        if (text && text.length > (into.mnemonic?.length ?? 0)) into.mnemonic = text
      } else if (field === 'collocations') {
        for (const item of parseCollocations(body)) {
          if (!into.collocations.some((c) => c.en.toLowerCase() === item.en.toLowerCase())) into.collocations.push(item)
        }
      } else {
        for (const w of parseWordList(body)) if (!into[field].includes(w)) into[field].push(w)
      }
    }
  }
}

function loadEnglishDicts() {
  const source = fs.readFileSync(path.join(ROOT, 'src/resources/dictionary.ts'), 'utf8')
  return source
    .split(/\n {2}\{\n/)
    .slice(1)
    .map((chunk) => chunk.split(/\n {2}\},?/)[0])
    .filter((body) => /language: 'en'/.test(body))
    .map((body) => /url: '(\/dicts\/[^']+)'/.exec(body)?.[1])
    .filter(Boolean)
}

function main() {
  if (!fs.existsSync(WORDS_DIR)) throw new Error('还没有单词详情，请先运行 gen-word-details.mjs')

  // 只为已有详情的词找释义和记忆材料
  const targets = new Set(
    fs
      .readdirSync(WORDS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => decodeWordFileName(f.slice(0, -'.json'.length))),
  )

  const best = new Map()
  const notes = new Map()
  let scanned = 0
  for (const url of new Set(loadEnglishDicts())) {
    let list
    try {
      list = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', url), 'utf8'))
    } catch {
      continue
    }
    scanned++

    for (const entry of list) {
      const name = String(entry?.name ?? '').toLowerCase()
      if (!targets.has(name)) continue

      const transList = Array.isArray(entry.trans) ? entry.trans : typeof entry.trans === 'string' ? [entry.trans] : []
      if (transList.length === 0) continue

      if (!notes.has(name)) notes.set(name, { mnemonic: '', synonyms: [], antonyms: [], cognates: [], collocations: [] })
      collectNotes(transList, notes.get(name))

      const senses = parse(transList)
      if (senses.length === 0) continue

      const value = score(senses)
      const prev = best.get(name)
      if (!prev || value > prev.value) best.set(name, { senses, value })
    }
  }

  const stat = { senses: 0, mnemonic: 0, synonyms: 0, antonyms: 0, cognates: 0, collocations: 0 }
  let written = 0
  let unchanged = 0

  for (const word of targets) {
    const file = wordPath(word)
    const detail = JSON.parse(fs.readFileSync(file, 'utf8'))
    const next = { sentences: detail.sentences, phrases: detail.phrases }

    const senses = best.get(word)?.senses
    if (senses?.length) {
      next.senses = senses
      stat.senses++
    }

    const note = notes.get(word)
    if (note) {
      if (note.mnemonic) {
        next.mnemonic = note.mnemonic
        stat.mnemonic++
      }
      for (const field of ['synonyms', 'antonyms', 'cognates']) {
        // 同义词表里常把词条自己也列进去
        const list = note[field].filter((w) => w !== word)
        if (list.length) {
          next[field] = list
          stat[field]++
        }
      }
      // 语料统计出来的词组已经有了，只补词典里额外的固定搭配
      const known = new Set(detail.phrases.map((p) => p.en.toLowerCase()))
      const extra = note.collocations.filter((c) => !known.has(c.en.toLowerCase())).slice(0, 4)
      if (extra.length) {
        next.collocations = extra
        stat.collocations++
      }
    }

    const text = `${JSON.stringify(next)}\n`
    if (fs.readFileSync(file, 'utf8') === text) {
      unchanged++
      continue
    }
    fs.writeFileSync(file, text)
    written++
  }

  const pct = (n) => `${((n / targets.size) * 100).toFixed(1)}%`
  console.log(`扫描 ${scanned} 个英文词库，覆盖 ${targets.size} 个词`)
  console.log(`  释义 ${stat.senses} (${pct(stat.senses)})   助记 ${stat.mnemonic} (${pct(stat.mnemonic)})`)
  console.log(`  同义词 ${stat.synonyms} (${pct(stat.synonyms)})   反义词 ${stat.antonyms} (${pct(stat.antonyms)})`)
  console.log(`  同根词 ${stat.cognates} (${pct(stat.cognates)})   额外搭配 ${stat.collocations} (${pct(stat.collocations)})`)
  console.log(`写入 ${written}，内容未变 ${unchanged}`)
}

main()
