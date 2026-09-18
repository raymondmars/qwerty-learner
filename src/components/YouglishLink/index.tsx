import { pronunciationConfigAtom } from '@/store'
import { useAtomValue } from 'jotai'
import IconMovie from '~icons/tabler/movie'

/**
 * 跳到 YouGlish 看这个词在真实视频里怎么用。
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
 * 为什么是链接不是内嵌：内嵌要在每个词上都加载第三方 iframe，不用也得付代价；
 * 而且生僻词和词组在 YouGlish 上可能没有结果，链接是优雅降级，内嵌会留一个空框。
 */
export default function YouglishLink({ word, className = '' }: { word: string; className?: string }) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)
  const accent = pronunciationConfig.type === 'uk' ? 'uk' : 'us'

  const name = word.trim()
  if (!name) return null

  return (
    <a
      href={`https://youglish.com/pronounce/${encodeURIComponent(name)}/english/${accent}`}
      target="_blank"
      rel="noreferrer"
      title={`在 YouGlish 上看 ${name} 的真实视频用例`}
      className={`inline-flex items-center gap-1 text-[12px] text-gray-400 transition-colors hover:text-indigo-500 dark:text-gray-500 dark:hover:text-indigo-400 ${className}`}
    >
      <IconMovie className="text-[13px]" />
      视频例句
    </a>
  )
}
