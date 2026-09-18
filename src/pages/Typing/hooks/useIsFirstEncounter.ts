import { db } from '@/utils/db'
import { useEffect, useState } from 'react'

/**
 * 这个词以前练过没有。用来区分「学习试次」和「测试试次」——
 * 首次遇到的词需要先听到读音才拼得出来，练过的词则应该自己从中文回忆出形和音，
 * 提前把读音送到耳边会把回忆降级成听写。
 *
 * 必须在单词挂载时查一次并锁住结果：拼完之后 useSaveWordRecord 会写入一条新的
 * WordRecord，那之后再查就永远是「练过」了。
 *
 * 查询失败时返回 true，退回到「每个词都在开头播放」的旧行为 —— 宁可少一层优化，
 * 也不要让新词变得完全无从下手。
 */
export function useIsFirstEncounter(word: string): boolean | undefined {
  const [isFirstEncounter, setIsFirstEncounter] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setIsFirstEncounter(undefined)

    if (!word) return

    // 同一个词在不同词库里大小写可能不一致（August / august），按忽略大小写查
    db.wordRecords
      .where('word')
      .equalsIgnoreCase(word)
      .count()
      .then((count) => {
        if (!cancelled) setIsFirstEncounter(count === 0)
      })
      .catch(() => {
        if (!cancelled) setIsFirstEncounter(true)
      })

    return () => {
      cancelled = true
    }
  }, [word])

  return isFirstEncounter
}
