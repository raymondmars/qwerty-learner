/**
 * 生成单词详情数据（例句 + 词组），供练习页的单词详情卡片使用。
 *
 * 数据来源：
 *   - 例句：Tatoeba 真人语料（主）；语料覆盖不足时由本机 ollama 兜底生成
 *   - 词组：从语料里统计高频搭配（n-gram），不让模型凭空编造
 *   - 中文：统一由本机 ollama 翻译
 *
 * 前置准备：
 *   1. 下载 Tatoeba 句子库并抽出英文行：
 *      curl -L https://huggingface.co/datasets/loretoparisi/tatoeba-sentences/resolve/main/sentences.csv \
 *        | grep $'^eng\t' | cut -f2 > /tmp/tatoeba-eng.txt
 *   2. 本机启动 ollama 并拉取模型：ollama pull qwen2.5:14b
 *      （7b 的翻译质量明显偏弱，介词短语和从句容易译反，改用 14b）
 *
 * 用法：
 *   node scripts/gen-word-details.mjs --dict ielts --chapters 0-1
 *   node scripts/gen-word-details.mjs --dict cet4  --chapters 0 --concurrency 4
 *   node scripts/gen-word-details.mjs --dict ielts --words epitomise,dispersal --force
 *
 * 产物：public/word-details/words/<编码后的词>.json + index.json
 * 详情按单词存、与词库无关，已经有详情的词默认跳过（跨词库去重），加 --force 重跑。
 */
import { hasWord, rebuildIndex, writeWord } from './word-details-store.mjs'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const ROOT = path.join(import.meta.dirname, '..')
const CORPUS = process.env.TATOEBA_ENG ?? '/tmp/tatoeba-eng.txt'
const OLLAMA = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:14b'

const CHAPTER_LENGTH = 20
const MAX_SENTENCES = 3
const MAX_PHRASES = 3
const MIN_PHRASE_COUNT = 3
const SENTENCE_MIN_WORDS = 5
const SENTENCE_MAX_WORDS = 16
const IDEAL_SENTENCE_WORDS = 10

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const args = { chapters: '0', concurrency: 4, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') args.force = true
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i]
  }
  if (!args.dict) throw new Error('缺少 --dict <dictId>')
  args.concurrency = Number(args.concurrency)
  // --words 指定单词时直接按词跑，忽略 --chapters
  args.wordList = args.words
    ? String(args.words)
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
    : null
  const [from, to] = String(args.chapters).split('-')
  args.chapterList = Array.from({ length: Number(to ?? from) - Number(from) + 1 }, (_, i) => Number(from) + i)
  return args
}

// ---------------------------------------------------------------- 词表

function loadDictWords(dictId, chapters) {
  const source = fs.readFileSync(path.join(ROOT, 'src/resources/dictionary.ts'), 'utf8')
  const entry = new RegExp(`id: '${dictId}',[\\s\\S]{0,400}?url: '(/dicts/[^']+)'`).exec(source)
  if (!entry) throw new Error(`在 dictionary.ts 里找不到词典 ${dictId}`)

  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', entry[1]), 'utf8'))
  return chapters.map((chapter) => ({
    chapter,
    words: list.slice(chapter * CHAPTER_LENGTH, (chapter + 1) * CHAPTER_LENGTH).map(normalizeWord),
  }))
}

/** --words 用：从词库里按名字取词，取不到就报错，避免默默漏掉 */
function loadNamedWords(dictId, names) {
  const source = fs.readFileSync(path.join(ROOT, 'src/resources/dictionary.ts'), 'utf8')
  const entry = new RegExp(`id: '${dictId}',[\\s\\S]{0,400}?url: '(/dicts/[^']+)'`).exec(source)
  if (!entry) throw new Error(`在 dictionary.ts 里找不到词典 ${dictId}`)

  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', entry[1]), 'utf8')).map(normalizeWord)
  return names.map((name) => {
    const found = list.find((w) => w.name.toLowerCase() === name)
    if (!found) throw new Error(`词库 ${dictId} 里没有单词 ${name}`)
    return found
  })
}

// 各词库的 trans 有的是数组有的是字符串，音标有的带 [] 或 //，统一一下
function normalizeWord(word) {
  const trans = Array.isArray(word.trans) ? word.trans : typeof word.trans === 'string' ? [word.trans] : []
  return { name: String(word.name ?? '').trim(), trans: trans.map((t) => String(t).trim()).filter(Boolean) }
}

// ---------------------------------------------------------------- 语料

// 词库多用英式 -ise/-yse 拼写，Tatoeba 语料以美式 -ize/-yze 为主，两边都要认。
// 多派生出来的拼法如果不是真词（advertize），在语料里匹配不到任何东西，无副作用。
function spellings(w) {
  const out = [w]
  if (w.endsWith('ise')) out.push(`${w.slice(0, -3)}ize`)
  if (w.endsWith('yse')) out.push(`${w.slice(0, -3)}yze`)
  if (w.endsWith('isation')) out.push(`${w.slice(0, -7)}ization`)
  return out
}

function inflections(word) {
  const forms = new Set()
  for (const w of spellings(word.toLowerCase())) {
    for (const f of [w, `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`]) forms.add(f)
    if (w.endsWith('e')) {
      forms.add(`${w.slice(0, -1)}ing`)
      forms.add(`${w}d`)
    }
    if (w.endsWith('y')) {
      forms.add(`${w.slice(0, -1)}ies`)
      forms.add(`${w.slice(0, -1)}ied`)
    }
  }
  return [...forms]
}

// Tatoeba 语料里 Tom / Mary 等虚构人名出现频率极高，会污染搭配统计
const CORPUS_NAMES = new Set(['tom', 'mary', 'john', 'ken', 'bob', 'jim', 'nancy', 'yumi', 'taro', 'mike', 'tony', 'betty', 'alice'])
// 以这些词开头/结尾的 n-gram 是残缺片段，不是词组
const BAD_PHRASE_START = new Set([
  'and',
  'or',
  'but',
  'that',
  'which',
  'who',
  'he',
  'she',
  'it',
  'they',
  'i',
  'you',
  'we',
  'is',
  'are',
  'was',
  'were',
  'been',
  'being',
  'a',
  'an',
  'the',
  'to',
  'has',
  'had',
  'have',
])
const BAD_PHRASE_END = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'is',
  'are',
  'be',
  'my',
  'your',
  'his',
  'her',
  'their',
  'our',
  'its',
  'this',
  'that',
  'you',
  'me',
  'him',
  'us',
  'them',
  'it',
])

const TOKEN = /[a-zA-Z][a-zA-Z'-]*/g

/** 单遍扫语料，同时为所有目标词收集例句候选和搭配计数 */
async function buildCorpusIndex(words) {
  const form2base = new Map()
  for (const word of words) {
    for (const form of inflections(word)) {
      if (!form2base.has(form)) form2base.set(form, new Set())
      form2base.get(form).add(word)
    }
  }

  const sentences = new Map(words.map((w) => [w, []]))
  const phrases = new Map(words.map((w) => [w, new Map()]))

  const rl = readline.createInterface({ input: fs.createReadStream(CORPUS, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of rl) {
    const text = line.trim()
    if (!text) continue
    const surface = text.match(TOKEN)
    if (!surface) continue
    const lower = surface.map((t) => t.toLowerCase())

    const bases = new Set()
    for (const t of lower) {
      const hit = form2base.get(t)
      if (hit) for (const b of hit) bases.add(b)
    }
    if (bases.size === 0) continue

    // 例句候选
    if (
      lower.length >= SENTENCE_MIN_WORDS &&
      lower.length <= SENTENCE_MAX_WORDS &&
      /^[A-Z"']/.test(text) &&
      /[.!?"']$/.test(text) &&
      !/\d{2,}/.test(text)
    ) {
      for (const base of bases) {
        const bucket = sentences.get(base)
        if (bucket.length < 60) bucket.push({ text, words: lower.length })
      }
    }

    // 搭配候选
    for (const n of [2, 3]) {
      for (let i = 0; i + n <= lower.length; i++) {
        const gram = lower.slice(i, i + n)
        if (BAD_PHRASE_START.has(gram[0]) || BAD_PHRASE_END.has(gram[n - 1])) continue
        if (gram.some((t) => CORPUS_NAMES.has(t) || t.includes("'"))) continue

        const owners = new Set()
        for (const t of gram) {
          const hit = form2base.get(t)
          if (hit) for (const b of hit) owners.add(b)
        }
        if (owners.size === 0) continue

        const key = gram.join(' ')
        const display = surface.slice(i, i + n).join(' ')
        for (const owner of owners) {
          const counter = phrases.get(owner)
          const prev = counter.get(key) ?? { count: 0, forms: new Map() }
          prev.count += 1
          // 记录原始大小写，最后取出现最多的那种写法（English subtitles 而不是 english subtitles）
          prev.forms.set(display, (prev.forms.get(display) ?? 0) + 1)
          counter.set(key, prev)
        }
      }
    }
  }
  return { sentences, phrases }
}

function pickSentences(candidates) {
  const seen = new Set()
  // Tatoeba 里大量句子以 Tom / Mary 作主角，这类句子语境空洞，排在后面，实在没别的了再用
  const score = (c) => (CORPUS_NAMES.has(c.text.split(/\W+/)[0].toLowerCase()) || / (Tom|Mary)\b/.test(c.text) ? 100 : 0)

  return candidates
    .filter((c) => {
      const key = c.text.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => score(a) - score(b) || Math.abs(a.words - IDEAL_SENTENCE_WORDS) - Math.abs(b.words - IDEAL_SENTENCE_WORDS))
    .slice(0, MAX_SENTENCES)
    .map((c) => c.text)
}

function pickPhrases(counter) {
  const ranked = [...counter.entries()].filter(([, v]) => v.count >= MIN_PHRASE_COUNT).sort((a, b) => b[1].count - a[1].count)

  const picked = []
  for (const [key, value] of ranked) {
    // 已被更高频的词组包含（"with subtitles" ⊂ "with english subtitles"）就跳过
    if (picked.some((p) => p.key.includes(key) || key.includes(p.key))) continue
    const display = [...value.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]
    picked.push({ key, en: display, count: value.count })
    if (picked.length >= MAX_PHRASES) break
  }
  return picked
}

// ---------------------------------------------------------------- 模型

/**
 * 即使用 format 约束了 schema，模型仍会偶尔吐出截断或不合法的 JSON。
 * 这类响应以前会直接 JSON.parse 抛错打挂整批，现在降温重试一次，仍失败就交给调用方降级。
 */
async function ollamaJson({ system, user, schema, temperature = 0.2 }, attempt = 0) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      options: { temperature: attempt === 0 ? temperature : 0 },
      format: schema,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}`)

  const data = await res.json()
  try {
    return JSON.parse(data.message.content)
  } catch (error) {
    if (attempt === 0) return ollamaJson({ system, user, schema, temperature }, 1)
    throw new Error(`模型返回的 JSON 无法解析：${error.message}`)
  }
}

const stringArray = (n) => ({ type: 'array', items: { type: 'string' }, minItems: n, maxItems: n })

// 模型偶尔不守格式：把原文回显（"in line：排队"）、吐出整段 JSON、甚至泄漏 prompt 模板。
// 这类译文没法自动修好，只能识别出来丢弃，宁可少一条也不要错的。
const TRANSLATION_GARBAGE = /<\|im_start\|>|<tool_call>|"zh"\s*:|\{"en"|\\"/

function cleanTranslation(zh) {
  const text = String(zh ?? '').trim()
  const marker = text.search(/[：:]/)
  if (marker < 0) return text

  // 冒号前几乎没有中文，说明那是被回显的原文
  const head = text.slice(0, marker)
  if (!/[a-z]/i.test(head) || head.replace(/[^\u4e00-\u9fa5]/g, '').length > 4) return text

  const rest = text.slice(marker + 1).trim()
  return rest && /[\u4e00-\u9fa5]/.test(rest) ? rest : text
}

const isUsableTranslation = (zh) => Boolean(zh) && !TRANSLATION_GARBAGE.test(zh) && /[\u4e00-\u9fa5]/.test(zh)

/** 一次调用同时翻译例句和词组，省一半模型时间 */
async function translate({ word, sense, sentences, phrases }) {
  if (sentences.length === 0 && phrases.length === 0) return { sentences: [], phrases: [] }

  const result = await ollamaJson({
    system: '你是英语学习应用的专业译者，服务对象是中国学生。只输出 JSON，不要任何解释。',
    user: `单词 "${word}"，中文释义：${sense}。

请把下面的内容翻译成自然、地道的简体中文，必须准确体现该词在上下文中的含义。
${sentences.length ? `\n【例句】\n${sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : ''}
${
  phrases.length
    ? `\n【词组】（这些是从真实语料统计出来的高频搭配，给出简洁的中文意思，不要解释）\n${phrases
        .map((p, i) => `${i + 1}. ${p.en}`)
        .join('\n')}`
    : ''
}`,
    schema: {
      type: 'object',
      properties: {
        sentenceTranslations: stringArray(sentences.length),
        phraseTranslations: stringArray(phrases.length),
      },
      required: ['sentenceTranslations', 'phraseTranslations'],
    },
  })

  return {
    sentences: sentences
      .map((en, i) => ({ en, zh: cleanTranslation(result.sentenceTranslations[i]) }))
      .filter((item) => isUsableTranslation(item.zh)),
    phrases: phrases
      .map((p, i) => ({ en: p.en, zh: cleanTranslation(result.phraseTranslations[i]) }))
      .filter((item) => isUsableTranslation(item.zh)),
  }
}

/** 语料里例句不够时才走这里 */
async function generateSentences({ word, sense, count, avoid }) {
  const result = await ollamaJson({
    temperature: 0.5,
    system: 'You write example sentences for an English learning app used by Chinese students. Output JSON only.',
    user: `Write ${count} example sentence(s) for the English word "${word}" (Chinese meaning: ${sense}).
Requirements:
- 8 to 14 words each, natural everyday English, CEFR B1-B2 level
- each sentence must contain "${word}" or an inflected form
- different contexts from each other${avoid.length ? `\n- do not repeat: ${avoid.join(' / ')}` : ''}
Also give a natural Simplified Chinese translation of each.`,
    schema: {
      type: 'object',
      properties: {
        sentences: {
          type: 'array',
          items: { type: 'object', properties: { en: { type: 'string' }, zh: { type: 'string' } }, required: ['en', 'zh'] },
          minItems: count,
          maxItems: count,
        },
      },
      required: ['sentences'],
    },
  })
  return result.sentences
}

// ---------------------------------------------------------------- 主流程

const containsWord = (text, word) => new RegExp(`\\b(${inflections(word).join('|')})\\b`, 'i').test(text)

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await worker(items[index], index)
      }
    }),
  )
  return results
}

async function buildWordDetail({ word, index }) {
  const sense = word.trans.join('；') || '(无释义)'
  const sentences = pickSentences(index.sentences.get(word.name.toLowerCase()) ?? [])
  const phrases = pickPhrases(index.phrases.get(word.name.toLowerCase()) ?? new Map())

  let translated = { sentences: [], phrases: [] }
  try {
    translated = await translate({ word: word.name, sense, sentences, phrases })
  } catch (error) {
    console.warn(`  ! ${word.name} 翻译失败，改由兜底生成：${error.message}`)
  }
  const detail = { sentences: translated.sentences, phrases: translated.phrases }

  if (detail.sentences.length < MAX_SENTENCES) {
    const need = MAX_SENTENCES - detail.sentences.length
    try {
      const generated = await generateSentences({
        word: word.name,
        sense,
        count: need,
        avoid: detail.sentences.map((s) => s.en),
      })
      detail.sentences.push(
        ...generated
          .map((s) => ({ en: s.en, zh: cleanTranslation(s.zh) }))
          .filter((s) => containsWord(s.en, word.name) && isUsableTranslation(s.zh))
          .slice(0, need),
      )
    } catch (error) {
      console.warn(`  ! ${word.name} 兜底生成失败：${error.message}`)
    }
  }

  return detail
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(CORPUS)) throw new Error(`找不到语料 ${CORPUS}，请先按文件头的说明准备`)

  const chapters = args.wordList
    ? [{ chapter: -1, words: loadNamedWords(args.dict, args.wordList) }]
    : loadDictWords(args.dict, args.chapterList)

  // 详情按单词存，任何词库生成过的词都不再重复生成
  const seen = new Set()
  const todo = []
  let already = 0
  for (const { words } of chapters) {
    for (const word of words) {
      const key = word.name.toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)

      if (!args.force && hasWord(key)) already++
      else todo.push(word)
    }
  }

  const range = args.wordList
    ? `指定 ${args.wordList.length} 个词`
    : `章节 ${args.chapterList[0]}-${args.chapterList[args.chapterList.length - 1]}`
  console.log(`词典 ${args.dict}，${range}，去重后 ${seen.size} 个词，其中 ${already} 个已有详情`)
  if (todo.length === 0) return console.log('没有需要生成的词，加 --force 可重跑')

  console.log(`为剩余 ${todo.length} 个词扫描语料建索引…`)
  const started = Date.now()
  const index = await buildCorpusIndex(todo.map((w) => w.name.toLowerCase()))
  console.log(`索引完成，用时 ${((Date.now() - started) / 1000).toFixed(1)}s\n`)

  let written = 0
  await mapWithConcurrency(todo, args.concurrency, async (word) => {
    const detail = await buildWordDetail({ word, index })
    if (detail.sentences.length === 0 && detail.phrases.length === 0) {
      console.log(`  ${word.name.padEnd(16)} 无可用内容，跳过`)
      return
    }

    writeWord(word.name, detail)
    written++
    const fromCorpus = index.sentences.get(word.name.toLowerCase())?.length ?? 0
    console.log(`  ${word.name.padEnd(16)} 例句 ${detail.sentences.length} 条（语料候选 ${fromCorpus}）  词组 ${detail.phrases.length} 条`)
  })

  const total = rebuildIndex()
  console.log(`\n本次新增 ${written} 个词，索引共 ${total} 个词，用时 ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
