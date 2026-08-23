import { loadTranscript, saveTranscript } from '../audioStore'
import type { RepeaterEngine, RepeaterSnapshot } from '../engine'
import { formatTime } from '../engine'
import styles from '../index.module.css'
import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

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
            disabled={!transcript}
            onClick={() => setShowAnswer((old) => !old)}
          >
            {showAnswer ? '收起原文' : '对答案'}
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
          <button className={styles.btn} onClick={handleWipe}>
            清空
          </button>
        </div>
      </div>

      {showAnswer && transcript && (
        <div className={styles.row}>
          <div className={styles.answerColTitle}>原文</div>
          <div className={styles.answerText}>{transcript}</div>
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
        <div>内容自动保存在本机浏览器 · 需要留存请自行复制</div>
      </div>
    </section>
  )
}

export default DictationDeck
