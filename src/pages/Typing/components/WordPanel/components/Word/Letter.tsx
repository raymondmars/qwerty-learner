import { EXPLICIT_SPACE } from '@/constants'
import { fontSizeConfigAtom } from '@/store'
import { useAtomValue } from 'jotai'
import React from 'react'

export type LetterState = 'normal' | 'correct' | 'wrong'

const stateClassNameMap: Record<string, Record<LetterState, string>> = {
  true: {
    normal: 'text-gray-400',
    correct: 'text-green-400 dark:text-green-700',
    wrong: 'text-red-400 dark:text-red-600',
  },
  false: {
    normal: 'text-gray-600 dark:text-gray-50',
    correct: 'text-green-600 dark:text-green-400',
    wrong: 'text-red-600 dark:text-red-400',
  },
}

export type LetterProps = {
  letter: string
  state?: LetterState
  visible?: boolean
  // 在设置的字号基础上增加的像素值
  fontSizeOffset?: number
  bold?: boolean
  // 拼写过程中输对的字母保持常规色，整词全对后才统一变绿
  highlightCorrect?: boolean
}

const Letter: React.FC<LetterProps> = ({
  letter,
  state = 'normal',
  visible = true,
  fontSizeOffset = 0,
  bold = false,
  highlightCorrect = true,
}) => {
  const fontSizeConfig = useAtomValue(fontSizeConfigAtom)
  // 未整词全对时，已输对的字母沿用 normal 的深色，不提前变绿
  const displayState: LetterState = state === 'correct' && !highlightCorrect ? 'normal' : state

  return (
    <span
      className={`m-0 p-0 font-mono ${bold ? 'font-bold' : 'font-normal'} ${
        stateClassNameMap[(letter === EXPLICIT_SPACE) as unknown as string][displayState]
      } pr-0.8 duration-0 dark:text-opacity-80`}
      style={{ fontSize: (fontSizeConfig.foreignFont + fontSizeOffset).toString() + 'px' }}
    >
      {visible ? letter : '_'}
    </span>
  )
}

export default React.memo(Letter)
