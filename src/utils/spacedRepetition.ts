/**
 * 间隔重复调度。SM-2 的变体，配合本项目「不让用户自评」的前提做了两处改动。
 *
 * 为什么是间隔重复：一个词被练一次就翻篇，遗忘曲线会在几天内把它吃掉。间隔效应是
 * 记忆研究里最稳的结论之一（Cepeda 2006 元分析覆盖 254 项研究）—— 同样的总练习量，
 * 拉开间隔比集中练习记得牢得多，而且间隔越往后拉得越长，收益越高。
 *
 * 为什么是 SM-2 而不是 FSRS：FSRS 的 DSR 模型更准，但要拟合十几个权重，而本项目
 * 既没有自评数据也没有足够的历史样本去拟合。SM-2 用一个 ease factor 就能自适应
 * 单词难度，对这个体量足够了。
 *
 * 两处改动：
 *
 * 1. 评级由表现推导，不让用户自评。Anki 让用户点「困难/良好/简单」，本项目是打字
 *    练习，中断流程去点评级既打断节奏又不可靠。改成从「拼错没有」和「敲得多犹豫」
 *    推导 —— 检索延迟是公认的记忆强度指标，拼对但明显卡顿说明是硬想出来的。
 *
 * 2. 答错不安排当天重来。SM-2 原版要求失败的卡片当天再过一遍，本项目的章末重测
 *    （见 ResultScreen）已经承担了这件事：拼错的词在同一次练习里就会被再测一轮。
 *    所以这里把失败的词排到第二天，避免同一个机制做两遍。
 */

/** 表现评级。对应 SM-2 的 q 值：fail=2，hard=3，good=4，easy=5 */
export type ReviewGrade = 'fail' | 'hard' | 'good' | 'easy'

const GRADE_TO_Q: Record<ReviewGrade, number> = { fail: 2, hard: 3, good: 4, easy: 5 }

export const INITIAL_EASE_FACTOR = 2.5
/** SM-2 规定的 ease factor 下限，再低会让间隔几乎不增长 */
const MIN_EASE_FACTOR = 1.3

/** 连续答对第 1、2 次的固定间隔（天），之后才开始乘 ease factor */
const FIRST_INTERVAL_DAYS = 1
const SECOND_INTERVAL_DAYS = 3
/** 间隔上限，超过一年的安排对背单词没有实际意义，还会让词永远不再出现 */
const MAX_INTERVAL_DAYS = 365

/**
 * 顽固词（leech）阈值：累计答错多少次之后，就不该再靠「明天重来一次」解决。
 *
 * 依据是合意难度（desirable difficulty）的边界条件 —— 难度有益的前提是检索最终能
 * 成功。一个词失败到第 8 次，早就越过那条线了，再用同样的方式测一遍，期望收益接近零，
 * 却仍然占着当日复习额度，把其他正在衰退的词挤到明天。需要的是换一种处理，不是加大剂量。
 *
 * 取 8 是沿用 Anki 的默认值。但要注意本项目的 lapses 统计口径更宽：Anki 只算复习失败，
 * 这里每次练习答错都算，包括正常章节练习和章末重测 —— 也就是说一章里栽两次就是 2 次。
 * 所以这里的 8 比 Anki 的 8 更容易达到，调这个值的时候要记得这一点。
 */
export const LEECH_THRESHOLD = 8

/**
 * 顽固词再次答错后的冷却天数。不退回 1 天，是因为「每天重测同一个已经证明测不出来的词」
 * 正是要解决的问题；也不是放弃它 —— 隔几天再来一次，间隔本身还有间隔效应的价值。
 */
const LEECH_COOLOFF_DAYS = 4

/**
 * 是否是「当前正卡住」的顽固词。
 *
 * 两个条件缺一不可：历史上错得够多（lapses 到阈值），**而且**当下仍然没答对
 * （repetitions 归零）。只看 lapses 会造成永久降级 —— lapses 只增不减，一个词一旦
 * 被标记就再也回不到正常队列，即使用户后来已经连续答对多次、间隔拉到很长。那样它
 * 会被永远排在队尾、额度紧时永远轮不上，然后静默衰退，连失败都不会发生。
 *
 * 加上 repetitions === 0 之后，用户只要把它答对一次就自动回到正常队列 —— 这也正是
 * 该回去的时机：检索重新开始成功，合意难度的前提条件恢复了。
 */
export const isLeech = ({ lapses, repetitions }: Pick<ReviewState, 'lapses' | 'repetitions'>) =>
  lapses >= LEECH_THRESHOLD && repetitions === 0

export type ReviewState = {
  /** 连续答对的次数，答错归零 */
  repetitions: number
  /** 当前间隔，单位天 */
  intervalDays: number
  easeFactor: number
  /** 累计答错次数，只用于统计和排序，不参与调度 */
  lapses: number
}

export const initialReviewState: ReviewState = {
  repetitions: 0,
  intervalDays: 0,
  easeFactor: INITIAL_EASE_FACTOR,
  lapses: 0,
}

/**
 * 按表现推导评级。
 *
 * baselineInterval 是这个用户敲对字母的平均间隔（毫秒），由调用方维护成滑动均值 ——
 * 用个人基线而不是绝对毫秒，才能同时适配打字快的人和慢的人。基线缺失时退回到
 * 一组保守的绝对值。
 */
export function gradeFromPerformance({
  wrongCount,
  averageKeyInterval,
  baselineInterval,
}: {
  wrongCount: number
  averageKeyInterval: number
  baselineInterval: number
}): ReviewGrade {
  if (wrongCount > 0) return 'fail'

  // 算不出间隔（单字母词、或没有连续敲对两个字母）时不做难易判断，按中间档处理
  if (averageKeyInterval <= 0) return 'good'

  const baseline = baselineInterval > 0 ? baselineInterval : 250

  // 明显慢于自己的平均水平 = 硬想出来的，下次间隔不该拉太长
  if (averageKeyInterval > baseline * 1.6) return 'hard'
  // 明显快于平均 = 已经自动化了，可以拉长间隔
  if (averageKeyInterval < baseline * 0.8) return 'easy'
  return 'good'
}

/** 按 SM-2 推进一个词的复习状态，返回新状态和距今的天数 */
export function scheduleNext(state: ReviewState, grade: ReviewGrade): ReviewState & { nextIntervalDays: number } {
  const q = GRADE_TO_Q[grade]

  // SM-2 原式：EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  const easeFactor = Math.max(MIN_EASE_FACTOR, state.easeFactor + delta)

  if (grade === 'fail') {
    const lapses = state.lapses + 1
    // 连续次数归零，间隔退回起点。排到第二天而不是当天，当天的重来由章末重测负责。
    // 已经成了顽固词的除外 —— 那种词天天回到队列里也测不出来，给一段冷却
    // 答错必然让 repetitions 归零，所以这里只需判 lapses
    const intervalDays = isLeech({ lapses, repetitions: 0 }) ? LEECH_COOLOFF_DAYS : FIRST_INTERVAL_DAYS
    return {
      repetitions: 0,
      intervalDays,
      easeFactor,
      lapses,
      nextIntervalDays: intervalDays,
    }
  }

  const repetitions = state.repetitions + 1
  let intervalDays: number
  if (repetitions === 1) {
    intervalDays = FIRST_INTERVAL_DAYS
  } else if (repetitions === 2) {
    intervalDays = SECOND_INTERVAL_DAYS
  } else {
    intervalDays = Math.round(state.intervalDays * easeFactor)
  }
  intervalDays = Math.min(Math.max(intervalDays, FIRST_INTERVAL_DAYS), MAX_INTERVAL_DAYS)

  return { repetitions, intervalDays, easeFactor, lapses: state.lapses, nextIntervalDays: intervalDays }
}

export const DAY_IN_SECONDS = 24 * 60 * 60

/**
 * 到期时间统一压到「那一天的开始」，用本地时区。
 * 不这么做的话，早上 8 点练的词第二天 8 点才到期，而用户很可能 7 点就来了，
 * 会看到「今日待复习 0」然后过一会儿又冒出来一批。
 */
export function dueTimestampAfter(intervalDays: number, from: Date = new Date()): number {
  const due = new Date(from)
  due.setDate(due.getDate() + intervalDays)
  due.setHours(0, 0, 0, 0)
  return Math.floor(due.getTime() / 1000)
}

/** 今天结束前都算「今日待复习」，即以明天零点为界 */
export function endOfTodayTimestamp(from: Date = new Date()): number {
  const end = new Date(from)
  end.setHours(23, 59, 59, 999)
  return Math.floor(end.getTime() / 1000)
}
