import { loadTranscript, saveTranscript } from '../audioStore'
import { diffDictation } from '../diff'
import type { RepeaterEngine, RepeaterSnapshot } from '../engine'
import { formatTime } from '../engine'
import styles from '../index.module.css'
import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'repeater-dictation'
const MIN_SHEET_HEIGHT = 272

const FONTS = [
  { key: 'serif', label: '衬线' },
  { key: 'sans', label: '无衬线' },
  { key: 'mono', label: '等宽' },
] as const

type FontKey = (typeof FONTS)[number]['key']

type Props = {
  engine: RepeaterEngine
  snapshot: RepeaterSnapshot
}

const DictationDeck: React.FC<Props> = ({ engine, snapshot }) => {
  const sheetRef = useRef<HTMLTextAreaElement>(null)
  const transcriptInputRef = useRef<HTMLInputElement>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const pendingCaretRef = useRef<number | null>(null)
  const [text, setText] = useState(() => window.localStorage.getItem(STORAGE_KEY) ?? '')
  const [font, setFont] = useState<FontKey>('serif')

  const grow = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.height = 'auto'
    sheet.style.height = `${Math.max(MIN_SHEET_HEIGHT, sheet.scrollHeight)}px`
  }, [])

  // 换字体后行数可能变，重新撑高以保持横格对齐
  useLayoutEffect(() => {
    grow()
  }, [text, font, grow])

  useEffect(() => {
    window.addEventListener('resize', grow)
    return () => window.removeEventListener('resize', grow)
  }, [grow])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, text)
  }, [text])

  // 原文按音频文件名配对，换音频时自动取回该音频对应的原文
  useEffect(() => {
    setShowAnswer(false)
    if (!snapshot.fileName) {
      setTranscript(null)
      return
    }
    let cancelled = false
    loadTranscript(snapshot.fileName).then((stored) => {
      if (!cancelled) setTranscript(stored)
    })
    return () => {
      cancelled = true
    }
  }, [snapshot.fileName])

  // 听写内容被清空后对答案已无意义，此时「收起答案」按钮会被禁用，必须自动收起
  useEffect(() => {
    if (!text.trim()) setShowAnswer(false)
  }, [text])

  // 只在面板展开时才比对：LCS 的表是 O(听写词数 × 原文词数)，
  // 若跟着 text 每次击键都算，长稿子下会拖慢打字
  const diff = useMemo(() => (showAnswer && transcript ? diffDictation(text, transcript) : null), [showAnswer, text, transcript])

  const handlePickTranscript = async (file: File) => {
    const content = await file.text()
    setTranscript(content)
    if (snapshot.fileName) saveTranscript(snapshot.fileName, content)
  }

  // 插入时间码后把光标放回时间码的后面
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current
    const sheet = sheetRef.current
    if (caret == null || !sheet) return
    pendingCaretRef.current = null
    sheet.focus()
    sheet.selectionStart = sheet.selectionEnd = caret
  }, [text])

  const handleStamp = () => {
    const sheet = sheetRef.current
    if (!sheet) return
    const tag = `[${formatTime(engine.audio.currentTime)}] `
    const start = sheet.selectionStart
    const end = sheet.selectionEnd
    pendingCaretRef.current = start + tag.length
    setText((old) => old.slice(0, start) + tag + old.slice(end))
  }

  const handleExport = () => {
    if (!text.trim()) return
    const name = (snapshot.fileName || 'dictation').replace(/\.[^.]+$/, '')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}-听写.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const handleWipe = () => {
    if (text && !window.confirm('清空听写内容？此操作无法撤销。')) return
    setText('')
    sheetRef.current?.focus()
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <section className={styles.deck}>
      <div className={`${styles.row} ${styles.head}`}>
        <div>
          <div className={styles.mark}>
            听写本<span>·</span>DICTATION
          </div>
          <div className={styles.sub}>esc 播放 / 暂停 · 打字时快捷键加 ⌘ / ctrl</div>
        </div>
        <div className={styles.tools}>
          <div className={styles.seg}>
            {FONTS.map((item) => (
              <button key={item.key} className={styles.btn} data-on={font === item.key ? '1' : '0'} onClick={() => setFont(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          <button className={styles.btn} onClick={handleStamp}>
            插入时间码
          </button>
        </div>
      </div>

      <div className={`${styles.row} ${styles.sheetRow}`}>
        <textarea
          ref={sheetRef}
          className={styles.sheet}
          data-font={font}
          spellCheck={false}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在这里边听边写。全局快捷键在光标离开输入框时生效；正在打字时用 Esc 播放/暂停，⌘/Ctrl + ← → 退进 3 秒，⌘/Ctrl + ↑ ↓ 上下一句。"
        />
      </div>

      <div className={`${styles.row} ${styles.padFoot}`}>
        <div className={styles.tally}>
          <b>{words}</b> 词 · <b>{text.length}</b> 字符
        </div>
        <div className={styles.right}>
          <button className={styles.btn} onClick={() => transcriptInputRef.current?.click()} disabled={!snapshot.loaded}>
            {transcript ? '更换原文' : '载入原文'}
          </button>
          <button
            className={styles.btn}
            data-on={showAnswer ? '1' : '0'}
            disabled={!transcript || !text.trim()}
            onClick={() => setShowAnswer((old) => !old)}
          >
            {showAnswer ? '收起答案' : '对答案'}
          </button>
          <input
            ref={transcriptInputRef}
            type="file"
            accept=".txt,.md,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handlePickTranscript(file)
              e.target.value = ''
            }}
          />
          <button className={styles.btn} onClick={handleExport}>
            导出 txt
          </button>
          <button className={styles.btn} onClick={handleWipe}>
            清空
          </button>
        </div>
      </div>

      {showAnswer && diff && (
        <div className={styles.row}>
          <div className={styles.answerStats}>
            <span className={styles.acc}>{diff.accuracy}%</span>
            <span>
              命中 <b>{diff.equalCount}</b> / {diff.refCount} 词
            </span>
            <span>
              漏听 <b>{diff.missingCount}</b>
            </span>
            <span>
              拼错 <b>{diff.wrongCount}</b>
            </span>
            <span>
              多写 <b>{diff.extraCount}</b>
            </span>
          </div>
          <div className={styles.answerCols}>
            <div className={styles.answerCol}>
              <div className={styles.answerColTitle}>你的听写</div>
              <div className={styles.answerText}>
                {diff.ops
                  .filter((op) => op.type !== 'missing')
                  .map((op, index) => (
                    <span key={index} className={op.type === 'wrong' ? styles.tokWrong : op.type === 'extra' ? styles.tokExtra : undefined}>
                      {op.user}
                      {op.type === 'wrong' && <i className={styles.fix}>{op.ref}</i>}{' '}
                    </span>
                  ))}
              </div>
            </div>
            <div className={styles.answerCol}>
              <div className={styles.answerColTitle}>原文 · 高亮为漏听</div>
              <div className={styles.answerText}>
                {diff.ops
                  .filter((op) => op.type !== 'extra')
                  .map((op, index) => (
                    <span key={index} className={op.type === 'missing' ? styles.tokMissing : undefined}>
                      {op.ref}{' '}
                    </span>
                  ))}
              </div>
            </div>
          </div>
          <div className={styles.answerHint} style={{ marginTop: 12 }}>
            比对忽略大小写、标点与多余空白；形近的词判为拼错并在后面给出正确拼写
          </div>
        </div>
      )}

      <div className={`${styles.row} ${styles.legend}`}>
        <div>
          <kbd>Esc</kbd>播放 / 暂停
        </div>
        <div>
          <kbd>⌘/Ctrl</kbd>
          <kbd>←</kbd>
          <kbd>→</kbd>退 / 进 3 秒
        </div>
        <div>
          <kbd>⌘/Ctrl</kbd>
          <kbd>↑</kbd>
          <kbd>↓</kbd>上 / 下一句
        </div>
        <div>
          <kbd>⌘/Ctrl</kbd>
          <kbd>↵</kbd>重播本句
        </div>
        <div>内容自动保存在本机浏览器 · 换设备请先导出</div>
      </div>
    </section>
  )
}

export default DictationDeck
