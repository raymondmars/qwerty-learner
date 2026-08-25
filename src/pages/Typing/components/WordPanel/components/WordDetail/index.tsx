import { WordPronunciationIcon } from '@/components/WordPronunciationIcon'
import type { WordDetail, WordSense } from '@/pages/Typing/hooks/useWordDetail'
import { phoneticConfigAtom, pronunciationIsOpenAtom } from '@/store'
import type { Word } from '@/typings'
import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import IconLightBulb from '~icons/heroicons/light-bulb-solid'

export type WordDetailProps = {
  word: Word
  detail: WordDetail
  /** 拼写完成后是否仍留有错字母；中途错了但退格改对的算正确 */
  isMistaken: boolean
}

// 词库多用英式 -ise/-yse 拼写，例句语料以美式 -ize/-yze 为主，两边都要认
function spellings(w: string) {
  const out = [w]
  if (w.endsWith('ise')) out.push(`${w.slice(0, -3)}ize`)
  if (w.endsWith('yse')) out.push(`${w.slice(0, -3)}yze`)
  if (w.endsWith('isation')) out.push(`${w.slice(0, -7)}ization`)
  return out
}

// 与 scripts/gen-word-details.mjs 里的变形规则保持一致
function inflections(word: string) {
  const forms = new Set<string>()
  for (const w of spellings(word.toLowerCase())) {
    for (const f of [w, `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`]) forms.add(f)
    if (w.endsWith('e')) {
      forms.add(`${w.slice(0, -1)}ing`)
      forms.add(`${w}d`)
    }
    if (w.endsWith('y')) {
      forms.add(`${w.slice(0, -1)}ies`)
      forms.add(`${w.slice(0, -1)}ied`)
    }
  }
  // 长的排前面，避免 subtitles 只被匹配掉 subtitle 那一截
  return Array.from(forms)
    .sort((a, b) => b.length - a.length)
    .map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

/** 把例句里的目标单词（含常见变形）加粗 */
function highlightWord(sentence: string, word: string) {
  const pattern = new RegExp(`\\b(${inflections(word).join('|')})\\b`, 'gi')

  return sentence.split(pattern).map((part, index) =>
    // split 带捕获组时，奇数下标就是匹配到的单词本身
    index % 2 === 1 ? (
      <strong key={index} className="font-bold text-gray-900 decoration-indigo-300 decoration-2 underline-offset-2 dark:text-white">
        {part}
      </strong>
    ) : (
      part
    ),
  )
}

// 部分词典的释义带词性前缀，如 "vt&vi. 控诉，控告"、"n. 苹果"
const POS_PATTERN = /^([a-z]{1,5}\.?(?:\s*[&/]\s*[a-z]{1,5}\.?)*\.)\s*/i

/** 拆出释义里的词性前缀，没有前缀的词典返回空 pos */
function splitPartOfSpeech(trans: string): WordSense {
  const matched = trans.match(POS_PATTERN)
  if (!matched) return { pos: '', zh: trans }

  const zh = trans.slice(matched[0].length)
  // 整条释义都被当成词性时不拆，避免把内容拆没了
  if (zh.length === 0) return { pos: '', zh: trans }

  return { pos: matched[1], zh }
}

/** 同义词/反义词/同根词那一行的胶囊标签，用色系区分语义，不和词性标签撞脸 */
function ChipRow({ label, words, chipClassName }: { label: string; words?: string[]; chipClassName: string }) {
  if (!words?.length) return null

  return (
    <div className="flex items-baseline gap-2 text-left">
      <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {words.map((word) => (
          <span key={word} className={`rounded-md px-1.5 py-0.5 text-sm ${chipClassName}`}>
            {word}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 小节标题。层级只靠字号和颜色，不再每节都拉一条分割线，否则卡片会被横线切碎 */
function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-gray-400 dark:text-gray-500">{children}</span>
}

export default function WordDetailCard({ word, detail, isMistaken }: WordDetailProps) {
  const phoneticConfig = useAtomValue(phoneticConfigAtom)
  const pronunciationIsOpen = useAtomValue(pronunciationIsOpenAtom)

  const phonetic = phoneticConfig.type === 'uk' ? word.ukphone : word.usphone
  const phoneticLabel = phoneticConfig.type === 'uk' ? 'BrE' : 'AmE'
  const hasPhonetic = Boolean(phonetic && phonetic.length > 1)

  // 优先用按单词挑出的完整释义，缺失时回落到当前词库自带的 trans
  const senses = useMemo(() => (detail.senses?.length ? detail.senses : word.trans.map(splitPartOfSpeech)), [detail.senses, word.trans])

  // 词典收录的固定搭配排在语料统计出的词组前面
  const phrases = useMemo(() => [...(detail.collocations ?? []), ...detail.phrases], [detail.collocations, detail.phrases])

  const hasRelated = Boolean(detail.synonyms?.length || detail.antonyms?.length || detail.cognates?.length)

  return (
    // 卡片只在拼完单词、等待按 Enter 时出现，此刻没有拼写输入要保护，
    // 所以不跟随「文本可选中」的全局设置，始终允许选中复制释义和例句
    <div className="w-160 max-w-[92vw] cursor-text select-text overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-900/5 animate-in fade-in slide-in-from-bottom-2 duration-200 dark:bg-gray-800 dark:shadow-none dark:ring-white/10">
      {/* 顶部色带取代判罚式标签：拼错用中性的琥珀色，一次写对给绿色正反馈 */}
      <div className={`h-[3px] ${isMistaken ? 'bg-amber-400' : 'bg-green-400'}`} />

      <div className="px-5 py-4">
        {/* 单词、音标、发音排成一行 baseline 对齐，状态标签退到右上角，不再占掉整行 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-mono text-3xl font-bold leading-none text-gray-700 dark:text-gray-100">{word.name}</span>
            {hasPhonetic && (
              <>
                <span className="text-xs text-gray-400 dark:text-gray-500">{phoneticLabel}</span>
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{`[${phonetic}]`}</span>
              </>
            )}
            {pronunciationIsOpen && (
              <WordPronunciationIcon
                word={word}
                className="h-4 w-4 self-center text-gray-400 hover:text-indigo-500"
                iconClassName="h-4 w-4"
              />
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isMistaken
                ? 'bg-amber-50 text-amber-600 dark:bg-amber-400/20 dark:text-amber-300'
                : 'bg-green-50 text-green-600 dark:bg-green-400/20 dark:text-green-300'
            }`}
          >
            {isMistaken ? '拼写有误' : '✓ 正确'}
          </span>
        </div>

        {/* 释义紧跟单词，不加小标题：词性列本身就说明了这是什么 */}
        {senses.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {senses.map((sense, index) => (
              <li key={`${index}-${sense.pos}`} className="flex items-baseline gap-2.5 text-left">
                {/* 固定宽度的词性列当装订线，没有词性的词典也能对齐 */}
                <span className="w-9 shrink-0 text-right font-mono text-xs text-gray-400 dark:text-gray-500">{sense.pos}</span>
                <span className="flex-1 text-base leading-relaxed text-gray-700 dark:text-gray-200">{sense.zh}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 助记是全卡片最有记忆价值的内容，给底色让它从正文里跳出来 */}
        {detail.mnemonic && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 dark:bg-indigo-400/10">
            <IconLightBulb className="mt-0.5 shrink-0 text-indigo-400" fontSize={15} />
            <p className="text-left text-sm leading-relaxed text-gray-600 dark:text-gray-300">{detail.mnemonic}</p>
          </div>
        )}

        {detail.sentences.length > 0 && (
          <div className="mt-4">
            <SectionLabel>例句</SectionLabel>
            {/* 左侧竖线代替序号和横向分割线，视觉更轻 */}
            <ol className="mt-2 flex flex-col gap-2.5">
              {detail.sentences.map((sentence) => (
                <li key={sentence.en} className="border-l-2 border-gray-200 pl-3 text-left dark:border-gray-600">
                  <p className="text-[15px] leading-6 text-gray-700 dark:text-gray-200">{highlightWord(sentence.en, word.name)}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-gray-400 dark:text-gray-500">{sentence.zh}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 词组和相关词都是扫读内容，并排放；只有一边有数据时占满整行 */}
        {(phrases.length > 0 || hasRelated) && (
          <div
            className={`mt-4 grid gap-x-5 gap-y-3 border-t border-gray-200 pt-3 dark:border-gray-700 ${
              phrases.length > 0 && hasRelated ? 'grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {phrases.length > 0 && (
              <div>
                <SectionLabel>词组</SectionLabel>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {phrases.map((phrase) => (
                    <li key={phrase.en} className="text-left text-sm">
                      <span className="text-gray-700 dark:text-gray-200">{phrase.en}</span>
                      <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{phrase.zh}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasRelated && (
              <div className="flex flex-col gap-2">
                <ChipRow
                  label="同义词"
                  words={detail.synonyms}
                  chipClassName="bg-indigo-50 text-indigo-500 dark:bg-indigo-400/20 dark:text-indigo-300"
                />
                <ChipRow
                  label="反义词"
                  words={detail.antonyms}
                  chipClassName="bg-amber-50 text-amber-600 dark:bg-amber-400/20 dark:text-amber-300"
                />
                <ChipRow
                  label="同根词"
                  words={detail.cognates}
                  chipClassName="bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
