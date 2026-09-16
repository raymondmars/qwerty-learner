import { TypingContext, TypingStateActionType } from '../../store'
import AnalysisButton from '../AnalysisButton'
import ErrorBookButton from '../ErrorBookButton'
import HandPositionIllustration from '../HandPositionIllustration'
import LoopWordSwitcher from '../LoopWordSwitcher'
import RepeaterButton from '../RepeaterButton'
import Setting from '../Setting'
import SoundSwitcher from '../SoundSwitcher'
import WordDictationSwitcher from '../WordDictationSwitcher'
import Tooltip from '@/components/Tooltip'
import { isOpenDarkModeAtom } from '@/store'
import { CTRL } from '@/utils'
import { useAtom } from 'jotai'
import { useContext } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import IconMoon from '~icons/heroicons/moon-solid'
import IconSun from '~icons/heroicons/sun-solid'
import IconLanguage from '~icons/tabler/language'
import IconLanguageOff from '~icons/tabler/language-off'

export default function Switcher() {
  const [isOpenDarkMode, setIsOpenDarkMode] = useAtom(isOpenDarkModeAtom)
  const { state, dispatch } = useContext(TypingContext) ?? {}

  const changeDarkModeState = () => {
    setIsOpenDarkMode((old) => !old)
  }

  const changeTransVisibleState = () => {
    if (dispatch) {
      dispatch({ type: TypingStateActionType.TOGGLE_TRANS_VISIBLE })
    }
  }

  useHotkeys(
    'ctrl+shift+v',
    () => {
      changeTransVisibleState()
    },
    { enableOnFormTags: true, preventDefault: true },
    [],
  )

  return (
    <>
      <span className="dark:bg-white/15 h-4 w-px shrink-0 bg-gray-200" />
      <div className="flex items-center justify-center gap-1.5">
        <Tooltip className="toolbar-tile" content="音效设置">
          <SoundSwitcher />
        </Tooltip>

        <Tooltip className="toolbar-tile" content="设置单个单词循环">
          <LoopWordSwitcher />
        </Tooltip>

        <Tooltip className="toolbar-tile" content={`开关默写模式（${CTRL} + V）`}>
          <WordDictationSwitcher />
        </Tooltip>
        <Tooltip className="toolbar-tile" content={`开关释义显示（${CTRL} + Shift + V）`}>
          <button
            className={`${state?.isTransVisible ? 'text-indigo-500' : ''} flex text-lg focus:outline-none`}
            type="button"
            onClick={(e) => {
              changeTransVisibleState()
              e.currentTarget.blur()
            }}
            aria-label={`开关释义显示（${CTRL} + Shift + V）`}
          >
            {state?.isTransVisible ? <IconLanguage /> : <IconLanguageOff />}
          </button>
        </Tooltip>

        <Tooltip className="toolbar-tile" content="错题本">
          <ErrorBookButton />
        </Tooltip>

        <Tooltip className="toolbar-tile" content="查看数据统计">
          <AnalysisButton />
        </Tooltip>

        <Tooltip className="toolbar-tile" content="复读机 · 听力精听与听写（新标签页打开）">
          <RepeaterButton />
        </Tooltip>

        <Tooltip className="toolbar-tile" content="开关深色模式">
          <button
            className={`flex text-lg text-indigo-500 focus:outline-none`}
            type="button"
            onClick={(e) => {
              changeDarkModeState()
              e.currentTarget.blur()
            }}
            aria-label="开关深色模式"
          >
            {isOpenDarkMode ? <IconMoon className="icon" /> : <IconSun className="icon" />}
          </button>
        </Tooltip>
        <Tooltip className="toolbar-tile" content="指法图示">
          <HandPositionIllustration></HandPositionIllustration>
        </Tooltip>
        <Tooltip className="toolbar-tile" content="设置">
          <Setting />
        </Tooltip>
      </div>
    </>
  )
}
