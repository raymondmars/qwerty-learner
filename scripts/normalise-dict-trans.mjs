/**
 * 统一全部中文词库的释义（trans）格式。
 *
 * 起因：313 个词库的释义来自不同抓取源，风格完全不统一 —— 142 个库几乎都标词性
 * （"n. 灵感"），120 个库几乎都不标（"复制；再生；生殖"），剩下 37 个混着来。
 * 同一个单词在雅思库和考研库里长相可以完全不同。此外还有一条烂尾：4.4% 的释义里
 * 嵌了英文例句，2% 带【搭配】标注块，Oxford5000 有 19 条把整页词典抓了进来
 * （最长 304618 字符）。
 *
 * 做法分两步，都不用 AI —— 内容本来就在源数据里，坏的只是格式：
 *   1. 归一化：按 lib/trans-normalise.mjs 的规则把每条释义整理成 [{pos, senses}]
 *   2. 跨库统一：每个单词在全部候选里挑得分最高的一份，写回所有含它的词库
 *
 * 这样同一个词在任何词库里释义都一致，且运行时零成本（前端读的还是 trans，不用改）。
 *
 * 不动的部分：释义主体是英文的词库（4000_Essential_English_Words、SATen、word_roots1
 * 等）整本跳过 —— 那是词库的设计，换成中文释义会毁掉它们。
 *
 * 全仓只有一个来源、且那个来源救不出中文释义的词（约 750 个），走 salvageTrans
 * 兜底：不要求中文，但结构垃圾照去、长度照截，不把抓取事故原样留在词库里。
 *
 * 跑一次就是终态：第一轮改完之后各库内容变了，重选一次还会有零星调整，
 * 所以内部迭代到不再变化为止（实测 3 轮），最后统一落盘。用法：
 *   node scripts/normalise-dict-trans.mjs --dry      只报告不落盘，附前后对照
 *   node scripts/normalise-dict-trans.mjs            实际写回
 */
import { dropOrphanGroups, isEnglishGlossDict, parseTrans, renderTrans, salvageTrans, scoreGroups } from './lib/trans-normalise.mjs'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const DICTS_DIR = path.join(ROOT, 'public', 'dicts')
const ANNOTATIONS_FILE = path.join(ROOT, 'scripts', 'data', 'dict-annotations.json')

const isDry = process.argv.includes('--dry')

function loadDicts() {
  const chinese = []
  const english = []

  for (const file of fs.readdirSync(DICTS_DIR).sort()) {
    if (!file.endsWith('.json')) continue

    let words
    try {
      words = JSON.parse(fs.readFileSync(path.join(DICTS_DIR, file), 'utf8'))
    } catch {
      continue
    }
    if (!Array.isArray(words)) continue
    ;(isEnglishGlossDict(words) ? english : chinese).push({ file, words })
  }

  return { chinese, english }
}

/**
 * 抓取质量明确有问题、只在没有别的来源时才用的词库。
 *
 * Oxford5000 的释义在源头就丢了义项分隔符：employment 存成
 * "n. 雇用, 就业职业, 工作使用, 运用有益的活动"，而同一个词 PTE_FIB_L 存的是
 * "- n. 雇用, 就业\n- 职业, 工作\n- 使用, 运用"，可见原本是按行分隔的。粘成一坨之后
 * 任何清洗规则都还原不回来。同一个库还有 19 条把整页词典抓了进来（最长 304618 字符）。
 * 不直接排除是因为有些词只有它收录，留作兜底。
 */
const LAST_RESORT_SOURCES = new Set(['Oxford5000.json'])
const LAST_RESORT_PENALTY = 1000

/**
 * 人工按学科整理过的词库。它们的释义是针对该学科语境挑的，通用词典换不来：
 * characterisation 在文学分析里是「人物塑造」，通用词典给的是「描述；人物之创造」；
 * analyse 要的是「分析」，不是「分解；细察」外加一条「"analyze" 的变体」。
 *
 * 这类词库自己收录的词保留自己的释义，不被统一覆盖；但它们照样参与竞争，
 * 可以把干净的释义提供给别的词库。
 */
const CURATED_SOURCES = new Set(['NZ_K12_Year9.json'])

/** 全部中文词库里，每个单词得分最高的那份释义 */
function buildCanonical(dicts) {
  const best = new Map()

  for (const { file, words } of dicts) {
    const penalty = LAST_RESORT_SOURCES.has(file) ? LAST_RESORT_PENALTY : 0

    for (const word of words) {
      if (typeof word?.name !== 'string') continue
      const key = word.name.toLowerCase()

      const list = Array.isArray(word.trans) ? word.trans : typeof word.trans === 'string' ? [word.trans] : []
      // 一条词库记录里的多条 trans 合起来算一个候选：有的库把不同词性拆成了多条
      const groups = dropOrphanGroups(mergeGroups(list.flatMap((t) => parseTrans(t))))
      const trans = renderTrans(groups)
      if (trans.length === 0) continue

      const score = scoreGroups(groups) - penalty
      const prev = best.get(key)
      if (!prev || score > prev.score) best.set(key, { score, trans })
    }
  }

  return best
}

/** 同词性的义项并到一组，保持首次出现的顺序 */
function mergeGroups(groups) {
  const merged = new Map()
  for (const { pos, senses } of groups) {
    const bucket = merged.get(pos) ?? []
    for (const zh of senses) if (!bucket.includes(zh)) bucket.push(zh)
    merged.set(pos, bucket)
  }
  return [...merged.entries()].map(([pos, senses]) => ({ pos, senses }))
}

const sameTrans = (a, b) => Array.isArray(a) && a.length === b.length && a.every((t, i) => t === b[i])

/**
 * 归一化会把【记忆】【搭配】【同义】这些标注块从释义里剥掉 —— 它们作为释义是噪声，
 * 但 build-word-notes.mjs 正是靠它们产出助记、固定搭配和同义反义词。词库是这些内容
 * 唯一的存放处，剥掉就找不回来了（清理过一次之后，助记会从 1227 条掉到 0）。
 *
 * 所以剥之前先原样存到侧文件，让 build-word-notes.mjs 继续有源可取。
 * 与已有内容合并而不是覆盖：第二次跑的时候词库里已经没有标注块了，
 * 直接覆盖会把第一次存下来的东西清空。
 */
function preserveAnnotations(dicts) {
  let saved = {}
  try {
    saved = JSON.parse(fs.readFileSync(ANNOTATIONS_FILE, 'utf8'))
  } catch {
    saved = {}
  }

  let added = 0
  for (const { words } of dicts) {
    for (const word of words) {
      if (typeof word?.name !== 'string') continue

      const list = Array.isArray(word.trans) ? word.trans : typeof word.trans === 'string' ? [word.trans] : []
      for (const trans of list) {
        if (typeof trans !== 'string' || !trans.includes('【')) continue

        const key = word.name.toLowerCase()
        const bucket = (saved[key] ??= [])
        if (!bucket.includes(trans)) {
          bucket.push(trans)
          added++
        }
      }
    }
  }

  fs.mkdirSync(path.dirname(ANNOTATIONS_FILE), { recursive: true })
  const sorted = Object.fromEntries(Object.entries(saved).sort(([a], [b]) => (a < b ? -1 : 1)))
  fs.writeFileSync(ANNOTATIONS_FILE, JSON.stringify(sorted, null, 2) + '\n')

  return { total: Object.keys(saved).length, added }
}

/**
 * 统一一轮：按当前内容重新选出每个词的最佳释义，写回内存里的词条。
 * 返回这一轮改动的条目数。
 */
function unifyOnce(dicts, samples) {
  const canonical = buildCanonical(dicts)
  let changed = 0

  for (const { file, words } of dicts) {
    for (const word of words) {
      if (typeof word?.name !== 'string') continue

      const list = Array.isArray(word.trans) ? word.trans : typeof word.trans === 'string' ? [word.trans] : []
      // 精编词库只做格式归一，不接受别处的释义
      const own = dropOrphanGroups(mergeGroups(list.flatMap((t) => parseTrans(t))))
      const hit = CURATED_SOURCES.has(file) ? { trans: renderTrans(own) } : canonical.get(word.name.toLowerCase())
      // 选不出统一释义时走兜底清洗，至少不把抓取事故原样留在词库里
      const next = hit && hit.trans.length > 0 ? hit.trans : salvageTrans(list)
      if (next.length === 0) continue
      if (sameTrans(word.trans, next)) continue

      if (samples.length < 25 && Math.random() < 0.02) {
        const before = (Array.isArray(word.trans) ? word.trans : [word.trans]).join(' | ')
        samples.push({ file, name: word.name, before, after: next.join(' | ') })
      }

      word.trans = next
      changed++
    }
  }

  return { changed, canonical }
}

/**
 * 迭代轮数上限。第一轮之后各词库的内容已经变了，重新选一次最佳释义还会有零星调整
 * （实测第二轮约 0.3%），到第三轮为零。循环到不再变化为止，让「跑一次就是终态」，
 * 而不是要求使用者自己跑够遍数。
 */
const MAX_PASSES = 6

function main() {
  const { chinese, english } = loadDicts()
  console.log(`中文词库 ${chinese.length} 个，英文释义词库 ${english.length} 个（不动）\n`)

  const annotations = preserveAnnotations(chinese)
  console.log(`标注块已留存：${annotations.total} 个单词（本次新增 ${annotations.added} 条）→ scripts/data/dict-annotations.json\n`)

  const samples = []
  const rounds = []
  let canonical

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const result = unifyOnce(chinese, samples)
    canonical = result.canonical
    rounds.push(result.changed)
    if (result.changed === 0) break
  }

  console.log(`统一释义覆盖 ${canonical.size} 个单词`)
  console.log(`迭代 ${rounds.length} 轮收敛，每轮改动 ${rounds.join(' → ')}\n`)

  console.log('—— 前后对照抽样 ——')
  for (const s of samples) {
    console.log(`  [${s.file}] ${s.name}`)
    console.log(`    原: ${s.before.length > 96 ? s.before.slice(0, 96) + '…' : s.before}`)
    console.log(`    新: ${s.after}`)
  }

  let changedFiles = 0
  let salvaged = 0

  for (const { file, words } of chinese) {
    const next = JSON.stringify(words, null, 2) + '\n'
    if (next !== fs.readFileSync(path.join(DICTS_DIR, file), 'utf8')) {
      changedFiles++
      if (!isDry) fs.writeFileSync(path.join(DICTS_DIR, file), next)
    }

    for (const word of words) {
      if (typeof word?.name === 'string' && !canonical.has(word.name.toLowerCase())) salvaged++
    }
  }

  console.log(`\n改写词库 ${changedFiles} 个，选不出统一释义、走兜底清洗的条目 ${salvaged} 个`)
  console.log(isDry ? '（--dry，没有落盘）' : '已写回 public/dicts/')
}

main()
