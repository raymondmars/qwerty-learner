export const EXPLICIT_SPACE = '␣'

export const CHAPTER_LENGTH = 20

export const DISMISS_START_CARD_DATE_KEY = 'dismissStartCardDate'

export const DONATE_DATE = 'donateDate'

export const CONFETTI_DEFAULTS = {
  colors: ['#5D8C7B', '#F2D091', '#F2A679', '#D9695F', '#8C4646'],
  shapes: ['square'],
  ticks: 500,
} as confetti.Options

// 单词拼写全对时的彩带。canvas-confetti 只认 hex，这里是设计稿那组 oklch 的等价色
export const WORD_CONFETTI_DEFAULTS = {
  colors: ['#846cf0', '#00bac5', '#42c070', '#ecbe24', '#f75c66'],
  shapes: ['square'],
  ticks: 200,
  scalar: 0.9,
  gravity: 1.1,
  decay: 0.92,
} as confetti.Options

export const defaultFontSizeConfig = {
  foreignFont: 48,
  translateFont: 18,
}
