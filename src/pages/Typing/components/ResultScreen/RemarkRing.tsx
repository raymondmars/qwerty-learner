import clamp from '@/utils/clamp'
import classNames from 'classnames'
import { useMemo } from 'react'

export type RemarkRingProps = {
  remark: string
  caption: string
  /**
   * `null` if the percentage is not appliable.
   * Otherwise, this is an integer between 0 and 100.
   */
  percentage?: number | null
  /**
   * Default to 7 rem.
   */
  size?: number
  /** 与历史最好成绩的对比，如「破纪录」「最好 42」 */
  hint?: string
  /** 破纪录时高亮，落后时用中性色，避免变成负反馈 */
  hintHighlight?: boolean
}

const rootFontSize = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('font-size'))

export default function RemarkRing({ remark, caption, percentage = null, size = 7, hint, hintHighlight = false }: RemarkRingProps) {
  const clipPath = useMemo((): string | undefined => {
    if (percentage === null) {
      return undefined
    }
    const clamped = clamp(percentage, 0, 100)
    if (clamped === 100) {
      return undefined
    }
    const alpha = Math.PI * 2 * (clamped / 100)
    const r = (rootFontSize * size) / 2
    const path = `M ${r},0 A ${r},${r} 0 ${clamped > 50 ? 1 : 0},1 ${r + Math.sin(alpha) * r},${r + -Math.cos(alpha) * r} L ${r},${r} Z`
    return `path("${path}")`
  }, [percentage, size])
  return (
    <div
      className={classNames(
        'relative flex flex-shrink-0 flex-col items-center justify-center rounded-full border-8 border-indigo-200 bg-transparent dark:border-gray-700',
      )}
      style={{
        width: `${size}rem`,
        height: `${size}rem`,
      }}
    >
      {percentage !== null && (
        <div
          className="absolute -inset-2 rounded-full border-8 border-indigo-400 bg-transparent dark:border-indigo-500"
          style={{ clipPath }}
          aria-hidden
        />
      )}
      <span className="text-xl tabular-nums text-gray-800 dark:text-gray-300">{remark}</span>
      <span className="text-sm font-medium text-gray-600 dark:text-gray-500">{caption}</span>
      {hint && (
        <span
          className={`mt-0.5 text-xs tabular-nums ${
            hintHighlight ? 'font-medium text-indigo-500 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {hint}
        </span>
      )}
    </div>
  )
}
