import type { ReviewRecord } from '@/utils/db/record'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

type TReviewInfoAtomData = {
  isReviewMode: boolean
  reviewRecord: ReviewRecord | undefined
}

export function reviewInfoAtom(initialValue: TReviewInfoAtomData) {
  const storageAtom = atomWithStorage('reviewModeInfo', initialValue)

  return atom(
    (get) => {
      return get(storageAtom)
    },
    (get, set, updater: TReviewInfoAtomData | ((oldValue: TReviewInfoAtomData) => TReviewInfoAtomData)) => {
      // 复习会话只活在 localStorage 里：队列由「今日待复习」按到期状态即时生成，
      // 不需要另外落一份 reviewRecords。中断后刷新会恢复，到期状态本身也还在
      set(storageAtom, typeof updater === 'function' ? updater(get(storageAtom)) : updater)
    },
  )
}
