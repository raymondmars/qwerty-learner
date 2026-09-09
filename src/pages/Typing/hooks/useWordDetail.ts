import type { Word } from '@/typings'
import { withAssetVersion } from '@/utils'
import { useEffect, useMemo } from 'react'
import { preload } from 'swr'
import useSWRImmutable from 'swr/immutable'

export type WordDetailItem = {
  en: string
  zh: string
}

export type WordSense = {
  /** 词性缩写，如 n. / vt. / adj.，来源词库没标注时为空 */
  pos: string
  zh: string
}

export type WordDetail = {
  sentences: WordDetailItem[]
  phrases: WordDetailItem[]
  /** 以下字段由 scripts/build-word-notes.mjs 从全部英文词库里提取，均可能缺失 */
  senses?: WordSense[]
  /** 词根/联想助记 */
  mnemonic?: string
  synonyms?: string[]
  antonyms?: string[]
  /** 同根词 */
  cognates?: string[]
  /** 词典收录的固定搭配，与语料统计出的 phrases 互补 */
  collocations?: WordDetailItem[]
}

const URL_PREFIX: string = REACT_APP_DEPLOY_ENV === 'pages' ? '/qwerty-learner' : ''

/**
 * 单词里存在 / ? % & ' 空格 é 等文件名和 URL 都不安全的字符，
 * 统一把 [a-z0-9-] 之外的字符编码成 ~xx（十六进制码点）。
 * scripts/build-word-index.mjs 里有一份同样的实现，改动要同步。
 */
function wordFileName(word: string) {
  return word.toLowerCase().replace(/[^a-z0-9-]/g, (c) => `~${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

const detailUrl = (word: string) => withAssetVersion(`/word-details/words/${wordFileName(word)}.json`)

// 详情数据是静态文件，没生成过的词根本不会出现在索引里，取不到时功能静默降级
async function indexFetcher(url: string): Promise<Set<string>> {
  const response = await fetch(URL_PREFIX + url)
  if (!response.ok) return new Set()

  try {
    return new Set((await response.json()) as string[])
  } catch {
    return new Set()
  }
}

async function detailFetcher(url: string): Promise<WordDetail | null> {
  const response = await fetch(URL_PREFIX + url)
  if (!response.ok) return null

  try {
    return (await response.json()) as WordDetail
  } catch {
    return null
  }
}

/** 已生成详情的单词清单，整站只拉一次，用来判断某个词要不要发请求 */
function useWordDetailIndex() {
  const { data } = useSWRImmutable(withAssetVersion('/word-details/index.json'), indexFetcher)
  return data
}

/**
 * 章节加载时预取本章单词的详情，等用户拼完单词时数据已就绪。
 * 详情按单词组织、与词库无关，所以雅思的各个变种词库、以及复习模式都能命中同一份数据。
 */
export function usePrefetchWordDetails(words: Word[]) {
  const index = useWordDetailIndex()
  const names = useMemo(() => words.map((word) => word.name), [words])

  useEffect(() => {
    if (!index) return

    names.forEach((name) => {
      if (index.has(name.toLowerCase())) preload(detailUrl(name), detailFetcher)
    })
  }, [index, names])
}

export function useWordDetail(wordName?: string): WordDetail | undefined {
  const index = useWordDetailIndex()
  const covered = wordName !== undefined && index !== undefined && index.has(wordName.toLowerCase())

  const { data } = useSWRImmutable(covered && wordName ? detailUrl(wordName) : null, detailFetcher)

  if (!data?.sentences?.length && !data?.phrases?.length) return undefined

  return data
}
