/**
 * 生成「新西兰 K12」分类下的 Year 9 词库。
 *
 * 与 Year 10 不同，Year 9 不再按 COCA 词频分段切（见 build-nz-k12-dicts.mjs 的说明）。
 * 词频分段出来的词表虽然量大，但跟学生在课堂上真正要用的词对不上：Year 9 的英语、
 * 科学、数学、社会研究各科都有自己的一套术语和指令词（analyse / justify / hypothesis /
 * denominator），这些词在通用词频表里排得很靠后，反倒是一堆美国新闻高频词挤进来。
 *
 * 因此 Year 9 改用按学科整理的词表：scripts/data/nz-year9-vocabulary.json，
 * 按「学术通用 → 阅读与文学 → 语法写作 → 连接词 → 描写性词汇 → 各学科」的顺序排列，
 * 源文件的顺序就是练习时的章节顺序，同一章里的词属于同一个主题。
 *
 * 音标：源文件给的是英式音标（词表本身按 British English 整理），直接作 ukphone。
 * 美式音标源文件没有，从仓库里其他词库按词形查，查不到就留空 —— 前端对空音标是
 * 静默跳过的，宁可不显示也不要拿英式音标冒充美式。
 *
 * 输入：scripts/data/nz-year9-vocabulary.json、public/dicts/*.json（取美式音标）
 * 输出：public/dicts/NZ_K12_Year9.json
 *
 * 幂等。用法：node scripts/build-nz-year9-dict.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const DICTS_DIR = path.join(ROOT, 'public', 'dicts')
const SOURCE = path.join(ROOT, 'scripts', 'data', 'nz-year9-vocabulary.json')
const OUTPUT = path.join(DICTS_DIR, 'NZ_K12_Year9.json')

/** 仓库里其他词库合成的词形 → 美式音标，只收非空的 */
function buildUsPhoneMap() {
  const map = new Map()

  for (const file of fs.readdirSync(DICTS_DIR)) {
    if (!file.endsWith('.json') || file === 'NZ_K12_Year9.json') continue

    let words
    try {
      words = JSON.parse(fs.readFileSync(path.join(DICTS_DIR, file), 'utf8'))
    } catch {
      continue
    }
    if (!Array.isArray(words)) continue

    for (const word of words) {
      if (typeof word?.name !== 'string') continue
      const usphone = String(word.usphone ?? '').trim()
      if (!usphone) continue

      const key = word.name.toLowerCase()
      if (!map.has(key)) map.set(key, usphone)
    }
  }

  return map
}

function main() {
  const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
  const usPhones = buildUsPhoneMap()

  const seen = new Set()
  const output = []
  let usHit = 0

  for (const category of source.categories) {
    for (const entry of category.words) {
      const name = String(entry.word).trim()
      const key = name.toLowerCase()
      if (!name || seen.has(key)) continue
      seen.add(key)

      // 源文件的音标写成 /ˈænəlaɪz/，词库存的是不带斜杠的裸音标
      const ukphone = String(entry.phonetic ?? '')
        .trim()
        .replace(/^\/|\/$/g, '')
      const usphone = usPhones.get(key) ?? ''
      if (usphone) usHit++

      output.push({ name, trans: [String(entry.meaning).trim()], usphone, ukphone })
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n')

  console.log(`${source.title}：${output.length} 词 → public/dicts/NZ_K12_Year9.json`)
  console.log(`  英式音标 ${output.filter((w) => w.ukphone).length} 个，美式音标 ${usHit} 个（其余源数据没有，留空）`)
  for (const category of source.categories) {
    console.log(`  ${category.category.padEnd(22)} ${category.words.length} 词`)
  }
}

main()
