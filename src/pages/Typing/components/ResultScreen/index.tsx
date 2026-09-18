import { TypingContext, TypingStateActionType } from '../../store'
import ShareButton from '../ShareButton'
import ConclusionBar from './ConclusionBar'
import RemarkRing from './RemarkRing'
import WordChip from './WordChip'
import Tooltip from '@/components/Tooltip'
import { usePersonalBest } from '@/pages/Typing/hooks/usePersonalBest'
import {
  currentChapterAtom,
  currentDictInfoAtom,
  isChapterRetestOpenAtom,
  isReviewModeAtom,
  randomConfigAtom,
  reviewModeInfoAtom,
} from '@/store'
import { Transition } from '@headlessui/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useContext, useEffect, useMemo } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useNavigate } from 'react-router-dom'
import IexportWords from '~icons/icon-park-outline/excel'
import IconGithub from '~icons/simple-icons/github'
import IconX from '~icons/tabler/x'

/**
 * 判定「拼对了但拼得犹豫」的阈值。
 *
 * 检索延迟比正确率更早暴露记忆薄弱：一个词拼对了，但每个字母之间明显比平时慢，
 * 说明是硬想出来的而不是自动化提取的，下次多半就想不起来了。
 *
 * 基准取本章的中位数而不是绝对毫秒，这样自动适配每个人的打字速度；同时压一条绝对
 * 下限，避免用户整章都打得飞快时，仅仅因为「比中位数慢 60%」就把一堆其实很熟的词
 * 拉进重测。
 */
const SLOW_RATIO_TO_MEDIAN = 1.6
const SLOW_FLOOR_MS = 300

/** 章节练完到自动进入重测之间的停顿，留出时间看一眼成绩，也避免界面一闪而过 */
const RETEST_DELAY_MS = 1400

const median = (values: number[]) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

const ResultScreen = () => {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!

  const currentDictInfo = useAtomValue(currentDictInfoAtom)
  const [currentChapter, setCurrentChapter] = useAtom(currentChapterAtom)
  const randomConfig = useAtomValue(randomConfigAtom)
  const navigate = useNavigate()

  const setReviewModeInfo = useSetAtom(reviewModeInfoAtom)
  const isReviewMode = useAtomValue(isReviewModeAtom)
  const isChapterRetestOpen = useAtomValue(isChapterRetestOpenAtom)

  useEffect(() => {
    // tick a zero timer to calc the stats
    dispatch({ type: TypingStateActionType.TICK_TIMER, addTime: 0 })
  }, [dispatch])

  const exportWords = useCallback(() => {
    const { words, userInputLogs } = state.chapterData
    const exportData = userInputLogs.map((log) => {
      const word = words[log.index]
      const wordName = word.name
      return {
        ...word,
        trans: word.trans.join(';'),
        correctCount: log.correctCount,
        wrongCount: log.wrongCount,
        wrongLetters: Object.entries(log.LetterMistakes)
          .map(([key, mistakes]) => `${wordName[Number(key)]}:${mistakes.length}`)
          .join(';'),
      }
    })

    import('xlsx')
      .then(({ utils, writeFileXLSX }) => {
        const ws = utils.json_to_sheet(exportData)
        const wb = utils.book_new()
        utils.book_append_sheet(wb, ws, 'Data')
        writeFileXLSX(wb, `${currentDictInfo.name}第${currentChapter + 1}章.xlsx`)
      })
      .catch(() => {
        console.log('写入 xlsx 模块导入失败')
      })
  }, [currentChapter, currentDictInfo.name, state.chapterData])

  const wrongWords = useMemo(() => {
    return state.chapterData.userInputLogs
      .filter((log) => log.wrongCount > 0)
      .map((log) => state.chapterData.words[log.index])
      .filter((word) => word !== undefined)
  }, [state.chapterData.userInputLogs, state.chapterData.words])

  // 拼对了、但每个字母的间隔明显慢于本章中位数的词。拼错的词已经单独挑出来了，
  // 这里只看拼对的，否则同一个词会被算两遍
  const slowWords = useMemo(() => {
    const logs = state.chapterData.userInputLogs
    const correctLogs = logs.filter((log) => log.wrongCount === 0 && log.averageKeyInterval > 0)
    if (correctLogs.length === 0) return []

    const threshold = Math.max(median(correctLogs.map((log) => log.averageKeyInterval)) * SLOW_RATIO_TO_MEDIAN, SLOW_FLOOR_MS)

    return correctLogs
      .filter((log) => log.averageKeyInterval > threshold)
      .map((log) => state.chapterData.words[log.index])
      .filter((word) => word !== undefined)
  }, [state.chapterData.userInputLogs, state.chapterData.words])

  /**
   * 重测的词表。顺序刻意保持练习顺序不打乱 —— 最先练的排在最前、最后练的排在最后，
   * 每个词离它上一次被检索的间隔都尽可能长。洗牌会把刚练完的词排到最前面，
   * 那时它还在工作记忆里，再测一次几乎没有成本，也就没有收益。
   */
  const retestWords = useMemo(() => {
    const seen = new Set(wrongWords.map((word) => word.name))
    return [...wrongWords, ...slowWords.filter((word) => !seen.has(word.name))].sort((a, b) => a.index - b.index)
  }, [wrongWords, slowWords])

  const isLastChapter = useMemo(() => {
    return currentChapter >= currentDictInfo.chapterCount - 1
  }, [currentChapter, currentDictInfo])

  const correctRate = useMemo(() => {
    const chapterLength = state.chapterData.words.length
    const correctCount = chapterLength - wrongWords.length
    return Math.floor((correctCount / chapterLength) * 100)
  }, [state.chapterData.words.length, wrongWords.length])

  const mistakeLevel = useMemo(() => {
    if (correctRate >= 85) {
      return 0
    } else if (correctRate >= 70) {
      return 1
    } else {
      return 2
    }
  }, [correctRate])

  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const minuteString = minutes < 10 ? '0' + minutes : minutes + ''
    const restSeconds = seconds % 60
    const secondString = restSeconds < 10 ? '0' + restSeconds : restSeconds + ''
    return `${minuteString}:${secondString}`
  }, [])

  const timeString = useMemo(() => formatTime(state.timerData.time), [formatTime, state.timerData.time])

  // 只显示进步，不显示退步：破纪录时高亮鼓励，没破就安静地写出目标，避免变成负反馈
  const personalBest = usePersonalBest(!state.isWrongWordReview)
  const bestHints = useMemo(() => {
    if (!personalBest) return undefined

    const { wpm, accuracy, time } = state.timerData
    return {
      accuracy: accuracy > personalBest.accuracy ? { text: '新纪录', highlight: true } : { text: `最好 ${personalBest.accuracy}%` },
      time: time < personalBest.time ? { text: '新纪录', highlight: true } : { text: `最快 ${formatTime(personalBest.time)}` },
      wpm: wpm > personalBest.wpm ? { text: '新纪录', highlight: true } : { text: `最好 ${personalBest.wpm}` },
    }
  }, [personalBest, state.timerData, formatTime])

  const repeatButtonHandler = useCallback(async () => {
    if (isReviewMode) {
      return
    }

    dispatch({ type: TypingStateActionType.REPEAT_CHAPTER, shouldShuffle: randomConfig.isOpen })
  }, [isReviewMode, dispatch, randomConfig.isOpen])

  const retestHandler = useCallback(() => {
    if (isReviewMode || retestWords.length === 0) {
      return
    }

    // 这里刻意不跟随「章节乱序」设置：重测要的就是保持练习顺序，让每个词离上一次
    // 被检索的间隔尽可能长，洗牌会把刚练完的词甩到最前面，那时它还在工作记忆里
    dispatch({ type: TypingStateActionType.REVIEW_WRONG_WORDS, payload: { words: retestWords, shouldShuffle: false } })
  }, [isReviewMode, retestWords, dispatch])

  /**
   * 章节练完后自动进入重测。
   *
   * 放在这里而不是 FINISH_CHAPTER 的时候，是为了确保章节成绩已经写进 chapterRecords ——
   * Typing/index.tsx 里那个保存 effect 和本组件的挂载在同一次提交，保存先发生；
   * 而重测会把 isFinished 翻回 false，抢在保存之前切过去这一章的成绩就丢了。
   *
   * 延迟一下再切，让用户先看一眼本章成绩（这本身就是有价值的元认知反馈），
   * 也避免结算页一闪而过。期间用户如果自己按了别的键，状态变化会让 effect 重跑、
   * 清掉定时器。
   */
  useEffect(() => {
    if (!isChapterRetestOpen || isReviewMode || state.isWrongWordReview) return
    if (retestWords.length === 0) return

    const timer = setTimeout(retestHandler, RETEST_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isChapterRetestOpen, isReviewMode, state.isWrongWordReview, retestWords.length, retestHandler])

  const nextButtonHandler = useCallback(() => {
    if (isReviewMode) {
      return
    }

    if (!isLastChapter) {
      setCurrentChapter((old) => old + 1)
      dispatch({ type: TypingStateActionType.NEXT_CHAPTER })
    }
  }, [dispatch, isLastChapter, isReviewMode, setCurrentChapter])

  const exitButtonHandler = useCallback(() => {
    if (isReviewMode) {
      setCurrentChapter(0)
      setReviewModeInfo((old) => ({ ...old, isReviewMode: false }))
    } else {
      dispatch({ type: TypingStateActionType.REPEAT_CHAPTER, shouldShuffle: false })
    }
  }, [dispatch, isReviewMode, setCurrentChapter, setReviewModeInfo])

  const onNavigateToGallery = useCallback(() => {
    setCurrentChapter(0)
    setReviewModeInfo((old) => ({ ...old, isReviewMode: false }))
    navigate('/gallery')
  }, [navigate, setCurrentChapter, setReviewModeInfo])

  useHotkeys(
    'enter',
    () => {
      nextButtonHandler()
    },
    { preventDefault: true },
  )

  useHotkeys(
    'space',
    (e) => {
      // 火狐浏览器的阻止事件无效，会导致按空格键后 再次输入正确的第一个字母会报错
      e.stopPropagation()
      repeatButtonHandler()
    },
    { preventDefault: true },
  )

  useHotkeys(
    'r',
    (e) => {
      e.stopPropagation()
      retestHandler()
    },
    { preventDefault: true },
  )

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto">
      <div className="absolute inset-0 bg-gray-300 opacity-80 dark:bg-gray-600"></div>
      <Transition
        show={true}
        enter="ease-in duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-out duration-100"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="flex h-screen items-center justify-center">
          <div className="my-card fixed flex w-[90vw] max-w-6xl flex-col overflow-hidden rounded-3xl bg-white pb-14 pl-10 pr-5 pt-10 shadow-lg dark:bg-gray-800 md:w-4/5 lg:w-3/5">
            <div className="text-center font-sans text-xl font-normal text-gray-900 dark:text-gray-400 md:text-2xl">
              {`${currentDictInfo.name} ${isReviewMode ? '错题复习' : '第' + (currentChapter + 1) + '章'}${
                state.isWrongWordReview ? ' · 重测' : ''
              }`}
            </div>
            <button className="absolute right-7 top-5" onClick={exitButtonHandler}>
              <IconX className="text-gray-400" />
            </button>
            <div className="mt-10 flex flex-row gap-2 overflow-hidden">
              <div className="flex flex-shrink-0 flex-grow-0 flex-col gap-3 px-4 sm:px-1 md:px-2 lg:px-4">
                <RemarkRing
                  remark={`${state.timerData.accuracy}%`}
                  caption="正确率"
                  percentage={state.timerData.accuracy}
                  hint={bestHints?.accuracy.text}
                  hintHighlight={bestHints?.accuracy.highlight}
                />
                <RemarkRing remark={timeString} caption="章节耗时" hint={bestHints?.time.text} hintHighlight={bestHints?.time.highlight} />
                <RemarkRing
                  remark={state.timerData.wpm + ''}
                  caption="WPM"
                  hint={bestHints?.wpm.text}
                  hintHighlight={bestHints?.wpm.highlight}
                />
              </div>
              <div className="z-10 ml-6 flex-1 overflow-visible rounded-xl bg-indigo-50 dark:bg-gray-700">
                <div className="customized-scrollbar z-20 ml-8 mr-1 flex h-80 flex-row flex-wrap content-start gap-4 overflow-y-auto overflow-x-hidden pr-7 pt-9">
                  {wrongWords.map((word, index) => (
                    <WordChip key={`${index}-${word.name}`} word={word} />
                  ))}
                </div>
                <div className="align-center flex w-full flex-row justify-start rounded-b-xl bg-indigo-200 px-4 dark:bg-indigo-400">
                  <ConclusionBar mistakeLevel={mistakeLevel} mistakeCount={wrongWords.length} />
                </div>
              </div>
              <div className="ml-2 flex flex-col items-center justify-end gap-3 text-xl">
                {/* 重测只练了一小撮单词，分享与导出的口径都是整章，这里不展示 */}
                {!isReviewMode && !state.isWrongWordReview && (
                  <>
                    <ShareButton />
                    <IexportWords fontSize={18} className="cursor-pointer text-gray-500" onClick={exportWords}></IexportWords>
                  </>
                )}
                <a href="https://github.com/RealKai42/qwerty-learner" target="_blank" rel="noreferrer" className="leading-[0px]">
                  <IconGithub fontSize={16} className="text-gray-500 hover:text-green-800 focus:outline-none" />
                </a>
              </div>
            </div>
            <div className="mt-10 flex w-full justify-center gap-5 px-5 text-xl">
              {!isReviewMode && (
                <>
                  {retestWords.length > 0 && (
                    <Tooltip content="快捷键：r">
                      <button
                        className="my-btn-primary h-12 border-2 border-solid border-gray-300 bg-white text-base text-gray-700 dark:border-gray-700 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-700"
                        type="button"
                        onClick={retestHandler}
                        title="重测本轮拼错的、以及拼对但拼得犹豫的单词"
                      >
                        {`重测 (${retestWords.length})`}
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip content="快捷键：space">
                    <button
                      className="my-btn-primary h-12 border-2 border-solid border-gray-300 bg-white text-base text-gray-700 dark:border-gray-700 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-700"
                      type="button"
                      onClick={repeatButtonHandler}
                      title={state.isWrongWordReview ? '返回本章节，从头再练一遍' : '重复本章节'}
                    >
                      重复本章节
                    </button>
                  </Tooltip>
                </>
              )}
              {!isLastChapter && !isReviewMode && (
                <Tooltip content="快捷键：enter">
                  <button
                    className={`{ isLastChapter ? 'cursor-not-allowed opacity-50' : ''} my-btn-primary h-12 text-base font-bold `}
                    type="button"
                    onClick={nextButtonHandler}
                    title="下一章节"
                  >
                    下一章节
                  </button>
                </Tooltip>
              )}

              {isReviewMode && (
                <button
                  className="my-btn-primary h-12 text-base font-bold"
                  type="button"
                  onClick={onNavigateToGallery}
                  title="练习其他章节"
                >
                  练习其他章节
                </button>
              )}
            </div>
          </div>
        </div>
      </Transition>
    </div>
  )
}

export default ResultScreen
