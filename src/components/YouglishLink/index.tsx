import YouglishDialog from './YouglishDialog'
import HotkeyHint from '@/components/HotkeyHint'
import { pronunciationConfigAtom } from '@/store'
import { trackEvent } from '@/utils/analytics'
import { useAtomValue } from 'jotai'
import { useCallback, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import IconMovie from '~icons/tabler/movie'

/**
 * 看这个词在真实视频里怎么用。点开是弹窗，不跳走。
 *
 * 为什么值得有：我们自带的例句是文本、来源单一（Tatoeba 语料加模型兜底），
 * 而 YouGlish 给的是真实口语语境、带语调、场景多样。同一个词在多样语境里遇到，
 * 形成的知识更灵活、更能迁移（编码变异性），这是纯文本例句补不上的。
 *
 * 为什么只在「检索之后」出现：看视频是学习（study）不是检索（retrieval），
 * 同样一分钟花在回忆上的收益显著高于再学一遍。所以这个入口只挂在拼完单词后的
 * 详情卡片和错题本上，绝不能出现在拼写过程中 —— 那会把检索时间换成观看时间，
 * 单位时间的收益是下降的。
 *
 * 为什么从外链改成弹窗：外链会把用户整个带离练习页，回不回来是未知数 —— 这是
 * 会话中断，损失的是练习总量，不只是注意力。弹窗关掉就回到原处。
 *
 * 但要留意这个改动的另一面：弹窗降低了「看视频」的摩擦，而按上面那条，看视频的
 * 单位时间收益本来就低于检索。把低收益活动变便宜不是无条件的好事，所以这里埋了
 * 点击事件 —— 先看真实点击率，再决定这个入口该更显眼还是该收起来。
 *
 * 快捷键用裸键 V 而不是 ctrl 组合：这个组件只在「拼完等按 Enter」的详情卡和错题本里
 * 挂载，那两个场景都不接受字母输入 —— 打字页此刻 updateInput 会因 isFinished 提前返回，
 * 所以裸键不会被当成拼写吃掉（ResultScreen 里的裸 r / space 是同样的道理）。
 * ctrl+j 已经给了发音，ctrl+v / ctrl+shift+v / ctrl+d 也都有主了。
 * react-hotkeys-hook 4.x 是严格匹配修饰键的（ctrl === !ctrlKey），所以裸 V 不会被
 * ctrl+V 触发，两者不冲突。
 */
export default function YouglishLink({ word, className = '' }: { word: string; className?: string }) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)
  const accent = pronunciationConfig.type === 'uk' ? 'uk' : 'us'
  const [isOpen, setIsOpen] = useState(false)

  const name = word.trim()

  const handleOpen = useCallback(() => {
    setIsOpen(true)
    trackEvent('youglish_open', { word: name, accent })
  }, [name, accent])

  const handleClose = useCallback(() => setIsOpen(false), [])

  // 只在组件挂载期间生效，也就是只在详情卡/错题本详情打开时。
  // 不开 enableOnFormTags：万一焦点在输入框里，敲 v 该是打字不是开弹窗
  useHotkeys('v', handleOpen, { preventDefault: true, enabled: Boolean(name) && !isOpen }, [handleOpen, name, isOpen])

  if (!name) return null

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={`看 ${name} 的真实视频用例（快捷键 V）`}
        className={`group inline-flex items-center gap-1 text-[12px] text-gray-400 transition-colors hover:text-indigo-500 dark:text-gray-500 dark:hover:text-indigo-400 ${className}`}
      >
        <IconMovie className="text-[13px]" />
        视频例句
        {/* 裸键快捷键没有任何自然的可发现性，不标出来等于没有 */}
        <HotkeyHint keys="V" className="ml-0.5 group-hover:border-indigo-300 group-hover:text-indigo-400" />
      </button>
      {isOpen && <YouglishDialog word={name} accent={accent} onClose={handleClose} />}
    </>
  )
}
