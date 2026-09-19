/**
 * 验证「首击延迟」是不是比「字母间隔」更能预测遗忘。
 *
 * 背景：SRS 评级（gradeFromPerformance）和章末重测现在都用字母间隔判定「犹豫」。
 * 但字母间隔测的是打字流畅度 —— 双字母组合的手型、左右手交替决定了大部分差异，
 * 而且 <=5 字母的词只有 <=4 个间隔，均值噪声很大。首击延迟（timeToFirstKey，
 * 见 utils/db/record.ts）才是检索延迟的直接指标，但它也有自己的噪声。哪个更好
 * 不能靠推理，要用真实数据比。
 *
 * 判据：对同一个词的相邻两次练习，看第 N 次的信号能不能预测第 N+1 次是否拼错。
 * 用 AUC（等价于 Mann-Whitney U 的归一化形式）衡量：0.5 = 和瞎猜一样，
 * 越接近 1 越有预测力。两个信号跑在同一批样本对上，可直接比较。
 *
 * 用法：
 *   1. 在 app 里「设置 → 数据 → 导出数据」，得到 Qwerty-Learner-User-Data-*.gz
 *   2. node scripts/analyse-retrieval-latency.mjs <那个文件>
 *
 * 只读，不写任何东西。
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

/** 走神、切窗口会制造假的长延迟。超过这个值的样本直接丢弃，不参与统计 */
const MAX_PLAUSIBLE_LATENCY_MS = 15000

function loadWordRecords(file) {
  const raw = file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)).toString('utf8') : fs.readFileSync(file, 'utf8')
  const dump = JSON.parse(raw)
  const tables = dump?.data?.data
  if (!Array.isArray(tables)) throw new Error('不像 Dexie 导出文件：找不到 data.data')

  const table = tables.find((t) => t.tableName === 'wordRecords')
  if (!table) throw new Error('导出里没有 wordRecords 表')
  return table.rows ?? []
}

/** 相邻两次练习配对：用前一次的信号，预测后一次是否拼错 */
function buildPairs(records) {
  const byWord = new Map()
  for (const r of records) {
    const key = String(r.word ?? '').toLowerCase()
    if (!key) continue
    if (!byWord.has(key)) byWord.set(key, [])
    byWord.get(key).push(r)
  }

  const pairs = []
  for (const attempts of byWord.values()) {
    attempts.sort((a, b) => a.timeStamp - b.timeStamp)
    for (let i = 0; i < attempts.length - 1; i++) {
      const cur = attempts[i]
      const next = attempts[i + 1]
      // 前一次本身就拼错的，已经有更强的信号（wrongCount），不是这里要比的东西
      if (cur.wrongCount > 0) continue

      const timing = Array.isArray(cur.timing) ? cur.timing : []
      const letterInterval = timing.length > 0 ? timing.reduce((s, v) => s + v, 0) / timing.length : undefined
      const firstKey = typeof cur.timeToFirstKey === 'number' ? cur.timeToFirstKey : undefined

      pairs.push({
        letterInterval,
        firstKey: firstKey !== undefined && firstKey <= MAX_PLAUSIBLE_LATENCY_MS ? firstKey : undefined,
        forgotten: next.wrongCount > 0,
        wordLength: String(cur.word).length,
      })
    }
  }
  return pairs
}

/** AUC：随机取一个「后来拼错的」和一个「后来拼对的」，前者信号更大的概率 */
function auc(pairs, pick) {
  const pos = []
  const neg = []
  for (const p of pairs) {
    const v = pick(p)
    if (v === undefined || !Number.isFinite(v)) continue
    ;(p.forgotten ? pos : neg).push(v)
  }
  if (pos.length === 0 || neg.length === 0) return { auc: undefined, pos: pos.length, neg: neg.length }

  let wins = 0
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0
  return { auc: wins / (pos.length * neg.length), pos: pos.length, neg: neg.length }
}

function report(label, result) {
  if (result.auc === undefined) {
    console.log(`  ${label.padEnd(12)} 样本不足（后来拼错 ${result.pos} / 拼对 ${result.neg}）`)
    return
  }
  const verdict = result.auc >= 0.6 ? '有预测力' : result.auc >= 0.55 ? '弱' : '几乎等于瞎猜'
  console.log(`  ${label.padEnd(12)} AUC=${result.auc.toFixed(3)}  (${verdict})   样本 ${result.pos}+${result.neg}`)
}

function main() {
  const file = process.argv[2]
  if (!file) throw new Error('用法：node scripts/analyse-retrieval-latency.mjs <导出的 .gz 或 .json>')

  const records = loadWordRecords(file)
  const withLatency = records.filter((r) => typeof r.timeToFirstKey === 'number').length
  console.log(
    `wordRecords 共 ${records.length} 条，其中带首击延迟的 ${withLatency} 条 (${((withLatency * 100) / Math.max(1, records.length)).toFixed(
      1,
    )}%)`,
  )
  if (withLatency === 0) {
    console.log('\n还没有埋点数据。埋点是这次改动后才加的，需要先练一段时间再导出。')
    return
  }

  const pairs = buildPairs(records)
  console.log(`可用于对比的「相邻两次练习」样本对 ${pairs.length} 组\n`)

  console.log('全部样本：')
  report(
    '字母间隔',
    auc(pairs, (p) => p.letterInterval),
  )
  report(
    '首击延迟',
    auc(pairs, (p) => p.firstKey),
  )

  // 短词是字母间隔最不可靠的地方，单独看一眼差距是否更明显
  const short = pairs.filter((p) => p.wordLength <= 5)
  if (short.length > 0) {
    console.log(`\n只看 <=5 字母的短词（字母间隔样本最少、噪声最大，共 ${short.length} 组）：`)
    report(
      '字母间隔',
      auc(short, (p) => p.letterInterval),
    )
    report(
      '首击延迟',
      auc(short, (p) => p.firstKey),
    )
  }

  console.log('\n判读：首击延迟的 AUC 明显高于字母间隔，才值得把判定依据切过去；')
  console.log('两者都接近 0.5 的话，说明「犹豫」这个信号本身就不成立，该考虑的是去掉它而不是换一个。')
}

main()
