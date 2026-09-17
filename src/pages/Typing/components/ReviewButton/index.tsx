import Tooltip from '@/components/Tooltip'
import { useDueReview } from '@/pages/Typing/hooks/useDueReview'
import { isReviewModeAtom } from '@/store'
import { useAtomValue } from 'jotai'
import IconCheck from '~icons/tabler/check'
import IconRepeat from '~icons/tabler/repeat'

/**
 * 「今日待复习 N」。
 *
 * 显示的 N 是当日额度内真正要做的量，不是到期总数 —— 停练一周再回来可能积压上千个词，
 * 把那个数字摆出来只会让人不想开始。真实积压放在悬浮提示里，想看的人看得到。
 *
 * 没有到期单词时整个按钮消失：常驻一个 0 只会变成背景噪声，有数字时才出现反而有提示作用。
 */
export default function ReviewButton() {
  const { dueCount, reviewableCount, isDailyGoalDone, startReview } = useDueReview()
  const isReviewMode = useAtomValue(isReviewModeAtom)

  if (isReviewMode || dueCount === 0) return null

  // 额度用完但还有积压：给个完成态，而不是让按钮凭空消失让人以为出了 bug
  if (isDailyGoalDone) {
    return (
      <Tooltip content={`今天的复习额度已用完，还有 ${dueCount} 个词到期，明天继续`}>
        <span className="flex cursor-default items-center gap-1.5 rounded-full bg-green-50 px-3.5 py-2 text-[13px] font-semibold text-green-700 dark:bg-green-400/10 dark:text-green-300">
          <IconCheck className="text-[15px]" />
          今日复习已完成
        </span>
      </Tooltip>
    )
  }

  return (
    <Tooltip
      content={
        dueCount > reviewableCount ? `共 ${dueCount} 个词到期，今天先练 ${reviewableCount} 个` : '按间隔重复算法排出来的、今天该复习的单词'
      }
    >
      <button
        type="button"
        onClick={startReview}
        className="dark:bg-amber-400/15 flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-2 text-[13px] font-semibold text-amber-700 transition-colors hover:bg-amber-200 focus:outline-none dark:text-amber-300 dark:hover:bg-amber-400/25"
      >
        <IconRepeat className="text-[15px]" />
        {`今日待复习 ${reviewableCount}`}
      </button>
    </Tooltip>
  )
}
