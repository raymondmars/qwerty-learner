/**
 * 生成「新西兰 K12」分类下的 Year 9 / Year 10 词库。
 *
 * 起因：新西兰没有官方的年级词汇表 —— NZ Curriculum 不规定词表，Year 9-10 又在
 * NCEA 之前没有全国统考。唯一 Year 9-10 专属的官方词表是 Aotearoa NZ Spelling Bee
 * 的年度 100 词，规模撑不起一个词库，且含毛利语词（本地没有中文释义、有道也读不出）。
 *
 * 因此改用词频分段：以仓库里已有的 coca20000.json（按词频排序，自带中文释义与英美
 * 音标）为底，取中高频段。NZ Year 9-10 大致对应 13-15 岁、CEFR B1-B2、3000-5000
 * 词族的水平，落到清洗后的排名上就是本文件里的两个区间。
 *
 * 关键一步是美式拼写转英式：COCA 是美国语料，直接切出来会有 harbor / color /
 * organize，而新西兰用英式拼写，学生照着背会被判错。转换只用机械的后缀规则，且
 * 每一个都要求「英式词形在本地 41,516 条语料里真实存在」才生效，转换后的释义与
 * 音标改从该词形的词条取。两种拼写各有独立含义的词（program/programme 等）列入
 * 黑名单不动。
 *
 * 输入：public/dicts/coca20000.json（词频序）、public/dicts/*.json（校验用语料）
 * 输出：public/dicts/NZ_K12_Year9.json、public/dicts/NZ_K12_Year10.json
 *
 * 幂等。用法：node scripts/build-nz-k12-dicts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const DICTS_DIR = path.join(ROOT, 'public', 'dicts')
const SOURCE = path.join(DICTS_DIR, 'coca20000.json')

// 清洗后的排名区间，左闭右开，1 起算
const BANDS = [
  { name: 'Year 9', from: 2001, to: 3500, file: 'NZ_K12_Year9.json' },
  { name: 'Year 10', from: 3501, to: 5000, file: 'NZ_K12_Year10.json' },
]

// 只保留纯字母（可带连字符和撇号）的小写词条：首字母大写的多是美国政治专有名词
// （Congress、Republican、African-American）和缩写，不适合放进年级词表
const WORD_PATTERN = /^[a-z][a-z'-]*$/

// 美式 → 英式，只做后缀层面的机械替换，每条都会再用本地语料校验
const SPELLING_RULES = [
  [/or$/, 'our'], // harbor → harbour
  [/ors$/, 'ours'],
  [/orless$/, 'ourless'],
  [/ize$/, 'ise'], // organize → organise
  [/izes$/, 'ises'],
  [/ized$/, 'ised'],
  [/izing$/, 'ising'],
  [/ization$/, 'isation'],
  [/yze$/, 'yse'], // analyze → analyse
  [/yzes$/, 'yses'],
  [/yzed$/, 'ysed'],
  [/yzing$/, 'ysing'],
  [/ter$/, 'tre'], // center → centre
  [/ters$/, 'tres'],
  [/ber$/, 'bre'], // fiber → fibre
  [/nse$/, 'nce'], // defense → defence
  [/nses$/, 'nces'],
  [/log$/, 'logue'], // catalog → catalogue
  [/logs$/, 'logues'],
  [/eling$/, 'elling'], // traveling → travelling
  [/eled$/, 'elled'],
  [/eler$/, 'eller'],
]

// 两种拼写在英式里各有独立含义或用法，换过去反而是错的
const NEVER_CONVERT = new Set([
  'program', // 计算机程序在新西兰同样写 program，programme 是节目/课程
  'check', // cheque 只对应支票一义
  'tire', // tyre 只对应轮胎一义
  'draft', // draught 只对应通风/生啤等义
  'story', // storey 只对应楼层一义
  'curb', // kerb 只对应路缘一义
  'meter', // metre 是米，meter 是仪表，两者都用
  'liter', // 同上，liter/litre 之外还有 liter 作词根的派生
  'disk', // disk 与 disc 在英式里分工不同
  // 下面两个是后缀规则的误伤：它们与「英式词形」是各自独立的词，不是拼写变体
  'prize', // 奖品，不是 prise（撬开）的美式写法
  'timber', // 木材，不是 timbre（音色）的美式写法
])

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** 本地全部词库合成的词形表，用来验证英式拼写真实存在，并给它取释义和音标 */
function buildCorpus() {
  const corpus = new Map()

  for (const file of fs.readdirSync(DICTS_DIR)) {
    if (!file.endsWith('.json')) continue

    let words
    try {
      words = readJson(path.join(DICTS_DIR, file))
    } catch {
      continue
    }
    if (!Array.isArray(words)) continue

    for (const word of words) {
      if (typeof word?.name !== 'string') continue

      const key = word.name.toLowerCase()
      const existing = corpus.get(key)
      // 优先留下音标齐全的那一份，释义质量各词库差异大，取先到的即可
      if (!existing || (!existing.usphone && word.usphone)) corpus.set(key, word)
    }
  }

  return corpus
}

/** 去重、去专有名词、修掉源数据里 o''clock 这类重复撇号，保持词频顺序 */
function cleanSource() {
  const source = readJson(SOURCE)
  const seen = new Set()
  const cleaned = []
  const dropped = { duplicate: 0, properNoun: 0, malformed: 0 }

  for (const word of source) {
    const name = word.name.replace(/''/g, "'")

    if (!WORD_PATTERN.test(name)) {
      name[0] === name[0].toUpperCase() ? (dropped.properNoun += 1) : (dropped.malformed += 1)
      continue
    }
    if (seen.has(name)) {
      dropped.duplicate += 1
      continue
    }

    seen.add(name)
    cleaned.push({ ...word, name })
  }

  return { cleaned, dropped }
}

function toBritish(word, corpus) {
  if (NEVER_CONVERT.has(word.name)) return null

  for (const [pattern, replacement] of SPELLING_RULES) {
    if (!pattern.test(word.name)) continue

    const british = word.name.replace(pattern, replacement)
    if (british === word.name) continue

    // 规则命中不等于这个词真的有英式写法（actor 不会变成 actour），
    // 必须在本地语料里查得到才算数
    const entry = corpus.get(british)
    if (!entry) continue

    return {
      name: british,
      trans: entry.trans?.length ? entry.trans : word.trans,
      usphone: entry.usphone ?? word.usphone,
      ukphone: entry.ukphone ?? word.ukphone,
    }
  }

  return null
}

function main() {
  const corpus = buildCorpus()
  const { cleaned, dropped } = cleanSource()

  console.log(`语料词形 ${corpus.size} 个`)
  console.log(`词频表清洗后 ${cleaned.length} 词（去重 ${dropped.duplicate}，专有名词 ${dropped.properNoun}，异形 ${dropped.malformed}）`)

  for (const band of BANDS) {
    const slice = cleaned.slice(band.from - 1, band.to)
    const converted = []

    const words = slice.map((word) => {
      const british = toBritish(word, corpus)
      if (british) {
        converted.push(`${word.name} → ${british.name}`)
        return british
      }
      return word
    })

    const output = words.map(({ name, trans, usphone, ukphone }) => ({ name, trans, usphone, ukphone }))
    fs.writeFileSync(path.join(DICTS_DIR, band.file), JSON.stringify(output, null, 2) + '\n')

    console.log(`\n${band.name}（排名 ${band.from}-${band.to}）：${output.length} 词 → public/dicts/${band.file}`)
    console.log(`  美式转英式 ${converted.length} 个：${converted.join('、')}`)
  }
}

main()
