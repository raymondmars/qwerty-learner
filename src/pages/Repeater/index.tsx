import { loadLastAudio, saveLastAudio } from './audioStore'
import DictationDeck from './components/DictationDeck'
import Meter from './components/Meter'
import WaveStage from './components/WaveStage'
import { formatTime } from './engine'
import { useRepeaterEngine, useRepeaterSnapshot } from './hooks/useRepeaterEngine'
import { useRepeaterFonts } from './hooks/useRepeaterFonts'
import { useRepeaterTheme } from './hooks/useRepeaterTheme'
import styles from './index.module.css'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const GRAINS = [
  { value: 0.3, label: '细 · 分句' },
  { value: 0.55, label: '中' },
  { value: 0.95, label: '粗 · 整段' },
]

const LIMITS = [
  { value: 0, label: '∞' },
  { value: 3, label: '3 次' },
  { value: 5, label: '5 次' },
]

const COMPACT_STORAGE_KEY = 'repeater-compact'

const DICTS = [
  { value: 0, label: '关闭' },
  { value: 5, label: '每 5 秒' },
  { value: 8, label: '每 8 秒' },
  { value: 12, label: '每 12 秒' },
]

const Repeater: React.FC = () => {
  const navigate = useNavigate()
  const engine = useRepeaterEngine()
  const snapshot = useRepeaterSnapshot(engine)
  const { theme, toggleTheme } = useRepeaterTheme()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 从首页新开标签页进来时，会话历史里只有当前这一条记录，这种页面浏览器允许脚本关闭；
  // 直接输网址或从别处跳进来的则仍然走路由跳转，否则会白白多出一个重复的首页标签
  const [closable] = useState(() => window.history.length <= 1)

  // 精简模式：只留计时与波形，隐藏走带与各项参数，听写时眼睛不被干扰
  const [compact, setCompact] = useState(() => window.localStorage.getItem(COMPACT_STORAGE_KEY) === '1')

  const toggleCompact = useCallback(() => {
    setCompact((old) => {
      window.localStorage.setItem(COMPACT_STORAGE_KEY, old ? '0' : '1')
      return !old
    })
  }, [])

  // 用户选择或拖入的音频存一份到 IndexedDB，刷新后自动恢复最近一次
  const pickFile = useCallback(
    (file: File) => {
      engine.load(file)
      saveLastAudio(file)
    },
    [engine],
  )

  useRepeaterFonts()

  useEffect(() => {
    let cancelled = false
    loadLastAudio().then((file) => {
      if (!file || cancelled) return
      // 读 IndexedDB 是异步的，期间用户可能已经自己选了文件，此时不要覆盖
      if (engine.getSnapshot().loaded) return
      engine.load(file)
    })
    return () => {
      cancelled = true
    }
  }, [engine])

  const handleBack = useCallback(() => {
    if (!closable) {
      navigate('/')
      return
    }
    window.close()
    // 浏览器拒绝关闭时退回到跳转，保证这个按钮任何情况下都有响应
    window.setTimeout(() => navigate('/'), 200)
  }, [closable, navigate])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const isTyping = !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)
      const key = e.key.toLowerCase()

      if (isTyping) {
        // 打字时绝不劫持字母和空格，只保留 Esc 与带 ⌘/Ctrl 的组合键
        if (key === 'escape') {
          e.preventDefault()
          engine.toggle()
          return
        }
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return
        const typingMap: Record<string, () => void> = {
          arrowleft: () => engine.nudge(-3),
          arrowright: () => engine.nudge(3),
          arrowup: engine.prevSeg,
          arrowdown: engine.nextSeg,
          '[': engine.prevSeg,
          ']': engine.nextSeg,
          enter: engine.replay,
        }
        if (typingMap[key]) {
          e.preventDefault()
          typingMap[key]()
        }
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return
      const map: Record<string, () => void> = {
        ' ': engine.toggle,
        arrowleft: () => engine.nudge(-3),
        arrowright: () => engine.nudge(3),
        a: engine.setA,
        b: engine.setB,
        x: engine.clearRange,
        r: engine.replay,
        '[': engine.prevSeg,
        ']': engine.nextSeg,
        ',': engine.prevSeg,
        '.': engine.nextSeg,
        arrowup: () => engine.bumpRate(5),
        arrowdown: () => engine.bumpRate(-5),
      }
      if (map[key]) {
        e.preventDefault()
        // 焦点留在刚点过的按钮上会让空格再次触发它，这里主动失焦
        ;(document.activeElement as HTMLElement | null)?.blur()
        map[key]()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [engine])

  const hasRange = snapshot.a != null && snapshot.b != null
  const noSegment = snapshot.segCount === 0

  return (
    <div className={styles.page} data-theme={theme}>
      <div className={styles.stack}>
        <main className={styles.deck}>
          <div className={`${styles.row} ${styles.head}`}>
            <div>
              <div className={styles.mark}>
                复读机<span>·</span>REPEATER
              </div>
              <div className={styles.sub}>english listening / intensive practice</div>
            </div>
            <div className={styles.tools}>
              <button className={styles.btn} onClick={handleBack}>
                {closable ? '✕ 关闭本页' : '← 回到练习'}
              </button>
              <button className={styles.btn} onClick={toggleTheme} aria-pressed={theme === 'light'}>
                {theme === 'light' ? '☾ 夜间' : '☀ 白昼'}
              </button>
              <button className={styles.btn} data-on={compact ? '1' : '0'} onClick={toggleCompact}>
                {compact ? '▾ 展开控制台' : '▴ 精简界面'}
              </button>
              <button className={styles.btn} onClick={() => fileInputRef.current?.click()}>
                选择音频文件
              </button>
            </div>
            <div className={styles.fileName}>{snapshot.fileName || '未载入音频'}</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) pickFile(file)
                // 允许重复选择同一个文件
                e.target.value = ''
              }}
            />
          </div>

          <div className={styles.row}>
            <Meter engine={engine} snapshot={snapshot} />
            <WaveStage engine={engine} snapshot={snapshot} theme={theme} onPickFile={pickFile} />
            <div className={styles.marks}>
              <span>
                A 起点 <i>{snapshot.a != null ? formatTime(snapshot.a) : '--:--'}</i>
              </span>
              <span>
                B 终点 <i>{snapshot.b != null ? formatTime(snapshot.b) : '--:--'}</i>
              </span>
              <span>
                区间长度 <i>{hasRange ? `${((snapshot.b as number) - (snapshot.a as number)).toFixed(1)}s` : '--'}</i>
              </span>
              <span className={styles.cy}>{hasRange ? '循环中：播到 B 自动跳回 A' : '在波形上横向拖动即可框选一句'}</span>
            </div>
          </div>

          {/* 精简模式下从走带开始整段收起，只留计时与波形 */}
          {!compact && (
            <>
              <div className={`${styles.row} ${styles.transport}`}>
                <button className={styles.tbtn} onClick={() => engine.nudge(-3)}>
                  <span className={styles.g}>↺</span>
                  <span className={styles.l}>退 3 秒</span>
                </button>
                <button className={`${styles.tbtn} ${styles.main}`} onClick={engine.toggle}>
                  <span className={styles.g}>{snapshot.isPlaying ? '❚❚' : '▶'}</span>
                  <span className={styles.l}>{snapshot.isPlaying ? '暂停' : '播放'}</span>
                </button>
                <button className={styles.tbtn} onClick={() => engine.nudge(3)}>
                  <span className={styles.g}>↻</span>
                  <span className={styles.l}>进 3 秒</span>
                </button>
                <button className={styles.tbtn} onClick={engine.replay}>
                  <span className={styles.g}>⟲</span>
                  <span className={styles.l}>重播本句</span>
                </button>
              </div>

              <div className={styles.row}>
                <div className={styles.ctl}>
                  <div className={styles.lbl}>跳到人声</div>
                  <div className={styles.seg}>
                    <button className={styles.btn} disabled={noSegment} onClick={engine.prevSeg}>
                      ◂ 上一句
                    </button>
                    <button className={`${styles.btn} ${styles.wide}`} disabled={noSegment} onClick={engine.nextSeg}>
                      下一句 ▸
                    </button>
                    <button className={styles.btn} disabled={noSegment} onClick={engine.toBody}>
                      跳过开头说明
                    </button>
                    <button className={styles.btn} data-on={snapshot.autoLoop ? '1' : '0'} onClick={engine.toggleAutoLoop}>
                      跳句即框选
                    </button>
                  </div>
                  <div className={styles.count}>
                    {snapshot.segCount ? (
                      <>
                        识别到 <b>{snapshot.segCount}</b> 段人声
                      </>
                    ) : snapshot.loaded ? (
                      '未能识别人声段'
                    ) : (
                      '尚未识别'
                    )}
                  </div>
                </div>

                <div className={styles.ctl}>
                  <div className={styles.lbl}>切句粒度</div>
                  <div className={styles.seg}>
                    {GRAINS.map((item) => (
                      <button
                        key={item.value}
                        className={styles.btn}
                        data-on={snapshot.grain === item.value ? '1' : '0'}
                        onClick={() => engine.setGrain(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.ctl}>
                  <div className={styles.lbl}>复读区间</div>
                  <div className={styles.seg}>
                    <button className={styles.btn} onClick={engine.setA}>
                      设 A
                    </button>
                    <button className={styles.btn} onClick={engine.setB}>
                      设 B
                    </button>
                    <button className={styles.btn} onClick={engine.clearRange}>
                      清除
                    </button>
                  </div>
                  <div className={styles.lbl} style={{ minWidth: 'auto', marginLeft: 8 }}>
                    循环上限
                  </div>
                  <div className={styles.seg}>
                    {LIMITS.map((item) => (
                      <button
                        key={item.value}
                        className={styles.btn}
                        data-on={snapshot.limit === item.value ? '1' : '0'}
                        onClick={() => engine.setLimit(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.ctl}>
                  <div className={styles.lbl}>语速</div>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    step={5}
                    value={Math.round(snapshot.rate * 100)}
                    onChange={(e) => engine.setRate(Number(e.target.value) / 100)}
                  />
                  <div className={styles.spd}>{snapshot.rate.toFixed(2)}×</div>
                  <button className={styles.btn} onClick={() => engine.setRate(1)}>
                    复位
                  </button>
                </div>

                <div className={styles.ctl}>
                  <div className={styles.lbl}>听写暂停</div>
                  <div className={styles.seg}>
                    {DICTS.map((item) => (
                      <button
                        key={item.value}
                        className={styles.btn}
                        data-on={snapshot.dictSec === item.value ? '1' : '0'}
                        onClick={() => engine.setDictSec(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`${styles.row} ${styles.legend}`}>
                <div>
                  <kbd>空格</kbd>播放 / 暂停
                </div>
                <div>
                  <kbd>←</kbd>
                  <kbd>→</kbd>退 / 进 3 秒
                </div>
                <div>
                  <kbd>A</kbd>
                  <kbd>B</kbd>设起点 / 终点
                </div>
                <div>
                  <kbd>[</kbd>
                  <kbd>]</kbd>上 / 下一句人声
                </div>
                <div>
                  <kbd>R</kbd>重播本句
                </div>
                <div>
                  <kbd>X</kbd>清除区间
                </div>
                <div>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd>加速 / 减速
                </div>
              </div>
            </>
          )}
        </main>

        <DictationDeck engine={engine} snapshot={snapshot} />
      </div>
    </div>
  )
}

export default Repeater
