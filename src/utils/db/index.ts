import type { IChapterRecord, IReviewRecord, IRevisionDictRecord, IWordRecord, IWordReviewState, LetterMistakes } from './record'
import { ChapterRecord, ReviewRecord, WordRecord } from './record'
import { updateReviewStateAfterAttempt } from './review-state'
import { TypingContext, TypingStateActionType } from '@/pages/Typing/store'
import type { TypingState } from '@/pages/Typing/store/type'
import { currentChapterAtom, currentDictIdAtom, dailyReviewProgressAtom, isReviewModeAtom, typingBaselineAtom } from '@/store'
import type { Table } from 'dexie'
import Dexie from 'dexie'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useContext } from 'react'

class RecordDB extends Dexie {
  wordRecords!: Table<IWordRecord, number>
  chapterRecords!: Table<IChapterRecord, number>
  reviewRecords!: Table<IReviewRecord, number>

  revisionDictRecords!: Table<IRevisionDictRecord, number>
  revisionWordRecords!: Table<IWordRecord, number>

  wordReviewStates!: Table<IWordReviewState, number>

  constructor() {
    super('RecordDB')
    this.version(1).stores({
      wordRecords: '++id,word,timeStamp,dict,chapter,errorCount,[dict+chapter]',
      chapterRecords: '++id,timeStamp,dict,chapter,time,[dict+chapter]',
    })
    this.version(2).stores({
      wordRecords: '++id,word,timeStamp,dict,chapter,wrongCount,[dict+chapter]',
      chapterRecords: '++id,timeStamp,dict,chapter,time,[dict+chapter]',
    })
    this.version(3).stores({
      wordRecords: '++id,word,timeStamp,dict,chapter,wrongCount,[dict+chapter]',
      chapterRecords: '++id,timeStamp,dict,chapter,time,[dict+chapter]',
      reviewRecords: '++id,dict,createTime,isFinished',
    })
    // word 上的唯一索引让「按单词 upsert 复习状态」可以一次查到，不用先扫再写
    this.version(4).stores({
      wordRecords: '++id,word,timeStamp,dict,chapter,wrongCount,[dict+chapter]',
      chapterRecords: '++id,timeStamp,dict,chapter,time,[dict+chapter]',
      reviewRecords: '++id,dict,createTime,isFinished',
      wordReviewStates: '++id,&word,dueTimestamp',
    })
  }
}

export const db = new RecordDB()

/** 打字基线的指数滑动平均系数。越大越跟手，越小越稳 */
const BASELINE_SMOOTHING = 0.1

/** 本地日期，用来判断当日复习额度是否该归零。不能用 UTC，否则跨天的时点和用户的直觉对不上 */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

db.wordRecords.mapToClass(WordRecord)
db.chapterRecords.mapToClass(ChapterRecord)
db.reviewRecords.mapToClass(ReviewRecord)

export function useSaveChapterRecord() {
  const currentChapter = useAtomValue(currentChapterAtom)
  const isRevision = useAtomValue(isReviewModeAtom)
  const dictID = useAtomValue(currentDictIdAtom)

  const saveChapterRecord = useCallback(
    (typingState: TypingState) => {
      const {
        chapterData: { correctCount, wrongCount, userInputLogs, wordCount, words, wordRecordIds },
        timerData: { time },
      } = typingState
      const correctWordIndexes = userInputLogs.filter((log) => log.correctCount > 0 && log.wrongCount === 0).map((log) => log.index)

      const chapterRecord = new ChapterRecord(
        dictID,
        isRevision ? -1 : currentChapter,
        time,
        correctCount,
        wrongCount,
        wordCount,
        correctWordIndexes,
        words.length,
        wordRecordIds ?? [],
      )
      db.chapterRecords.add(chapterRecord)
    },
    [currentChapter, dictID, isRevision],
  )

  return saveChapterRecord
}

export type WordKeyLogger = {
  letterTimeArray: number[]
  letterMistake: LetterMistakes
}

export function useSaveWordRecord() {
  const isRevision = useAtomValue(isReviewModeAtom)
  const currentChapter = useAtomValue(currentChapterAtom)
  const dictID = useAtomValue(currentDictIdAtom)

  const { dispatch } = useContext(TypingContext) ?? {}
  const [typingBaseline, setTypingBaseline] = useAtom(typingBaselineAtom)
  const setDailyReviewProgress = useSetAtom(dailyReviewProgressAtom)

  const saveWordRecord = useCallback(
    async ({
      word,
      wrongCount,
      letterTimeArray,
      letterMistake,
      timeToFirstKey,
    }: {
      word: string
      wrongCount: number
      letterTimeArray: number[]
      letterMistake: LetterMistakes
      timeToFirstKey?: number
    }) => {
      const timing = []
      for (let i = 1; i < letterTimeArray.length; i++) {
        const diff = letterTimeArray[i] - letterTimeArray[i - 1]
        timing.push(diff)
      }

      const wordRecord = new WordRecord(word, dictID, isRevision ? -1 : currentChapter, timing, wrongCount, letterMistake, timeToFirstKey)

      let dbID = -1
      try {
        dbID = await db.wordRecords.add(wordRecord)
      } catch (e) {
        console.error(e)
      }

      const averageKeyInterval = timing.length > 0 ? timing.reduce((sum, value) => sum + value, 0) / timing.length : 0

      // 每练完一个词就推进它的间隔重复安排，正常章节练习同样算数 ——
      // 在第 3 章敲对了 analyse 就是一次成功检索，没有理由还让它当天到期
      updateReviewStateAfterAttempt({ word, wrongCount, averageKeyInterval, baselineInterval: typingBaseline })

      // 复习会话里练的词才计入当日额度。正常章节练习是学新词，不该占还债的名额
      if (isRevision) {
        const today = localDateKey()
        setDailyReviewProgress((prev) => (prev.date === today ? { date: today, count: prev.count + 1 } : { date: today, count: 1 }))
      }

      // 个人打字基线用指数滑动平均：跟得上用户变快，又不会被某一次卡顿带偏。
      // 只取拼对的样本，拼错的词间隔里混着回退和犹豫，不能代表正常手速
      if (wrongCount === 0 && averageKeyInterval > 0) {
        setTypingBaseline((prev) =>
          prev > 0 ? prev * (1 - BASELINE_SMOOTHING) + averageKeyInterval * BASELINE_SMOOTHING : averageKeyInterval,
        )
      }

      if (dispatch) {
        dbID > 0 && dispatch({ type: TypingStateActionType.ADD_WORD_RECORD_ID, payload: dbID })
        dispatch({ type: TypingStateActionType.SET_IS_SAVING_RECORD, payload: false })
      }
    },
    [currentChapter, dictID, dispatch, isRevision, typingBaseline, setTypingBaseline, setDailyReviewProgress],
  )

  return saveWordRecord
}

export function useDeleteWordRecord() {
  const deleteWordRecord = useCallback(async (word: string, dict: string) => {
    try {
      const deletedCount = await db.wordRecords.where({ word, dict }).delete()
      return deletedCount
    } catch (error) {
      console.error(`删除单词记录时出错：`, error)
    }
  }, [])

  return { deleteWordRecord }
}
