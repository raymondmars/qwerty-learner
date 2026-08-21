import type { WordDetail, WordSense } from '@/pages/Typing/hooks/useWordDetail'
import { isTextSelectableAtom, phoneticConfigAtom } from '@/store'
import type { Word } from '@/typings'
import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { useMemo } from 'react'

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
      <strong key={index} className="font-bold text-gray-900 dark:text-white">
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

/** 同义词/反义词/同根词那一行的胶囊标签 */
function ChipRow({ label, words }: { label: string; words?: string[] }) {
  if (!words?.length) return null

  return (
    <div className="flex items-baseline gap-2 text-left">
      <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {words.map((word) => (
          <span
            key={word}
            className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-sm text-indigo-500 dark:bg-indigo-400/20 dark:text-indigo-300"
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 卡片内的分节，每节顶部带一条分割线 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
      <span className="text-xs font-medium text-indigo-500 dark:text-indigo-400">{title}</span>
      {children}
    </div>
  )
}

export default function WordDetailCard({ word, detail, isMistaken }: WordDetailProps) {
  const phoneticConfig = useAtomValue(phoneticConfigAtom)
  const isTextSelectable = useAtomValue(isTextSelectableAtom)

  const phonetic = phoneticConfig.type === 'uk' ? word.ukphone : word.usphone
  const phoneticLabel = phoneticConfig.type === 'uk' ? 'BrE' : 'AmE'

  // 优先用按单词挑出的完整释义，缺失时回落到当前词库自带的 trans
  const senses = useMemo(() => (detail.senses?.length ? detail.senses : word.trans.map(splitPartOfSpeech)), [detail.senses, word.trans])

  // 词典收录的固定搭配排在语料统计出的词组前面
  const phrases = useMemo(() => [...(detail.collocations ?? []), ...detail.phrases], [detail.collocations, detail.phrases])

  const hasRelated = Boolean(detail.synonyms?.length || detail.antonyms?.length || detail.cognates?.length)

  return (
    <div className={`w-150 rounded-xl bg-white px-5 py-4 shadow-lg dark:bg-gray-800 ${isTextSelectable ? 'select-text' : 'select-none'}`}>
      <div className="flex flex-col items-start">
        {/* 拼错时用中性的琥珀色告知，不做判罚式的红色；一次写对则明确给正反馈 */}
        <span
          className={`mb-2 rounded-full px-2 py-0.5 text-xs font-medium ${
            isMistaken
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-400/20 dark:text-amber-300'
              : 'bg-green-50 text-green-600 dark:bg-green-400/20 dark:text-green-300'
          }`}
        >
          {isMistaken ? '拼写有误' : '✓ 正确'}
        </span>
        <span className="font-mono text-3xl font-bold text-gray-700 dark:text-gray-100">{word.name}</span>
        {phonetic && phonetic.length > 1 && (
          <span className="mt-0.5 text-xs font-normal text-gray-500 dark:text-gray-400">{`${phoneticLabel}: [${phonetic}]`}</span>
        )}
      </div>

      {senses.length > 0 && (
        <Section title="释义">
          <ul className="mt-1.5 flex flex-col gap-1">
            {senses.map((sense, index) => (
              <li key={`${index}-${sense.pos}`} className="flex items-baseline gap-2 text-left">
                {sense.pos && (
                  <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-500 dark:bg-indigo-400/20 dark:text-indigo-300">
                    {sense.pos}
                  </span>
                )}
                <span className="text-base leading-6 text-gray-700 dark:text-gray-200">{sense.zh}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {detail.mnemonic && (
        <Section title="助记">
          <p className="mt-1.5 text-left text-base leading-6 text-gray-700 dark:text-gray-200">{detail.mnemonic}</p>
        </Section>
      )}

      {detail.sentences.length > 0 && (
        <Section title="例句">
          <ol className="mt-1.5 flex flex-col gap-2">
            {detail.sentences.map((sentence, index) => (
              <li key={sentence.en} className="flex gap-2 text-left">
                <span className="shrink-0 text-sm leading-6 text-gray-400">{index + 1}.</span>
                <div className="flex flex-col">
                  <span className="text-base leading-6 text-gray-700 dark:text-gray-200">{highlightWord(sentence.en, word.name)}</span>
                  <span className="mt-0.5 text-sm leading-5 text-gray-500 dark:text-gray-400">{sentence.zh}</span>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {phrases.length > 0 && (
        <Section title="词组">
          <ul className="mt-1.5 flex flex-col gap-1">
            {phrases.map((phrase) => (
              <li key={phrase.en} className="flex items-baseline gap-2 text-left">
                <span className="text-base text-gray-700 dark:text-gray-200">{phrase.en}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{phrase.zh}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {hasRelated && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-gray-200 pt-3 dark:border-gray-700">
          <ChipRow label="同义词" words={detail.synonyms} />
          <ChipRow label="反义词" words={detail.antonyms} />
          <ChipRow label="同根词" words={detail.cognates} />
        </div>
      )}
    </div>
  )
}
