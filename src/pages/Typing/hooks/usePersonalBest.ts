import { currentChapterAtom, currentDictIdAtom, isReviewModeAtom } from '@/store'
import { getUTCUnixTimestamp } from '@/utils'
import { db } from '@/utils/db'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'

export type PersonalBest = {
  /** 之前的最高 WPM */
  wpm: number
  /** 之前的最高正确率 */
  accuracy: number
  /** 之前的最短章节耗时（秒） */
  time: number
  /** 之前完成过多少次 */
  attempts: number
}

/**
 * 读取当前词典 + 章节的历史最好成绩，用来在结果页给出「比上次好没好」的反馈。
 *
 * 本次成绩会在结果页出现的同时被写入 chapterRecords，为了避免把它当成历史记录，
 * 只统计挂载时刻之前的记录（timeStamp 是秒级，同一秒内不可能完成两章）。
 */
export function usePersonalBest(): PersonalBest | undefined {
  const dictId = useAtomValue(currentDictIdAtom)
  const currentChapter = useAtomValue(currentChapterAtom)
  const isReviewMode = useAtomValue(isReviewModeAtom)

  // 只在挂载时取一次时间，后续 re-render 不能让这个界线漂移
  const [before] = useState(getUTCUnixTimestamp)
  const [best, setBest] = useState<PersonalBest | undefined>(undefined)

  useEffect(() => {
    // 错题复习的章节号是 -1，各次之间不可比，不做对比
    if (isReviewMode) return

    let cancelled = false
    db.chapterRecords
      .where('[dict+chapter]')
      .equals([dictId, currentChapter])
      .toArray()
      .then((records) => {
        if (cancelled) return

        const history = records.filter((record) => record.timeStamp < before && record.time > 0)
        if (history.length === 0) return

        setBest({
          wpm: Math.max(...history.map((r) => Math.round((r.wordCount / r.time) * 60))),
          accuracy: Math.max(
            ...history.map((r) => {
              const total = r.correctCount + r.wrongCount
              return total === 0 ? 0 : Math.round((r.correctCount / total) * 100)
            }),
          ),
          time: Math.min(...history.map((r) => r.time)),
          attempts: history.length,
        })
      })

    return () => {
      cancelled = true
    }
  }, [dictId, currentChapter, isReviewMode, before])

  return best
}
