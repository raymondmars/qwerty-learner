import type { ChapterProgress } from '@/store'
import { chapterProgressAtom, currentDictIdAtom } from '@/store'
import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useMemo } from 'react'

function isValidProgress(value: unknown): value is ChapterProgress {
  if (typeof value !== 'object' || value === null) return false

  const { chapter, index } = value as Partial<ChapterProgress>
  return Number.isInteger(chapter) && (chapter as number) >= 0 && Number.isInteger(index) && (index as number) >= 0
}

/**
 * 记录并恢复当前词典的练习进度。
 * 数据存在 localStorage 中，可能被外部修改，所以读取时需要校验。
 */
export function useChapterProgress() {
  const [progressMap, setProgressMap] = useAtom(chapterProgressAtom)
  const currentDictId = useAtomValue(currentDictIdAtom)

  const savedProgress = useMemo(() => {
    const progress = progressMap?.[currentDictId]
    return isValidProgress(progress) ? progress : null
  }, [progressMap, currentDictId])

  const saveProgress = useCallback(
    (chapter: number, index: number) => {
      setProgressMap((old) => ({ ...old, [currentDictId]: { chapter, index } }))
    },
    [currentDictId, setProgressMap],
  )

  const clearProgress = useCallback(() => {
    setProgressMap((old) => {
      if (typeof old !== 'object' || old === null || !(currentDictId in old)) return old

      const newProgressMap = { ...old }
      delete newProgressMap[currentDictId]
      return newProgressMap
    })
  }, [currentDictId, setProgressMap])

  return { savedProgress, saveProgress, clearProgress }
}
