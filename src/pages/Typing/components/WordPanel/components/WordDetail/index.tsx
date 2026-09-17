import { WordPronunciationIcon } from '@/components/WordPronunciationIcon'
import type { WordDetail, WordSense } from '@/pages/Typing/hooks/useWordDetail'
import { currentChapterAtom, currentDictInfoAtom, phoneticConfigAtom, pronunciationIsOpenAtom, wordMistakesAtom } from '@/store'
import type { Word } from '@/typings'
import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import IconLightBulb from '~icons/heroicons/light-bulb-solid'

export type WordDetailProps = {
  word: Word
  detail: WordDetail
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

/** 小节标题。层级只靠字号、字距和颜色，不再每节都拉一条分割线，否则卡片会被横线切碎 */
function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] tracking-[0.2em] text-gray-400 dark:text-gray-500">{children}</span>
}

export default function WordDetailCard({ word, detail }: WordDetailProps) {
  const phoneticConfig = useAtomValue(phoneticConfigAtom)
  const pronunciationIsOpen = useAtomValue(pronunciationIsOpenAtom)
  const currentDictInfo = useAtomValue(currentDictInfoAtom)
  const currentChapter = useAtomValue(currentChapterAtom)

  const phonetic = phoneticConfig.type === 'uk' ? word.ukphone : word.usphone
  const phoneticLabel = phoneticConfig.type === 'uk' ? 'BrE' : 'AmE'
  const hasPhonetic = Boolean(phonetic && phonetic.length > 1)

  // 拼错时，纠正性反馈是这张卡片上最该被读到的东西，其余内容都要给它让路
  const mistakes = useAtomValue(wordMistakesAtom)
  const mistakeByIndex = useMemo(() => new Map(mistakes.map((m) => [m.index, m.typed])), [mistakes])
  const hasMistake = mistakeByIndex.size > 0

  // 用户实际敲出来的那个词，拿来和正确拼写并排放
  const typedWord = useMemo(
    () =>
      hasMistake
        ? word.name
            .split('')
            .map((letter, index) => mistakeByIndex.get(index) ?? letter)
            .join('')
        : '',
    [hasMistake, mistakeByIndex, word.name],
  )

  // 优先用按单词挑出的完整释义，缺失时回落到当前词库自带的 trans
  const senses = useMemo(() => (detail.senses?.length ? detail.senses : word.trans.map(splitPartOfSpeech)), [detail.senses, word.trans])

  // 词典收录的固定搭配排在语料统计出的词组前面
  const phrases = useMemo(() => [...(detail.collocations ?? []), ...detail.phrases], [detail.collocations, detail.phrases])

  // 拼错时例句只留一条：反馈窗口很短（拼完到按 Enter），三条例句会把注意力从纠正上拉走。
  // 拼对时没有纠正信息要保护，多给的内容纯属加餐，愿意多看就多看
  const sentences = useMemo(() => (hasMistake ? detail.sentences.slice(0, 1) : detail.sentences), [hasMistake, detail.sentences])

  const hasRelated = Boolean(detail.synonyms?.length || detail.antonyms?.length || detail.cognates?.length)
  // 没有例句、词组和相关词时右栏整个省掉，卡片收成单栏，不留一大片空白
  const hasDetailColumn = sentences.length > 0 || phrases.length > 0 || hasRelated

  return (
    // 卡片只在拼完单词、等待按 Enter 时出现，此刻没有拼写输入要保护，
    // 所以不跟随「文本可选中」的全局设置，始终允许选中复制释义和例句
    <div
      className="animate-float-in bg-white/85 dark:bg-gray-800/85 w-[56rem] max-w-[92vw] cursor-text select-text overflow-hidden rounded-[26px] border border-gray-200/70 backdrop-blur-[18px] dark:border-white/10"
      style={{ boxShadow: '0 34px 80px -40px oklch(0.35 0.05 288 / 0.3)' }}
    >
      <div className={`grid grid-cols-1 ${hasDetailColumn ? 'md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]' : ''}`}>
        {/* 左栏：单词本体信息，浅色底把它和右侧的例句区分开 */}
        <div
          className={`flex flex-col gap-5 bg-gradient-to-b from-indigo-50/50 to-indigo-50/20 px-9 py-9 text-left dark:from-white/[0.04] dark:to-transparent ${
            hasDetailColumn ? 'border-b border-gray-200/70 dark:border-white/10 md:border-b-0 md:border-r' : ''
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-mono text-[26px] font-bold leading-none tracking-tight text-gray-800 dark:text-gray-100">
              {hasMistake
                ? word.name.split('').map((letter, index) => (
                    <span
                      key={`${index}-${letter}`}
                      className={
                        mistakeByIndex.has(index)
                          ? 'rounded-[3px] bg-amber-200/70 px-[1px] text-amber-900 dark:bg-amber-400/30 dark:text-amber-200'
                          : ''
                      }
                    >
                      {letter}
                    </span>
                  ))
                : word.name}
            </span>
            {pronunciationIsOpen && (
              <WordPronunciationIcon
                word={word}
                className="h-4 w-4 self-center text-gray-400 hover:text-indigo-500"
                iconClassName="h-4 w-4"
              />
            )}
          </div>

          {hasPhonetic && (
            <div className="font-mono text-[12.5px] text-gray-400 dark:text-gray-500">{`${phoneticLabel} [${phonetic}]`}</div>
          )}

          {hasMistake && (
            <div className="text-[12.5px] text-gray-400 dark:text-gray-500">
              你拼成了 <span className="font-mono text-red-500 line-through dark:text-red-400">{typedWord}</span>
            </div>
          )}

          <div className="h-px bg-gray-200/80 dark:bg-white/10" />

          {senses.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {senses.map((sense, index) => (
                <li key={`${index}-${sense.pos}`} className="text-[17px] font-medium leading-[1.7] text-gray-700 dark:text-gray-200">
                  {sense.pos && <span className="mr-2 font-mono text-[11.5px] font-normal italic text-gray-400">{sense.pos}</span>}
                  {sense.zh}
                </li>
              ))}
            </ul>
          )}

          {/* 助记是全卡片最有记忆价值的内容，给底色让它从正文里跳出来 */}
          {detail.mnemonic && (
            <div className="flex items-start gap-2 rounded-xl bg-indigo-100/50 px-3 py-2.5 dark:bg-indigo-400/10">
              <IconLightBulb className="mt-0.5 shrink-0 text-indigo-400" fontSize={15} />
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{detail.mnemonic}</p>
            </div>
          )}

          <div className="mt-auto pt-2 text-[11px] uppercase tracking-[0.16em] text-gray-400/80 dark:text-gray-500">
            {`${currentDictInfo.name} · 第 ${currentChapter + 1} 章`}
          </div>
        </div>

        {/* 右栏：编号例句与点线对齐的词组 */}
        {hasDetailColumn && (
          <div className="px-10 pb-9 pt-8 text-left">
            {sentences.length > 0 && (
              <div>
                <SectionLabel>例句</SectionLabel>
                <ol className="mt-1.5">
                  {sentences.map((sentence, index) => (
                    <li
                      key={sentence.en}
                      className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3.5 border-b border-gray-100 py-5 last:border-b-0 dark:border-white/[0.07]"
                    >
                      <span className="pt-1 font-mono text-xs text-gray-300 dark:text-gray-600">{String(index + 1).padStart(2, '0')}</span>
                      <div className="grid gap-1.5">
                        <p className="text-[17.5px] leading-[1.55] text-gray-700 dark:text-gray-200">
                          {highlightWord(sentence.en, word.name)}
                        </p>
                        <p className="text-sm leading-[1.6] text-gray-400 dark:text-gray-500">{sentence.zh}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {phrases.length > 0 && (
              <div className={sentences.length > 0 ? 'mt-6' : ''}>
                <SectionLabel>词组</SectionLabel>
                <ul className="mt-3 grid gap-0.5">
                  {phrases.map((phrase) => (
                    <li key={phrase.en} className="flex items-baseline gap-3 py-2">
                      <span className="font-mono text-[14.5px] font-medium text-gray-700 dark:text-gray-200">{phrase.en}</span>
                      {/* 点线把长短不一的词组和译文拉到同一条基线上 */}
                      <span className="h-px flex-1 bg-gray-200/80 dark:bg-white/10" />
                      <span className="shrink-0 text-[13.5px] text-gray-400 dark:text-gray-500">{phrase.zh}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasRelated && (
              <div className="mt-6 flex flex-col gap-2 border-t border-gray-100 pt-4 dark:border-white/[0.07]">
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
