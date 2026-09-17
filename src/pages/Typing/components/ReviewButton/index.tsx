import Tooltip from '@/components/Tooltip'
import { useDueReview } from '@/pages/Typing/hooks/useDueReview'
import { isReviewModeAtom } from '@/store'
import { useAtomValue } from 'jotai'
import IconRepeat from '~icons/tabler/repeat'

/**
 * 「今日待复习 N」。没有到期单词时整个按钮消失 —— 常驻一个 0 只会变成背景噪声，
 * 有数字时才出现反而让它有提示作用。
 */
export default function ReviewButton() {
  const { dueCount, startReview } = useDueReview()
  const isReviewMode = useAtomValue(isReviewModeAtom)

  if (isReviewMode || dueCount === 0) return null

  return (
    <Tooltip content="按间隔重复算法排出来的、今天该复习的单词">
      <button
        type="button"
        onClick={startReview}
        className="dark:bg-amber-400/15 flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-2 text-[13px] font-semibold text-amber-700 transition-colors hover:bg-amber-200 focus:outline-none dark:text-amber-300 dark:hover:bg-amber-400/25"
      >
        <IconRepeat className="text-[15px]" />
        {`今日待复习 ${dueCount}`}
      </button>
    </Tooltip>
  )
}
