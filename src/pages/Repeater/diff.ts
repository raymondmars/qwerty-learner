/**
 * 听写稿与原文的词级比对。
 * 用 LCS 求出最长公共子序列，两侧不匹配的片段按位置配对：
 * 形近的算「拼错」，多出来的算「多写」，缺掉的算「漏听」。
 */

export type DiffOpType = 'equal' | 'wrong' | 'extra' | 'missing'

export type DiffOp = {
  type: DiffOpType
  /** 用户写的词，missing 时没有 */
  user?: string
  /** 原文里的词，extra 时没有 */
  ref?: string
}

export type DiffResult = {
  ops: DiffOp[]
  refCount: number
  equalCount: number
  wrongCount: number
  extraCount: number
  missingCount: number
  /** 命中率，原文为空时为 0 */
  accuracy: number
}

type Token = { raw: string; norm: string }

/** 归一化：转小写，去掉首尾标点，保留词内的连字符与撇号 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .replace(/[‘’]/g, "'")
}

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .filter((raw) => raw.length > 0)
    .map((raw) => ({ raw, norm: normalize(raw) }))
    .filter((token) => token.norm.length > 0)
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = temp
    }
  }
  return prev[b.length]
}

/** 判断两个词是不是同一个词的拼写差异，而不是两个不相干的词 */
function isTypo(user: string, ref: string): boolean {
  const tolerance = Math.max(1, Math.floor(Math.max(user.length, ref.length) / 3))
  return levenshtein(user, ref) <= tolerance
}

/** 标准 LCS 表，token 数量在听写场景下不会大到需要优化 */
function lcsTable(a: Token[], b: Token[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i].norm === b[j].norm ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

/** 把一段不匹配的两侧词按位置配对：形近的算拼错，剩下的各归多写与漏听 */
function pairUp(userWords: string[], userNorms: string[], refWords: string[], refNorms: string[]): DiffOp[] {
  const ops: DiffOp[] = []
  const paired = Math.min(userWords.length, refWords.length)
  for (let i = 0; i < paired; i++) {
    if (isTypo(userNorms[i], refNorms[i])) {
      ops.push({ type: 'wrong', user: userWords[i], ref: refWords[i] })
    } else {
      // 完全不相干的两个词，拆成一次多写和一次漏听更贴近事实
      ops.push({ type: 'extra', user: userWords[i] })
      ops.push({ type: 'missing', ref: refWords[i] })
    }
  }
  for (let i = paired; i < userWords.length; i++) ops.push({ type: 'extra', user: userWords[i] })
  for (let i = paired; i < refWords.length; i++) ops.push({ type: 'missing', ref: refWords[i] })
  return ops
}

export function diffDictation(userText: string, refText: string): DiffResult {
  const user = tokenize(userText)
  const ref = tokenize(refText)
  const table = lcsTable(user, ref)

  // 第一步：沿 LCS 走一遍，只产出 equal / extra / missing
  type RawOp = { type: 'equal' | 'extra' | 'missing'; token: Token; refToken?: Token }
  const raw: RawOp[] = []
  let i = 0
  let j = 0
  while (i < user.length && j < ref.length) {
    if (user[i].norm === ref[j].norm) {
      raw.push({ type: 'equal', token: user[i], refToken: ref[j] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      raw.push({ type: 'extra', token: user[i] })
      i++
    } else {
      raw.push({ type: 'missing', token: ref[j] })
      j++
    }
  }
  while (i < user.length) raw.push({ type: 'extra', token: user[i++] })
  while (j < ref.length) raw.push({ type: 'missing', token: ref[j++] })

  // 第二步：把相邻的 extra / missing 合成一块，再按位置配对，识别出拼错
  const ops: DiffOp[] = []
  let k = 0
  while (k < raw.length) {
    if (raw[k].type === 'equal') {
      ops.push({ type: 'equal', user: raw[k].token.raw, ref: raw[k].refToken?.raw })
      k++
      continue
    }
    const start = k
    while (k < raw.length && raw[k].type !== 'equal') k++
    const block = raw.slice(start, k)
    const extras = block.filter((op) => op.type === 'extra').map((op) => op.token)
    const missings = block.filter((op) => op.type === 'missing').map((op) => op.token)
    ops.push(
      ...pairUp(
        extras.map((t) => t.raw),
        extras.map((t) => t.norm),
        missings.map((t) => t.raw),
        missings.map((t) => t.norm),
      ),
    )
  }

  const equalCount = ops.filter((op) => op.type === 'equal').length
  const wrongCount = ops.filter((op) => op.type === 'wrong').length
  const extraCount = ops.filter((op) => op.type === 'extra').length
  const missingCount = ops.filter((op) => op.type === 'missing').length

  return {
    ops,
    refCount: ref.length,
    equalCount,
    wrongCount,
    extraCount,
    missingCount,
    accuracy: ref.length === 0 ? 0 : Math.round((equalCount / ref.length) * 100),
  }
}
