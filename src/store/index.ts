import atomForConfig from './atomForConfig'
import { reviewInfoAtom } from './reviewInfoAtom'
import { DISMISS_START_CARD_DATE_KEY, defaultFontSizeConfig } from '@/constants'
import { idDictionaryMap } from '@/resources/dictionary'
import { correctSoundResources, keySoundResources, wrongSoundResources } from '@/resources/soundResource'
import type { Dictionary, LoopWordTimesOption, PhoneticType, PronunciationType, WordDictationType } from '@/typings'
import type { ReviewRecord } from '@/utils/db/record'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export const currentDictIdAtom = atomWithStorage('currentDict', 'cet4')
export const currentDictInfoAtom = atom<Dictionary>((get) => {
  const id = get(currentDictIdAtom)
  let dict = idDictionaryMap[id]
  // 如果 dict 不存在，则返回 cet4. Typing 中会检查 DictId 是否存在，如果不存在则会重置为 cet4
  if (!dict) {
    dict = idDictionaryMap.cet4
  }
  return dict
})

export const currentChapterAtom = atomWithStorage('currentChapter', 0)

// 普通练习模式下，最后练到的位置。chapter 与 index 均从 0 开始
export type ChapterProgress = {
  chapter: number
  index: number
}

// 每本词典各记录一条，key 为 dictId，用于刷新后恢复练习进度
export const chapterProgressAtom = atomWithStorage<Record<string, ChapterProgress>>('chapterProgress', {})

export const loopWordConfigAtom = atomForConfig<{ times: LoopWordTimesOption }>('loopWordConfig', {
  times: 1,
})

export const keySoundsConfigAtom = atomForConfig('keySoundsConfig', {
  isOpen: true,
  isOpenClickSound: true,
  volume: 1,
  resource: keySoundResources[0],
})

export const hintSoundsConfigAtom = atomForConfig('hintSoundsConfig', {
  isOpen: true,
  volume: 1,
  isOpenWrongSound: true,
  isOpenCorrectSound: true,
  wrongResource: wrongSoundResources[0],
  correctResource: correctSoundResources[0],
})

export const pronunciationConfigAtom = atomForConfig('pronunciation', {
  isOpen: true,
  volume: 1,
  type: 'us' as PronunciationType,
  name: '美音',
  isLoop: false,
  isTransRead: false,
  transVolume: 1,
  rate: 1,
})

export const fontSizeConfigAtom = atomForConfig('fontsize', defaultFontSizeConfig)

export const pronunciationIsOpenAtom = atom((get) => get(pronunciationConfigAtom).isOpen)

export const randomConfigAtom = atomForConfig('randomConfig', {
  isOpen: false,
})

export const isShowPrevAndNextWordAtom = atomWithStorage('isShowPrevAndNextWord', true)

export const isIgnoreCaseAtom = atomWithStorage('isIgnoreCase', true)

export const isShowAnswerOnHoverAtom = atomWithStorage('isShowAnswerOnHover', false)

export const isTextSelectableAtom = atomWithStorage('isTextSelectable', false)

// 开启后单词拼写正确不会自动跳转，而是锁定输入并放大展示，等用户按 Enter 再进入下一个单词
export const isEnterToNextWordAtom = atomWithStorage('isEnterToNextWord', true)

// 单词一次拼对时是否喷彩带
export const isWordConfettiOpenAtom = atomWithStorage('isWordConfettiOpen', true)

/**
 * 每天最多复习多少个词。0 表示不限。
 *
 * 到期的词会积压 —— 停练一周再回来可能有上千个词到期，一次全推给用户只会劝退。
 * 每天固定量比一个吓人的数字更能坚持，Anki 也是这么做的。
 */
export const dailyReviewLimitAtom = atomWithStorage('dailyReviewLimit', 50)

/**
 * 今天已经复习了多少个词。date 是本地日期（YYYY-MM-DD），跨天自动归零。
 *
 * 只统计复习会话里练的词，正常章节练习不占额度 —— 那是学新词，不是还债。
 */
export const dailyReviewProgressAtom = atomWithStorage('dailyReviewProgress', { date: '', count: 0 })

/**
 * 用户敲对相邻字母的平均间隔（毫秒）的滑动均值，作为判断「这次敲得算快还是算慢」的
 * 个人基线。用个人基线而不是绝对毫秒，打字快的人和慢的人才能用同一套判定。
 * 0 表示还没有样本，调用方会退回到一组保守的绝对值。
 */
export const typingBaselineAtom = atomWithStorage('typingBaseline', 0)

// 章节练完后，是否自动把「拼错的」和「拼对但拼得犹豫的」词再测一轮。
// 同一个词在一次练习里被检索两次、中间隔着其他词，比只检索一次记得牢得多
export const isChapterRetestOpenAtom = atomWithStorage('isChapterRetestOpen', true)

export const reviewModeInfoAtom = reviewInfoAtom({
  isReviewMode: false,
  reviewRecord: undefined as ReviewRecord | undefined,
})
export const isReviewModeAtom = atom((get) => get(reviewModeInfoAtom).isReviewMode)

// 音标默认打开：听到读音的同时看到音标，形-音两条通道一起编码，
// 比单独听一遍更容易在脑子里留下稳定的语音表征
export const phoneticConfigAtom = atomForConfig('phoneticConfig', {
  isOpen: true,
  type: 'us' as PhoneticType,
})

export const isOpenDarkModeAtom = atomWithStorage('isOpenDarkModeAtom', window.matchMedia('(prefers-color-scheme: dark)').matches)

// 当前单词已拼写完成、正在等待用户按 Enter 进入下一个单词。
// 用于让 StartButton 上的 Enter（开始/暂停）快捷键在此期间让位
export const isWordWaitingEnterAtom = atom(false)

/**
 * 视频例句弹窗是否打开。
 *
 * 练习页的若干快捷键注册时带了 enableOnFormTags，弹窗盖在上面照样会触发 ——
 * Enter 会把背后的单词直接翻过去，Tab 被 preventDefault 会让弹窗内无法键盘导航。
 * 这些快捷键据此让路。
 */
export const isYouglishOpenAtom = atom(false)

// 当前完成的单词里留有拼错的字母。默写模式下屏幕上显示的是用户敲错的字符，
// 此时即使没有例句词组，也要把详情卡片显示出来，让用户看到正确拼写
export const isWordMistakenAtom = atom(false)

// 当前完成的单词里最终仍然拼错的位置，以及用户在那里实际敲下的字符。
// 详情卡片据此把「正确拼写 + 你错在哪」标出来 —— 拼错时这是最该被读到的反馈，
// 其余内容都要给它让路
export const wordMistakesAtom = atom<{ index: number; typed: string }[]>([])

export const wordDictationConfigAtom = atomForConfig('wordDictationConfig', {
  isOpen: true,
  type: 'hideAll' as WordDictationType,
})

export const dismissStartCardDateAtom = atomWithStorage<Date | null>(DISMISS_START_CARD_DATE_KEY, null)

// for dev test
//   dismissStartCardDateAtom = atom<Date | null>(new Date())
