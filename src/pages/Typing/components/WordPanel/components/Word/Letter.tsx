import { EXPLICIT_SPACE } from '@/constants'
import { fontSizeConfigAtom } from '@/store'
import { useAtomValue } from 'jotai'
import React from 'react'

export type LetterState = 'normal' | 'correct' | 'wrong'

export type LetterProps = {
  letter: string
  state?: LetterState
  visible?: boolean
  // 拼写过程中输对的字母保持常规色，整词全对后才统一变绿
  highlightCorrect?: boolean
  // 正在拼写的单词：字母加粗放大、未输入的淡出、当前位置给光标色条。
  // 错题本等静态展示单词的地方保持常规字重和字号，不走这套处理
  inProgress?: boolean
  // 当前待输入的位置
  isCursor?: boolean
}

const Letter: React.FC<LetterProps> = ({
  letter,
  state = 'normal',
  visible = true,
  highlightCorrect = true,
  inProgress = false,
  isCursor = false,
}) => {
  const fontSizeConfig = useAtomValue(fontSizeConfigAtom)

  const isTyped = state !== 'normal'
  const isAllCorrect = state === 'correct' && highlightCorrect

  let color = 'var(--letter-untyped)'
  let textShadow = 'none'
  if (state === 'wrong') {
    color = 'var(--letter-wrong)'
    textShadow = 'var(--letter-typed-shadow)'
  } else if (isAllCorrect) {
    color = 'var(--letter-correct)'
    textShadow = 'var(--letter-correct-shadow)'
  } else if (isTyped) {
    color = 'var(--letter-typed)'
    textShadow = 'var(--letter-typed-shadow)'
  }

  // 未输入的字母淡出，当前字母稍亮一些指示位置；␣ 占位符整体再压暗，不和字母抢视线
  let opacity = inProgress && !isTyped ? (isCursor ? 0.34 : 0.14) : 1
  if (letter === EXPLICIT_SPACE) opacity *= 0.55

  // 已输入的字母上浮，整词全对后统一落回基线，让绿色一次性对齐
  const lift = inProgress && isTyped && !isAllCorrect && state !== 'wrong' ? 'translateY(-4px)' : 'none'

  return (
    <span
      className={`relative m-0 inline-block font-mono leading-none ${inProgress ? 'font-extrabold' : 'font-normal'}`}
      style={{
        // 打字页在容器上定义 --letter-size 做响应式放大，其余地方沿用设置里的字号
        fontSize: `var(--letter-size, ${fontSizeConfig.foreignFont}px)`,
        letterSpacing: '-0.01em',
        padding: '0 0.045em',
        color,
        opacity,
        transform: lift,
        textShadow,
        transition: 'color .14s ease, opacity .22s ease, transform .22s cubic-bezier(.2,.9,.2,1)',
      }}
    >
      {visible ? letter : '_'}
      {inProgress && (
        <span
          className="pointer-events-none absolute left-[14%] right-[14%] rounded-full"
          style={{
            bottom: '-0.1em',
            height: '0.055em',
            background: isCursor ? 'var(--typing-accent)' : isAllCorrect ? 'oklch(0.72 0.16 152 / 0.45)' : 'transparent',
            animation: isCursor ? 'cursor-bar 1s ease-in-out infinite' : undefined,
            transition: 'background .18s ease',
          }}
        />
      )}
    </span>
  )
}

export default React.memo(Letter)
