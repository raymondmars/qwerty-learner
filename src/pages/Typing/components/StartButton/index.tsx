import { TypingContext, TypingStateActionType } from '../../store'
import Tooltip from '@/components/Tooltip'
import { isWordWaitingEnterAtom, randomConfigAtom } from '@/store'
import { autoUpdate, offset, useFloating, useHover, useInteractions } from '@floating-ui/react'
import { useAtomValue } from 'jotai'
import { useCallback, useContext, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

export default function StartButton({ isLoading }: { isLoading: boolean }) {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!
  const randomConfig = useAtomValue(randomConfigAtom)
  const isWordWaitingEnter = useAtomValue(isWordWaitingEnterAtom)

  const onToggleIsTyping = useCallback(() => {
    !isLoading && dispatch({ type: TypingStateActionType.TOGGLE_IS_TYPING })
  }, [isLoading, dispatch])

  const onClickRestart = useCallback(() => {
    dispatch({ type: TypingStateActionType.REPEAT_CHAPTER, shouldShuffle: randomConfig.isOpen })
  }, [dispatch, randomConfig.isOpen])

  const onEnter = useCallback(() => {
    // 单词拼写完成等待跳转时，Enter 归 Word 组件处理，此处不再切换开始/暂停；
    // 但暂停中 Word 那边不会响应，此时 Enter 仍要用来恢复练习
    if (state.isTyping && isWordWaitingEnter) return

    onToggleIsTyping()
  }, [state.isTyping, isWordWaitingEnter, onToggleIsTyping])

  useHotkeys('enter', onEnter, { enableOnFormTags: true, preventDefault: true }, [onEnter])

  const [isShowReStartButton, setIsShowReStartButton] = useState(false)
  const { refs, context } = useFloating({
    open: isShowReStartButton,
    onOpenChange: setIsShowReStartButton,
    whileElementsMounted: autoUpdate,
    middleware: [offset(5)],
  })
  const hoverButton = useHover(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([hoverButton])

  return (
    <Tooltip content={`${state.isTyping ? '暂停' : '开始'} （Enter）`} className="box-content h-7 w-8 px-6 py-1">
      <div
        ref={refs.setReference}
        {...getReferenceProps()}
        className={`${state.isTyping ? 'bg-gray-300/70 dark:bg-gray-600/70' : 'bg-indigo-200/70 dark:bg-indigo-500/30'} ${
          isShowReStartButton ? 'h-20' : 'h-auto'
        } flex-column absolute left-0 top-0 w-20 rounded-2xl transition-colors duration-200`}
      >
        <button
          className="flex w-20 items-center justify-center rounded-full py-2 text-[13px] font-semibold text-white hover:opacity-90 focus:outline-none"
          // 练习中是中性的灰，暂停时给主色渐变，把「点它会开始」的引导留在按钮上
          style={
            state.isTyping
              ? { background: 'linear-gradient(145deg, oklch(0.68 0.02 285), oklch(0.6 0.02 285))' }
              : {
                  background: 'linear-gradient(145deg, oklch(0.6 0.18 288), oklch(0.5 0.2 292))',
                  boxShadow: '0 8px 20px oklch(0.55 0.19 290 / 0.32)',
                }
          }
          type="button"
          onClick={onToggleIsTyping}
          aria-label={state.isTyping ? '暂停' : '开始'}
        >
          {state.isTyping ? 'Pause' : 'Start'}
        </button>
        {isShowReStartButton && (
          <div className="absolute bottom-0 flex w-20 justify-center" ref={refs.setFloating} {...getFloatingProps()}>
            <button
              className={`${
                state.isTyping ? 'bg-gray-500 dark:bg-gray-700 dark:hover:bg-gray-500' : 'bg-indigo-400'
              } my-1 flex w-[4.5rem] items-center justify-center rounded-full py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:opacity-90 focus:outline-none`}
              type="button"
              onClick={onClickRestart}
              aria-label={'重新开始'}
            >
              Restart
            </button>
          </div>
        )}
      </div>
    </Tooltip>
  )
}
