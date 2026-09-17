import {
  currentChapterAtom,
  currentDictIdAtom,
  currentDictInfoAtom,
  isReviewModeAtom,
  reviewModeInfoAtom,
  typingBaselineAtom,
} from '@/store'
import type { Word } from '@/typings'
import { ReviewRecord } from '@/utils/db/record'
import { MAX_REVIEW_SESSION_WORDS, backfillReviewStates, getDueStatesSorted } from '@/utils/db/review-state'
import { wordListFetcher } from '@/utils/wordListFetcher'
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'

/**
 * 今天该复习的单词。
 *
 * 复习状态按单词存、不分词库（记住了就是记住了），但会话只从当前词库里取 ——
 * 练 Year 9 的时候被塞一堆 GRE 词只会让人困惑。所以这里拿「全局到期集合」和
 * 「当前词库词表」求交集。
 */
export function useDueReview() {
  const currentDictInfo = useAtomValue(currentDictInfoAtom)
  const currentDictId = useAtomValue(currentDictIdAtom)
  const typingBaseline = useAtomValue(typingBaselineAtom)
  const isReviewMode = useAtomValue(isReviewModeAtom)
  const setReviewModeInfo = useSetAtom(reviewModeInfoAtom)
  const setCurrentChapter = useSetAtom(currentChapterAtom)
  const setCurrentDictId = useSetAtom(currentDictIdAtom)

  const { data: wordList } = useSWR(currentDictInfo.url, wordListFetcher)
  const [dueWords, setDueWords] = useState<Word[]>([])

  useEffect(() => {
    if (!wordList) return

    let cancelled = false
    const load = async () => {
      // 本功能上线前练过的词没有复习状态，先补一次。幂等，已有状态的词会跳过
      await backfillReviewStates(typingBaseline)

      const states = await getDueStatesSorted()
      if (cancelled) return

      // 到期状态已按「最该先复习」排好序，这里按同样的顺序从词表里取词
      const byName = new Map(wordList.map((word) => [word.name.toLowerCase(), word]))
      const words: Word[] = []
      for (const state of states) {
        const word = byName.get(state.word)
        if (word) words.push(word)
      }
      setDueWords(words)
    }

    load()
    return () => {
      cancelled = true
    }
    // 复习会话结束时重算一次，否则刚复习完的词还挂在计数里。
    // typingBaseline 只用于补历史时的初值，不该因为它变化就重算整个队列
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordList, currentDictId, isReviewMode])

  const startReview = useCallback(() => {
    if (dueWords.length === 0) return

    setCurrentDictId(currentDictId)
    // 复习会话不属于任何章节，成绩不该记进某一章
    setCurrentChapter(-1)
    setReviewModeInfo({
      isReviewMode: true,
      reviewRecord: new ReviewRecord(currentDictId, dueWords.slice(0, MAX_REVIEW_SESSION_WORDS)),
    })
  }, [dueWords, currentDictId, setCurrentDictId, setCurrentChapter, setReviewModeInfo])

  return { dueCount: dueWords.length, startReview }
}
