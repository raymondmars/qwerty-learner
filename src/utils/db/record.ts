import { getUTCUnixTimestamp } from '../index'
import type { Word } from '@/typings'

export interface IWordRecord {
  word: string
  timeStamp: number
  // 正常章节为 dictKey, 其他功能则为对应的类型
  dict: string
  // 用户可能是在 错题/其他类似组件中 进行的练习则为 null, start from 0
  chapter: number | null
  // 正确次数中输入每个字母的时间差，可以据此计算出总时间
  timing: number[]
  // 出错的次数
  wrongCount: number
  // 每个字母被错误输入成什么, index 为字母的索引, 数组内为错误的 e.key
  mistakes: LetterMistakes
  /**
   * 从「这个词变成可输入」到「敲下第一个键」的毫秒数 —— 检索延迟。
   *
   * 只采集，暂不参与任何判定。现有的「犹豫」判定（SRS 评级和章末重测）用的是
   * timing 里的字母间隔，那测的是打字流畅度而不是检索延迟：字母间隔主要由双字母
   * 组合的手型和左右手交替决定，而且 <=5 字母的词只有 <=4 个间隔，均值噪声很大。
   * 首击延迟才是记忆强度的直接行为指标，但它自己也有噪声（默写模式下包含读中文
   * 释义的时间，用户走神会制造假的长延迟），所以先攒真实数据，验证它确实比字母
   * 间隔更能预测「下次会不会拼错」，再决定要不要切换判定依据。
   *
   * 刻意存原始值不做截断：离群值怎么处理是分析阶段的事，写入时截断会丢掉信息。
   * 老记录没有这个字段，读取方要能容忍 undefined。
   */
  timeToFirstKey?: number
}

export interface LetterMistakes {
  // 每个字母被错误输入成什么, index 为字母的索引, 数组内为错误的 e.key
  [index: number]: string[]
}

export class WordRecord implements IWordRecord {
  word: string
  timeStamp: number
  dict: string
  chapter: number | null
  timing: number[]
  wrongCount: number
  mistakes: LetterMistakes
  timeToFirstKey?: number

  constructor(
    word: string,
    dict: string,
    chapter: number | null,
    timing: number[],
    wrongCount: number,
    mistakes: LetterMistakes,
    timeToFirstKey?: number,
  ) {
    this.word = word
    this.timeStamp = getUTCUnixTimestamp()
    this.dict = dict
    this.chapter = chapter
    this.timing = timing
    this.wrongCount = wrongCount
    this.mistakes = mistakes
    this.timeToFirstKey = timeToFirstKey
  }

  get totalTime() {
    return this.timing.reduce((acc, curr) => acc + curr, 0)
  }
}

export interface IChapterRecord {
  // 正常章节为 dictKey, 其他功能则为对应的类型
  dict: string
  // 在错题场景中为 -1
  chapter: number | null
  timeStamp: number
  // 单位为 s，章节的记录没必要到毫秒级
  time: number
  // 正确按键次数，输对一个字母即记录
  correctCount: number
  // 错误的按键次数，每敲错一个字母记一次
  wrongCount: number
  // 用户输入的单词总数，可能会使用循环等功能使输入总数大于 20
  wordCount: number
  // 一次打对未犯错的单词列表, 可以和 wordNumber 对比得出出错的单词 indexes
  correctWordIndexes: number[]
  // 章节总单词数
  wordNumber: number
  // 单词 record 的 id 列表
  wordRecordIds: number[]
}

export class ChapterRecord implements IChapterRecord {
  dict: string
  chapter: number | null
  timeStamp: number
  time: number
  correctCount: number
  wrongCount: number
  wordCount: number
  correctWordIndexes: number[]
  wordNumber: number
  wordRecordIds: number[]

  constructor(
    dict: string,
    chapter: number | null,
    time: number,
    correctCount: number,
    wrongCount: number,
    wordCount: number,
    correctWordIndexes: number[],
    wordNumber: number,
    wordRecordIds: number[],
  ) {
    this.dict = dict
    this.chapter = chapter
    this.timeStamp = getUTCUnixTimestamp()
    this.time = time
    this.correctCount = correctCount
    this.wrongCount = wrongCount
    this.wordCount = wordCount
    this.correctWordIndexes = correctWordIndexes
    this.wordNumber = wordNumber
    this.wordRecordIds = wordRecordIds
  }

  get wpm() {
    return Math.round((this.wordCount / this.time) * 60)
  }

  get inputAccuracy() {
    const total = this.correctCount + this.wrongCount
    return total === 0 ? 0 : Math.round((this.correctCount / total) * 100)
  }

  get wordAccuracy() {
    return Math.round((this.correctWordIndexes.length / this.wordNumber) * 100)
  }
}

/**
 * 一个单词的间隔重复状态。按单词存、不分词库 —— 记住了就是记住了，
 * 在雅思库里练熟的 analyse 换到 Year 9 库里同样不需要马上复习。
 * 调度算法见 src/utils/spacedRepetition.ts。
 */
export interface IWordReviewState {
  id?: number
  /** 统一小写，同一个词在不同词库里大小写可能不一致 */
  word: string
  /** 连续答对次数，答错归零 */
  repetitions: number
  /** 当前间隔，单位天 */
  intervalDays: number
  easeFactor: number
  /** 累计答错次数 */
  lapses: number
  /** 到期时间，UTC 秒，已压到当天零点 */
  dueTimestamp: number
  lastReviewedAt: number
}

export interface IReviewRecord {
  id?: number
  dict: string
  // 当前练习进度
  index: number
  // 创建时间
  createTime: number
  // 是否已经完成
  isFinished: boolean
  // 单词列表, 根据复习算法生成和修改，可能会有重复值
  words: Word[]
}

export class ReviewRecord implements IReviewRecord {
  id?: number
  dict: string
  index: number
  createTime: number
  isFinished: boolean
  words: Word[]

  constructor(dict: string, words: Word[]) {
    this.dict = dict
    this.index = 0
    this.createTime = getUTCUnixTimestamp()
    this.words = words
    this.isFinished = false
  }
}

export interface IRevisionDictRecord {
  dict: string
  revisionIndex: number
  createdTime: number
}

export class RevisionDictRecord implements IRevisionDictRecord {
  dict: string
  revisionIndex: number
  createdTime: number

  constructor(dict: string, revisionIndex: number, createdTime: number) {
    this.dict = dict
    this.revisionIndex = revisionIndex
    this.createdTime = createdTime
  }
}

export interface IRevisionWordRecord {
  word: string
  timeStamp: number
  dict: string
  errorCount: number
}

export class RevisionWordRecord implements IRevisionWordRecord {
  word: string
  timeStamp: number
  dict: string
  errorCount: number

  constructor(word: string, dict: string, errorCount: number) {
    this.word = word
    this.timeStamp = getUTCUnixTimestamp()
    this.dict = dict
    this.errorCount = errorCount
  }
}
