import { db } from '.'
import type { IWordReviewState } from './record'
import { getUTCUnixTimestamp } from '@/utils'
import type { ReviewGrade } from '@/utils/spacedRepetition'
import {
  dueTimestampAfter,
  endOfTodayTimestamp,
  gradeFromPerformance,
  initialReviewState,
  isLeech,
  scheduleNext,
} from '@/utils/spacedRepetition'

/**
 * 间隔重复状态的读写。调度算法本身在 src/utils/spacedRepetition.ts，
 * 这里只负责落库、查到期队列、以及给老用户补历史。
 */

const normalise = (word: string) => word.trim().toLowerCase()

/**
 * 一个词练完后推进它的复习安排。
 *
 * 每次练习都会调用，包括正常章节练习 —— 不只是在复习会话里。这是有意的：
 * 用户在第 3 章敲对了 analyse，就等于完成了一次成功检索，没有理由再让它当天到期。
 */
export async function updateReviewStateAfterAttempt({
  word,
  wrongCount,
  averageKeyInterval,
  baselineInterval,
}: {
  word: string
  wrongCount: number
  averageKeyInterval: number
  baselineInterval: number
}): Promise<ReviewGrade | undefined> {
  const key = normalise(word)
  if (!key) return undefined

  const grade = gradeFromPerformance({ wrongCount, averageKeyInterval, baselineInterval })

  try {
    const existing = await db.wordReviewStates.where('word').equals(key).first()
    const next = scheduleNext(existing ?? initialReviewState, grade)

    const state: IWordReviewState = {
      ...(existing?.id === undefined ? {} : { id: existing.id }),
      word: key,
      repetitions: next.repetitions,
      intervalDays: next.intervalDays,
      easeFactor: next.easeFactor,
      lapses: next.lapses,
      dueTimestamp: dueTimestampAfter(next.nextIntervalDays),
      lastReviewedAt: getUTCUnixTimestamp(),
    }

    await db.wordReviewStates.put(state)
    return grade
  } catch (error) {
    // 调度失败不该影响练习本身，静默降级
    console.error('更新复习状态失败', error)
    return grade
  }
}

/** 今天（含以前）到期的单词，全词库范围 */
export async function getDueWordSet(): Promise<Set<string>> {
  try {
    const states = await db.wordReviewStates.where('dueTimestamp').belowOrEqual(endOfTodayTimestamp()).toArray()
    return new Set(states.map((state) => state.word))
  } catch (error) {
    console.error('读取到期单词失败', error)
    return new Set()
  }
}

/**
 * 到期的单词按「最该先复习」排序：逾期越久越靠前，同样逾期时错得多的靠前。
 * 逾期久的遗忘风险最高，先救它们。
 *
 * 唯一的例外是顽固词，它们一律排到最后。原本「错得多的靠前」这条规则对普通词是对的，
 * 但碰上顽固词会翻车：顽固词答错就退回 1 天，于是天天到期，又因为错得最多而天天排在
 * 队首，先把当日额度吃掉 —— 其余到期的词被挤到明天，而它们正在衰退。用户每次打开
 * 复习还都是从自己最挫败的那几个词开始。排到队尾之后，额度优先给真正测得出来的词，
 * 顽固词在额度有富余时才轮到。
 */
export async function getDueStatesSorted(): Promise<IWordReviewState[]> {
  try {
    const states = await db.wordReviewStates.where('dueTimestamp').belowOrEqual(endOfTodayTimestamp()).toArray()
    return states.sort((a, b) => Number(isLeech(a)) - Number(isLeech(b)) || a.dueTimestamp - b.dueTimestamp || b.lapses - a.lapses)
  } catch (error) {
    console.error('读取到期单词失败', error)
    return []
  }
}

/**
 * 给老用户补历史。本功能上线前练过的词在 wordRecords 里有记录，但没有复习状态，
 * 不补的话「今日待复习」会一直是 0，直到用户重新练一遍。
 *
 * 用每个词最后一次练习的表现做初值，把它安排到「最后一次练习 + 1 天」——
 * 也就是说历史词基本会立刻到期。这是保守的：宁可让用户多复习一轮，
 * 也不要凭空假设他还记得。
 *
 * 幂等：已有状态的词跳过，所以重复调用安全。
 */
let backfillPromise: Promise<number> | undefined

export function backfillReviewStates(baselineInterval: number): Promise<number> {
  // 补历史要全表扫 wordRecords，重度用户那里是几万条。每个页面加载只跑一次就够 ——
  // 之后新练的词由 updateReviewStateAfterAttempt 顺手建状态，不需要再扫。
  // 用进程内的 promise 而不是 localStorage 标记，是为了让「导入数据后刷新」能重新补上。
  backfillPromise ??= runBackfill(baselineInterval)
  return backfillPromise
}

async function runBackfill(baselineInterval: number): Promise<number> {
  try {
    const existing = new Set((await db.wordReviewStates.toArray()).map((state) => state.word))

    const latestByWord = new Map<string, { timeStamp: number; wrongCount: number; timing: number[] }>()
    await db.wordRecords.each((record) => {
      const key = normalise(record.word)
      if (!key || existing.has(key)) return

      const prev = latestByWord.get(key)
      if (!prev || record.timeStamp > prev.timeStamp) {
        latestByWord.set(key, { timeStamp: record.timeStamp, wrongCount: record.wrongCount, timing: record.timing ?? [] })
      }
    })

    if (latestByWord.size === 0) return 0

    const states: IWordReviewState[] = []
    latestByWord.forEach((record, word) => {
      const timing = record.timing
      const averageKeyInterval = timing.length > 0 ? timing.reduce((sum: number, value: number) => sum + value, 0) / timing.length : 0
      const grade = gradeFromPerformance({ wrongCount: record.wrongCount, averageKeyInterval, baselineInterval })
      const next = scheduleNext(initialReviewState, grade)

      states.push({
        word,
        repetitions: next.repetitions,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        lapses: next.lapses,
        // 以最后一次练习为起点，历史越久的词到期越早
        dueTimestamp: dueTimestampAfter(next.nextIntervalDays, new Date(record.timeStamp * 1000)),
        lastReviewedAt: record.timeStamp,
      })
    })

    await db.wordReviewStates.bulkPut(states)
    return states.length
  } catch (error) {
    console.error('补齐历史复习状态失败', error)
    return 0
  }
}
