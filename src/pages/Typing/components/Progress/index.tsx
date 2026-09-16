import { TypingContext } from '../../store'
import { useContext } from 'react'

/** 贴在视口顶端的章节进度条 */
export default function Progress() {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state } = useContext(TypingContext)!
  const total = state.chapterData.words.length
  const progress = total ? Math.floor((state.chapterData.index / total) * 100) : 0

  return (
    <div className="fixed left-0 right-0 top-0 z-50 h-[3px] bg-gray-200 dark:bg-white/10">
      <div
        className="h-full transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%`, background: 'linear-gradient(90deg, oklch(0.62 0.17 288), oklch(0.68 0.14 200))' }}
      />
    </div>
  )
}
