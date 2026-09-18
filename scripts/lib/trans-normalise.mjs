/**
 * 词库释义（trans）的归一化规则，由 normalise-dict-trans.mjs 使用。
 *
 * 各词库的抓取源不同，同一个词的释义长相差别极大：
 *   coca20000        "n.拖车,追踪者,<美>拖车式活动房屋vt.用拖车运vi.乘拖带式居住车旅行"
 *   Level8luan_2_T   "复制；再生；生殖"                       （完全不标词性）
 *   某些库           "vt. 控告【搭配】accuse sb of sth 指控…"   （释义里塞了标注块）
 *   Oxford5000       整个词典网页被抓进来，最长 30 万字符
 *
 * 这里只做确定性的格式整理，不改写、不生成内容 —— 内容本来就在源数据里，
 * 坏的是格式。所以全过程幂等，跑两遍结果相同，diff 可复查。
 */

// 词库里实际出现的词性缩写。长的排前面，否则 v. 会抢先吃掉 vt.&vi.
const POS_ALTERNATIVES = [
  'vt\\.\\s*&\\s*vi\\.',
  'vt\\s*&\\s*vi\\.',
  'v\\.\\s*&\\s*n\\.',
  'abbr\\.',
  'prep\\.',
  'pron\\.',
  'conj\\.',
  'auxv\\.',
  'aux\\.',
  'adj\\.',
  'adv\\.',
  'art\\.',
  'num\\.',
  'int\\.',
  'pl\\.',
  'vt\\.',
  'vi\\.',
  'na\\.',
  'ad\\.',
  'n\\.',
  'v\\.',
  'a\\.',
].join('|')

const POS_ANYWHERE = new RegExp(`(?:${POS_ALTERNATIVES})`, 'gi')

/** a. / ad. 这类简写各库混用，归到常见写法，免得同一个词性出现两种标签 */
const POS_CANONICAL = { 'a.': 'adj.', 'ad.': 'adv.', 'na.': 'n.' }

// 部分词库把助记、同义反义、搭配用【】标注拼在释义后面。
// 那些内容由 build-word-notes.mjs 单独抽成字段，释义里不该再留，从标记处整段截掉。
const ANNOTATION = /【(?:记忆|记|同义|近|反义|反|同根|派|搭配|考|例句|例|用法)】/
// 但 "【医】脑炎"、"【动】温血的" 里的【】是学科标签，后面跟的是真正的释义。
// 这种只去掉标签本身，不能连释义一起截掉。
const DOMAIN_LABEL = /【[^】]{1,4}】/g
// 抓取源里混进了语法表（时态/复数/比较级等），从标签处整段截掉
const TABLE_LABEL = /(时\s*态|复\s*数|比较级|最高级|第三人称|现在分词|过去[式分]词?|[名动副形]\s*词)\s*[:：]/
// 把英文例句/英文释义直接接在中文后面的，连续 4 个以上英文单词就当例句截掉
const EMBEDDED_EN = /[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){3,}/
/**
 * "遭受；忍受；经历 (Suffer)人名；(意)苏费尔" —— 词典把专名义项接在正常释义后面，
 * 全仓 6146 条。从标记处截断，保留前面真正的释义；整条都是专名的会被截空，
 * 调用方回落到原文。
 */
const NAME_GLOSS = /[（(]\s*[A-Za-z][^）)]{0,24}[）)]\s*(?:人名|地名)/

const CJK = /[一-龥]/

/**
 * 释义的长度上限。p90 是 40 字、p99 是 123 字，超过这个量的基本是抓取事故
 * （Oxford5000 有 19 条把整页词典抓了进来，最长 304618 字符）。
 * 截断只在按义项切分之后做，保证截出来的是完整义项而不是半句话。
 */
export const MAX_SENSES_PER_POS = 3
export const MAX_SENSE_CHARS = 18
export const MAX_POS_GROUPS = 3
/** 打字页单词下面那行释义读起来最舒服的总长度，打分时按与它的偏差扣分 */
const IDEAL_TOTAL_CHARS = 24

// 838 条释义里的词典标记被 HTML 转义过（"&lt;史&gt;褫夺公民权的判决"），
// 不先解码的话后面的 <...> 规则认不出来，&gt 会作为乱码留在释义里
const HTML_ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' }

const decodeEntities = (text) =>
  text
    .replace(/&(?:lt|gt|amp|quot|apos|nbsp);/g, (m) => HTML_ENTITIES[m])
    .replace(/&#(\d{1,5});/g, (_, code) => String.fromCharCode(Number(code)))

/**
 * 单条 trans 的处理上限。释义长度 p99 是 123 字，超过这个量的只可能是抓取事故，
 * 留着既没有信息量，又会让后面的正则在超长英文串上退化。先截断再处理。
 */
const MAX_INPUT_CHARS = 400

/** 第一步：整段级别的清理，把不属于释义的东西整块截掉 */
export function stripNonGloss(raw) {
  let text = decodeEntities(
    String(raw ?? '')
      .replace(/\r/g, '')
      .slice(0, MAX_INPUT_CHARS),
  )

  for (const pattern of [ANNOTATION, TABLE_LABEL, EMBEDDED_EN, NAME_GLOSS]) {
    const hit = pattern.exec(text)
    if (hit) text = text.slice(0, hit.index)
  }

  return (
    text
      // 〔工人，水手间的亲密称呼〕、<美>、<非> 这类是词典的语域标注，不是释义
      .replace(/〔[^〕]*〕/g, '')
      .replace(/<[^>]{1,8}>/g, '')
      // ［C-常用 pl.］［U］这类是词典的用法标签，里面的 pl. 会被误当成词性切分点
      .replace(/［[^］]*］/g, '')
      .replace(/\[[^\]]{0,20}\]/g, '')
      .replace(DOMAIN_LABEL, '')
      // 学科标签去掉之后还剩的【】只可能是标注块或语法表（"【比较级 最高级】"），整段截掉
      .replace(/【[\s\S]*$/, '')
      // (~ with sth) 这类句法提示同理
      .replace(/[（(]\s*~[^）)]*[）)]/g, '')
      // "可用的，可行的：put" —— 冒号后挂一个英文词是词典的同义词交叉引用，
      // 连同空着的冒号一起去掉，否则会留下 "可行的：" 这种半截话
      .replace(/[:：]\s*[A-Za-z][A-Za-z'’-]*\s*/g, '')
      .replace(/[:：]\s*(?=[；;，,]|$)/g, '')
      .replace(/\s*\n+\s*/g, ' ')
      .trim()
  )
}

/** 第二步：分隔符归一。各库混用 ASCII 逗号、破折号、顿号，统一成中文分号 */
export function normaliseSeparators(text) {
  return (
    text
      // 汉字之间的 ASCII 逗号是顿号的误写
      .replace(/([一-龥）)])\s*,\s*(?=[一-龥（(])/g, '$1；')
      // " - " 被一些库当义项分隔符用
      .replace(/\s+[-—–]\s+/g, '；')
      // 词性糊在上一条释义尾巴上："…预告片vt.用拖车运" → "…预告片 vt.用拖车运"
      .replace(new RegExp(`([\\u4e00-\\u9fa5）)])(${POS_ALTERNATIVES})`, 'gi'), '$1 $2')
      .replace(/[；;]{2,}/g, '；')
      .trim()
  )
}

/**
 * 单条义项的收尾。除了去首尾标点，还要处理两类粘连：
 *   "固执的SET"        —— 下一个词条（缩写义项）的词头黏在了上一条尾巴上
 *   "在同一地方工作的)一批人" —— 前半个括号在截断时被切掉了，留下孤立的右括号
 */
const tidySense = (zh) => {
  let text = zh.replace(/\s+/g, ' ')

  // 中文义项尾巴上挂的英文是粘连或交叉引用，不是释义的一部分：
  //   "固执的SET"                  下一个词条的词头
  //   "投球，bowling in cricket"    英文释义没被当成例句（不足 4 个词）
  // 整段剥掉而不是一次剥一个词，否则要反复跑好几遍才收敛；剥完没中文了就不动，
  // 避免把本来就是英文的内容清空。
  if (CJK.test(text)) {
    // 用单量词的字符类而不是 (?:\s*\w+)+ 这种嵌套量词 —— 后者遇到长英文串会
    // 触发灾难性回溯，Oxford5000 那条 30 万字符的条目能把整个脚本挂死
    const stripped = text.replace(/[A-Za-z][A-Za-z'’\s-]*$/, '')
    if (CJK.test(stripped)) text = stripped
  }

  // 括号数量对不上就把孤立的那一侧去掉，别留半拉括号。
  // 〔〕【】的开括号常常在上一步截断时被切掉，只剩右半边
  for (const [open, close] of [
    [/[（(]/g, /[）)]/g],
    [/〔/g, /〕/g],
    [/【/g, /】/g],
  ]) {
    if ((text.match(open) ?? []).length !== (text.match(close) ?? []).length) {
      text = text.replace(open, '').replace(close, '')
    }
  }

  return text
    .replace(/^[\s，,；;、。.&·=＝\-—–]+/, '')
    .replace(/[\s，,；;、&·=＝\-—–]+$/, '')
    .trim()
}

/**
 * 第三步：按词性切分成义项组。
 * 返回 [{ pos, senses: string[] }]，没有任何词性标记时 pos 为空字符串。
 */
export function splitByPos(text) {
  const marks = [...text.matchAll(POS_ANYWHERE)]

  const chunks =
    marks.length === 0
      ? [{ pos: '', body: text }]
      : marks.map((mark, i) => ({
          pos: mark[0].toLowerCase().replace(/\s+/g, ''),
          body: text.slice(mark.index + mark[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined),
        }))

  // 第一个词性标记之前还有内容的话，那是一条没标词性的释义，不能丢
  if (marks.length > 0 && marks[0].index > 0) {
    const head = tidySense(text.slice(0, marks[0].index))
    if (head) chunks.unshift({ pos: '', body: head })
  }

  const grouped = new Map()
  for (const chunk of chunks) {
    const pos = POS_CANONICAL[chunk.pos] ?? chunk.pos
    // 分号是各库通用的义项分隔符；只有在整条都没有分号时，逗号才承担这个角色
    // （"n.量，数量,定量，大批"）。顿号不切 —— 它在 "按时间、顺序等接着" 里是
    // 单条义项内部的并列，切开会把一条完整释义拆碎。
    const separator = /[；;]/.test(chunk.body) ? /[；;]/ : /[；;，,]/
    const senses = chunk.body
      .split(separator)
      .map(tidySense)
      .filter((zh) => zh && CJK.test(zh))

    if (senses.length === 0) continue
    const bucket = grouped.get(pos) ?? []
    for (const zh of senses) if (!bucket.includes(zh)) bucket.push(zh)
    grouped.set(pos, bucket)
  }

  return [...grouped.entries()].map(([pos, senses]) => ({ pos, senses }))
}

/**
 * 已经有标了词性的组时，无词性的那组多半是抓取残留（"adj. 近来的 | 全新世"），
 * 摆在释义里只会让人以为漏标了词性。
 *
 * 必须在一条词库记录的全部 trans 合并之后再调用：有的库把不同词性拆成了数组的多项，
 * 逐项判断的话每一项都「只有自己」，孤儿组永远过滤不掉。
 */
export function dropOrphanGroups(groups) {
  return groups.some((g) => g.pos) ? groups.filter((g) => g.pos) : groups
}

/** 完整流水线：一条原始 trans → [{ pos, senses }]，无法救的返回空数组 */
export function parseTrans(raw) {
  const text = normaliseSeparators(stripNonGloss(raw))
  if (!text || !CJK.test(text)) return []
  return splitByPos(text)
}

/**
 * 渲染成词库里存的形态：一个词性一条，前端 join('；') 出来仍然可读。
 *   [{pos:'n.', senses:['拖车','预告片']}, {pos:'vt.', senses:['用拖车运']}]
 *   → ["n. 拖车；预告片", "vt. 用拖车运"]
 */
export function capGroups(groups) {
  return groups
    .map(({ pos, senses }) => ({ pos, senses: senses.filter((zh) => zh.length <= MAX_SENSE_CHARS).slice(0, MAX_SENSES_PER_POS) }))
    .filter((g) => g.senses.length > 0)
    .slice(0, MAX_POS_GROUPS)
}

export function renderTrans(groups) {
  return capGroups(groups).map(({ pos, senses }) => (pos ? `${pos} ${senses.join('；')}` : senses.join('；')))
}

/**
 * 候选打分。三个信号，按重要性排：
 *   1. 有没有标词性 —— 全仓 120 个词库不标，补齐词性是统一的第一目标。这里给的是
 *      「有/没有」的固定分，不按词性组数累加：按组数累加会让堆砌了四五个词性的
 *      通用词典条目永远压过人工精编的简洁释义（红宝书那类）。
 *   2. 覆盖的词性数和义项数，都有上限，避免又滑回堆砌取胜。
 *   3. 长度按与 IDEAL_TOTAL_CHARS 的偏差扣分 —— 打字页那行要能一眼读完，
 *      过长和过短都不好。打分前先截断，保证比的是最终会显示出来的内容。
 */
export function scoreGroups(groups) {
  const capped = capGroups(groups)
  // 没有可用内容用 -Infinity 表示，而不是负数 —— 长度偏差是会扣成负分的，
  // 拿「分数为负」当「不可用」会把 "教育；培养" 这种又短又对的释义误判掉
  if (capped.length === 0) return Number.NEGATIVE_INFINITY

  const hasPos = capped.some((g) => g.pos)
  const senseCount = capped.reduce((sum, g) => sum + g.senses.length, 0)
  const chars = capped.reduce((sum, g) => sum + g.senses.reduce((n, zh) => n + zh.length, 0), 0)

  // 只罚过长，不罚过短。"v. 分析" 这种精准的短释义在打字页上恰恰是最好的，
  // 按与理想长度的绝对偏差扣分会把它们连带罚掉
  const tooLong = Math.max(0, chars - IDEAL_TOTAL_CHARS)

  return (hasPos ? 80 : 0) + capped.length * 10 + Math.min(senseCount, 6) * 10 - tooLong * 1.5
}

/**
 * 兜底清洗。跨库统一选不出结果时（全仓只有一个来源、且那个来源是英文或整页抓取），
 * 不能原样保留 —— Oxford5000 有条目是 304618 字符的整页词典。
 * 这里不要求中文，只把结构性垃圾去掉并把长度截住，保证落盘的东西是可读的。
 */
export function salvageTrans(list) {
  const out = []
  for (const raw of list) {
    const text = stripNonGloss(raw)
      .replace(/\s+/g, ' ')
      .replace(/^[\s，,；;、。.&·=＝-]+/, '')
      .replace(/[\s，,；;、&·=＝-]+$/, '')
      .trim()
    if (text && !out.includes(text)) out.push(text.slice(0, MAX_SALVAGE_CHARS))
    if (out.length >= MAX_SALVAGE_ENTRIES) break
  }
  if (out.length > 0) return out

  // 规则把内容清空了（Oxford5000 有条目整条是英文散文，开头就命中「连续 4 个以上
  // 英文单词」被截到零）。这种直接截断原文 —— 内容没法变好，但长度必须有硬上限。
  const raw = list.find((t) => typeof t === 'string' && t.trim())
  return raw ? [raw.replace(/\s+/g, ' ').trim().slice(0, MAX_SALVAGE_CHARS)] : []
}

const MAX_SALVAGE_CHARS = 80
const MAX_SALVAGE_ENTRIES = 3

/** 词库的释义主体是不是英文。这类词库（4000_Essential_English_Words 等）不参与中文统一 */
export function isEnglishGlossDict(words) {
  let total = 0
  let chinese = 0
  for (const word of words) {
    const list = Array.isArray(word?.trans) ? word.trans : typeof word?.trans === 'string' ? [word.trans] : []
    const text = list.filter((t) => typeof t === 'string').join(' ')
    if (!text) continue
    total++
    if (CJK.test(text)) chinese++
  }
  return total > 0 && chinese / total < 0.5
}
