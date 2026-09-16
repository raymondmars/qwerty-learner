import type { WordUpdateAction } from '../InputHandler'
import InputHandler from '../InputHandler'
import Letter from './Letter'
import { TipAlert } from './TipAlert'
import { initialWordState } from './type'
import type { WordState } from './type'
import Tooltip from '@/components/Tooltip'
import type { WordPronunciationIconRef } from '@/components/WordPronunciationIcon'
import { WordPronunciationIcon } from '@/components/WordPronunciationIcon'
import { EXPLICIT_SPACE } from '@/constants'
import useKeySounds from '@/hooks/useKeySounds'
import { useWordConfetti } from '@/pages/Typing/hooks/useConfetti'
import { TypingContext, TypingStateActionType } from '@/pages/Typing/store'
import {
  currentChapterAtom,
  currentDictInfoAtom,
  fontSizeConfigAtom,
  isEnterToNextWordAtom,
  isIgnoreCaseAtom,
  isShowAnswerOnHoverAtom,
  isTextSelectableAtom,
  isWordMistakenAtom,
  isWordWaitingEnterAtom,
  pronunciationIsOpenAtom,
  wordDictationConfigAtom,
} from '@/store'
import type { Word } from '@/typings'
import { CTRL, getUtcString } from '@/utils'
import { useSaveWordRecord } from '@/utils/db'
import { useAtomValue, useSetAtom } from 'jotai'
import type { CSSProperties } from 'react'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useImmer } from 'use-immer'

const vowelLetters = ['A', 'E', 'I', 'O', 'U']
// 拼写完成、等待按 Enter 时单词放大的像素值
const FINISHED_FONT_SIZE_OFFSET = 4

export default function WordComponent({ word, onFinish }: { word: Word; onFinish: () => void }) {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!
  const [wordState, setWordState] = useImmer<WordState>(structuredClone(initialWordState))

  const wordDictationConfig = useAtomValue(wordDictationConfigAtom)
  const isTextSelectable = useAtomValue(isTextSelectableAtom)
  const isIgnoreCase = useAtomValue(isIgnoreCaseAtom)
  const isShowAnswerOnHover = useAtomValue(isShowAnswerOnHoverAtom)
  const isEnterToNextWord = useAtomValue(isEnterToNextWordAtom)
  const saveWordRecord = useSaveWordRecord()
  const [playKeySound, playBeepSound, playHintSound] = useKeySounds()
  const pronunciationIsOpen = useAtomValue(pronunciationIsOpenAtom)
  const [isHoveringWord, setIsHoveringWord] = useState(false)
  const currentLanguageCategory = useAtomValue(currentDictInfoAtom).languageCategory
  const currentChapter = useAtomValue(currentChapterAtom)
  const fontSizeConfig = useAtomValue(fontSizeConfigAtom)

  const [showTipAlert, setShowTipAlert] = useState(false)
  const wordPronunciationIconRef = useRef<WordPronunciationIconRef>(null)

  const isWaitingForEnter = isEnterToNextWord && wordState.isFinished
  // 以最终结果判定全对：中途输错但退格改正的，同样算全对。决定字母是否变绿、单词是否放大
  const isWordAllCorrect = wordState.isFinished && wordState.letterStates.every((letterState) => letterState === 'correct')
  const setIsWordWaitingEnter = useSetAtom(isWordWaitingEnterAtom)
  const setIsWordMistaken = useSetAtom(isWordMistakenAtom)

  // 彩带跟着「拼写全对」走，不依赖 Enter 继续的设置，关掉该设置时也照样庆祝
  useWordConfetti(wordState.isFinished && isWordAllCorrect)

  // 设置里的字号作为基准，按视口放大：默认 48px 时得到设计稿的 clamp(57.6px, 11.5vw, 168px)
  const letterFontSize = useMemo(() => {
    const base = fontSizeConfig.foreignFont + (isWaitingForEnter && isWordAllCorrect ? FINISHED_FONT_SIZE_OFFSET : 0)
    return `clamp(${(base * 1.2).toFixed(1)}px, 11.5vw, ${(base * 3.5).toFixed(1)}px)`
  }, [fontSizeConfig.foreignFont, isWaitingForEnter, isWordAllCorrect])

  useEffect(() => {
    setIsWordWaitingEnter(isWaitingForEnter)
    setIsWordMistaken(isWaitingForEnter && !isWordAllCorrect)

    return () => {
      setIsWordWaitingEnter(false)
      setIsWordMistaken(false)
    }
  }, [isWaitingForEnter, isWordAllCorrect, setIsWordWaitingEnter, setIsWordMistaken])

  useEffect(() => {
    // run only when word changes
    let headword = ''
    try {
      headword = word.name.replace(new RegExp(' ', 'g'), EXPLICIT_SPACE)
      headword = headword.replace(new RegExp('…', 'g'), '..')
    } catch (e) {
      console.error('word.name is not a string', word)
      headword = ''
    }

    const newWordState = structuredClone(initialWordState)
    newWordState.displayWord = headword
    newWordState.letterStates = new Array(headword.length).fill('normal')
    newWordState.startTime = getUtcString()
    newWordState.randomLetterVisible = headword.split('').map(() => Math.random() > 0.4)
    setWordState(newWordState)
  }, [word, setWordState])

  const updateInput = useCallback(
    (updateAction: WordUpdateAction) => {
      // 单词已拼写完成时锁定输入，等待用户按 Enter 进入下一个单词
      if (wordState.isFinished) return

      switch (updateAction.type) {
        case 'add':
          if (updateAction.value === ' ') {
            updateAction.event.preventDefault()
            setWordState((state) => {
              state.inputWord = state.inputWord + EXPLICIT_SPACE
            })
          } else {
            setWordState((state) => {
              state.inputWord = state.inputWord + updateAction.value
            })
          }
          break

        case 'delete':
          setWordState((state) => {
            const deleteLength = Math.min(updateAction.length, state.inputWord.length)
            if (deleteLength <= 0) return

            for (let i = 1; i <= deleteLength; i++) {
              const index = state.inputWord.length - i
              // letterTimeArray 只在输入正确时 push，删除正确字母时要一并弹出，保持与已输入内容对齐
              if (state.letterStates[index] === 'correct') {
                state.letterTimeArray.pop()
              }
              state.letterStates[index] = 'normal'
            }
            state.inputWord = state.inputWord.slice(0, state.inputWord.length - deleteLength)
          })
          break

        default:
          console.warn('unknown update type', updateAction)
      }
    },
    [wordState.isFinished, setWordState],
  )

  const handleHoverWord = useCallback((checked: boolean) => {
    setIsHoveringWord(checked)
  }, [])

  useHotkeys(
    'tab',
    () => {
      handleHoverWord(true)
    },
    { enableOnFormTags: true, preventDefault: true },
    [],
  )

  useHotkeys(
    'tab',
    () => {
      handleHoverWord(false)
    },
    { enableOnFormTags: true, keyup: true, preventDefault: true },
    [],
  )
  useHotkeys(
    'ctrl+j',
    () => {
      if (state.isTyping) {
        wordPronunciationIconRef.current?.play()
      }
    },
    [state.isTyping],
    { enableOnFormTags: true, preventDefault: true },
  )

  useEffect(() => {
    if (wordState.inputWord.length === 0 && state.isTyping) {
      wordPronunciationIconRef.current?.play && wordPronunciationIconRef.current?.play()
    }
  }, [state.isTyping, wordState.inputWord.length, wordPronunciationIconRef.current?.play])

  const getLetterVisible = useCallback(
    (index: number) => {
      // 已判定过的字母（对或错）都要显示，否则默写模式下拼错了看不到任何反馈
      if (wordState.letterStates[index] !== 'normal' || (isShowAnswerOnHover && isHoveringWord)) return true

      if (wordDictationConfig.isOpen) {
        if (wordDictationConfig.type === 'hideAll') return false

        const letter = wordState.displayWord[index]
        if (wordDictationConfig.type === 'hideVowel') {
          return vowelLetters.includes(letter.toUpperCase()) ? false : true
        }
        if (wordDictationConfig.type === 'hideConsonant') {
          return vowelLetters.includes(letter.toUpperCase()) ? true : false
        }
        if (wordDictationConfig.type === 'randomHide') {
          return wordState.randomLetterVisible[index]
        }
      }
      return true
    },
    [
      isHoveringWord,
      isShowAnswerOnHover,
      wordDictationConfig.isOpen,
      wordDictationConfig.type,
      wordState.displayWord,
      wordState.letterStates,
      wordState.randomLetterVisible,
    ],
  )

  useEffect(() => {
    const inputLength = wordState.inputWord.length
    if (inputLength === 0 || wordState.displayWord.length === 0) {
      return
    }

    // 退格会让 inputWord 缩短并再次触发本 effect，此时末位是已经判定过的字符，不能重复计数
    if (wordState.letterStates[inputLength - 1] !== 'normal') {
      return
    }

    const inputChar = wordState.inputWord[inputLength - 1]
    const correctChar = wordState.displayWord[inputLength - 1]
    let isEqual = false
    if (inputChar != undefined && correctChar != undefined) {
      isEqual = isIgnoreCase ? inputChar.toLowerCase() === correctChar.toLowerCase() : inputChar === correctChar
    }

    // 拼错不再回退，标红后继续往下拼，拼满长度即完成
    const isLastLetter = inputLength >= wordState.displayWord.length
    const letterMistake = isEqual
      ? wordState.letterMistake
      : { ...wordState.letterMistake, [inputLength - 1]: [...(wordState.letterMistake[inputLength - 1] ?? []), inputChar] }

    setWordState((state) => {
      state.letterStates[inputLength - 1] = isEqual ? 'correct' : 'wrong'

      if (isEqual) {
        state.letterTimeArray.push(Date.now())
        state.correctCount += 1
      } else {
        state.hasMadeInputWrong = true
        state.wrongCount += 1
        state.letterMistake = letterMistake
      }

      if (isLastLetter) {
        state.isFinished = true
        state.endTime = getUtcString()
      }
    })

    if (isEqual) {
      dispatch({ type: TypingStateActionType.REPORT_CORRECT_WORD })
    } else {
      playBeepSound()
      dispatch({ type: TypingStateActionType.REPORT_WRONG_WORD, payload: { letterMistake } })

      // 第一章第一个词就反复输错，多半是浏览器插件抢按键，提示用户排查
      if (currentChapter === 0 && state.chapterData.index === 0 && wordState.wrongCount >= 3) {
        setShowTipAlert(true)
      }
    }

    // 完成音是正反馈，本次拼写出现过错误时不播，避免和错误提示混淆
    if (isLastLetter && isEqual && !wordState.hasMadeInputWrong) {
      playHintSound()
    } else if (isEqual) {
      playKeySound()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordState.inputWord])

  useEffect(() => {
    if (wordState.isFinished) {
      dispatch({ type: TypingStateActionType.SET_IS_SAVING_RECORD, payload: true })

      saveWordRecord({
        word: word.name,
        wrongCount: wordState.wrongCount,
        letterTimeArray: wordState.letterTimeArray,
        letterMistake: wordState.letterMistake,
      })

      // 开启 Enter 继续时，停留在当前单词，由下方的快捷键触发 onFinish
      if (!isEnterToNextWord) {
        onFinish()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordState.isFinished])

  useHotkeys(
    'enter',
    () => {
      // 暂停时 Enter 用来恢复练习，不能穿透到这里把单词翻过去
      if (!state.isTyping) return

      if (wordState.isFinished) {
        onFinish()
      }
    },
    { enableOnFormTags: true, preventDefault: true },
    [state.isTyping, wordState.isFinished, onFinish],
  )

  return (
    <>
      <InputHandler updateInput={updateInput} />
      <div lang={currentLanguageCategory} className="flex flex-col items-center justify-center pb-1 pt-4">
        <div
          className={`tooltip-info relative w-fit bg-transparent p-0 leading-normal shadow-none dark:bg-transparent ${
            // 关闭「显示答案」时 Tab 也不再生效，此时不能再提示用户按 Tab
            wordDictationConfig.isOpen && isShowAnswerOnHover ? 'tooltip' : ''
          }`}
          data-tip="按 Tab 快捷键显示完整单词"
        >
          {/* 单词背后的柔光，让大字号不会孤零零地浮在背景上 */}
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 h-[32.5rem] w-[32.5rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, var(--word-glow) 0%, transparent 65%)', filter: 'blur(10px)' }}
          />
          {/* 全对时扩散一圈光晕，只在挂载时播一次 */}
          {isWordAllCorrect && (
            <span
              className="animate-ring-pulse pointer-events-none absolute left-1/2 top-1/2 h-[22.5rem] w-[22.5rem] max-w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ borderColor: 'var(--typing-accent)' }}
            />
          )}
          <div
            onMouseEnter={() => handleHoverWord(true)}
            onMouseLeave={() => handleHoverWord(false)}
            className={`relative z-10 flex items-center ${isTextSelectable && 'select-all'} justify-center`}
            // 光标色条挂在字母下方 0.155em 处，下内边距跟着字号一起缩放才不会压到音标行
            style={{ '--letter-size': letterFontSize, paddingBottom: 'calc(var(--letter-size) * 0.2)' } as CSSProperties}
          >
            {wordState.displayWord.split('').map((t, index) => {
              // 拼错时显示用户实际敲下的字符，显示正确答案会让默写模式泄题
              const letterState = wordState.letterStates[index]
              const displayLetter = letterState === 'wrong' ? wordState.inputWord[index] ?? t : t

              return (
                <Letter
                  key={`${index}-${t}`}
                  letter={displayLetter}
                  visible={getLetterVisible(index)}
                  state={letterState}
                  // 变绿只留给全对的情况
                  highlightCorrect={isWordAllCorrect}
                  isCursor={!wordState.isFinished && index === wordState.inputWord.length}
                  inProgress
                />
              )
            })}
          </div>
          {pronunciationIsOpen && (
            <div className="absolute -right-12 top-1/2 z-10 h-9 w-9 -translate-y-1/2 transform ">
              <Tooltip content={`快捷键${CTRL} + J`}>
                <WordPronunciationIcon word={word} ref={wordPronunciationIconRef} className="h-full w-full" />
              </Tooltip>
            </div>
          )}
        </div>
        {isWaitingForEnter && (
          <div
            className={`animate-float-in mt-9 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${
              isWordAllCorrect
                ? 'dark:bg-green-400/15 bg-green-50 text-green-700 dark:text-green-300'
                : 'dark:bg-amber-400/15 bg-amber-50 text-amber-700 dark:text-amber-300'
            }`}
          >
            {isWordAllCorrect ? '✓ 拼写正确' : '拼写有误'}
          </div>
        )}
      </div>
      <TipAlert className="fixed bottom-10 right-3" show={showTipAlert} setShow={setShowTipAlert} />
    </>
  )
}
