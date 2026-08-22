import clamp from '@/utils/clamp'

export type WaveStatus = 'idle' | 'decoding' | 'ready' | 'nowave'

export type VoiceSegment = { s: number; e: number }

export type RepeaterSnapshot = {
  fileName: string
  loaded: boolean
  waveStatus: WaveStatus
  /** 波形上层的提示浮层是否可见 */
  showNotice: boolean
  isPlaying: boolean
  duration: number
  a: number | null
  b: number | null
  passes: number
  /** 每完成一次复读自增，仅用于触发计数器的动画 */
  passTick: number
  limit: number
  dictSec: number
  grain: number
  autoLoop: boolean
  rate: number
  segCount: number
}

const INITIAL_SNAPSHOT: RepeaterSnapshot = {
  fileName: '',
  loaded: false,
  waveStatus: 'idle',
  showNotice: true,
  isPlaying: false,
  duration: 0,
  a: null,
  b: null,
  passes: 0,
  passTick: 0,
  limit: 0,
  dictSec: 0,
  grain: 0.55,
  autoLoop: false,
  rate: 1,
  segCount: 0,
}

/** 单个音频文件解码后的采样上限，过大的文件直接跳过波形绘制 */
const MAX_DECODE_SIZE = 90 * 1024 * 1024
/** 波形柱子的数量 */
const PEAK_BINS = 1400
/** RMS 包络的帧长，用于识别人声段落 */
const ENVELOPE_HOP_SEC = 0.05
/** 一段人声至少要有这么长，避免把咳嗽、翻页声当成一句 */
const MIN_SEGMENT_SEC = 0.35

/**
 * 复读机的播放引擎，独立于 React 之外：
 * 离散状态通过 subscribe / getSnapshot 交给 useSyncExternalStore，
 * 每帧变化的播放进度、波形数据则由 subscribeTick 直接读取，避免逐帧重渲染。
 */
export class RepeaterEngine {
  readonly audio: HTMLAudioElement
  peaks: Float32Array | null = null
  segs: VoiceSegment[] = []

  private snapshot: RepeaterSnapshot = INITIAL_SNAPSHOT
  private listeners = new Set<() => void>()
  private tickListeners = new Set<() => void>()
  private envelope: Float32Array | null = null
  private hopSec = ENVELOPE_HOP_SEC
  private objectURL: string | null = null
  private noticeTimer: ReturnType<typeof setTimeout> | null = null
  private rafId = 0
  /** 组件卸载后置位，StrictMode 下用来判断是否需要重建引擎 */
  destroyed = false
  /** 听写暂停的计时起点 */
  private segStart = 0

  constructor() {
    const audio = new Audio()
    // 变速不变调，慢放时人声才不会失真
    audio.preservesPitch = true
    ;(audio as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = true
    ;(audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true
    this.audio = audio

    audio.addEventListener('play', this.handlePlay)
    audio.addEventListener('pause', this.handlePause)
    audio.addEventListener('loadedmetadata', this.handleMetadata)
  }

  /** 启动引擎主循环，重复调用无副作用 */
  start() {
    if (this.rafId) return
    this.rafId = requestAnimationFrame(this.frame)
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.audio.removeEventListener('play', this.handlePlay)
    this.audio.removeEventListener('pause', this.handlePause)
    this.audio.removeEventListener('loadedmetadata', this.handleMetadata)
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    if (this.objectURL) URL.revokeObjectURL(this.objectURL)
    this.listeners.clear()
    this.tickListeners.clear()
  }

  /* ---------- 订阅 ---------- */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  /** 每帧回调，用于绘制波形与刷新计时器 */
  subscribeTick = (listener: () => void) => {
    this.tickListeners.add(listener)
    return () => {
      this.tickListeners.delete(listener)
    }
  }

  private patch(next: Partial<RepeaterSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((listener) => listener())
  }

  private handlePlay = () => this.patch({ isPlaying: true })
  private handlePause = () => this.patch({ isPlaying: false })
  private handleMetadata = () => {
    // 载入新资源会把播放速率重置回 1，这里恢复用户设定的语速
    this.audio.playbackRate = this.snapshot.rate
    this.patch({ duration: this.audio.duration })
  }

  /* ---------- 载入音频 ---------- */
  load(file: File) {
    if (this.objectURL) URL.revokeObjectURL(this.objectURL)
    if (this.noticeTimer) clearTimeout(this.noticeTimer)

    this.objectURL = URL.createObjectURL(file)
    this.audio.src = this.objectURL
    this.audio.load()
    this.audio.playbackRate = this.snapshot.rate

    this.peaks = null
    this.envelope = null
    this.segs = []
    this.segStart = 0

    this.patch({
      fileName: file.name,
      loaded: true,
      waveStatus: 'decoding',
      showNotice: true,
      duration: 0,
      a: null,
      b: null,
      passes: 0,
      segCount: 0,
    })

    this.buildWave(file)
  }

  private async buildWave(file: File) {
    const OAC =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    if (!OAC || file.size > MAX_DECODE_SIZE) {
      this.noWave()
      return
    }

    try {
      const buf = await file.arrayBuffer()
      let ac: OfflineAudioContext
      try {
        ac = new OAC(1, 1, 8000)
      } catch (err) {
        ac = new OAC(1, 1, 44100)
      }
      const ab = await ac.decodeAudioData(buf)

      const data = ab.getChannelData(0)
      const step = Math.floor(data.length / PEAK_BINS) || 1
      const out = new Float32Array(PEAK_BINS)
      let max = 0.0001
      for (let i = 0; i < PEAK_BINS; i++) {
        const s = i * step
        const e = Math.min(s + step, data.length)
        let m = 0
        // 每两个采样取一次，够画波形又省一半时间
        for (let j = s; j < e; j += 2) {
          const v = data[j] < 0 ? -data[j] : data[j]
          if (v > m) m = v
        }
        out[i] = m
        if (m > max) max = m
      }
      for (let k = 0; k < PEAK_BINS; k++) out[k] = out[k] / max
      this.peaks = out

      // 高分辨率 RMS 包络（50ms 一帧），用于识别人声段落
      const sr = ab.sampleRate
      const hop = Math.max(1, Math.round(sr * ENVELOPE_HOP_SEC))
      const frameCount = Math.floor(data.length / hop)
      const env = new Float32Array(frameCount)
      for (let a = 0; a < frameCount; a++) {
        const s = a * hop
        let sum = 0
        for (let b = s; b < s + hop; b++) sum += data[b] * data[b]
        env[a] = Math.sqrt(sum / hop)
      }
      this.envelope = env
      this.hopSec = hop / sr

      this.segment()
      this.patch({ waveStatus: 'ready', showNotice: false })
    } catch (err) {
      this.noWave()
    }
  }

  private noWave() {
    this.peaks = null
    this.envelope = null
    this.segs = []
    this.patch({ waveStatus: 'nowave', showNotice: true, segCount: 0 })
    this.noticeTimer = setTimeout(() => this.patch({ showNotice: false }), 1600)
  }

  /* ---------- 人声段识别 ---------- */
  private segment() {
    const envelope = this.envelope
    if (!envelope || !envelope.length) {
      this.segs = []
      this.patch({ segCount: 0 })
      return
    }

    // 用分位数估底噪与人声峰值，对不同录音的音量差异更稳
    const sorted = Float32Array.prototype.slice.call(envelope).sort()
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
    const noise = q(0.2)
    const peak = q(0.95)
    const thr = noise + Math.max(0.15 * (peak - noise), 0.02 * peak)

    const grain = this.snapshot.grain
    const out: Array<[number, number]> = []
    let st: number | null = null
    let gap = 0
    let i = 0
    for (; i < envelope.length; i++) {
      if (envelope[i] > thr) {
        if (st === null) st = i
        gap = 0
      } else if (st !== null) {
        gap++
        if (gap * this.hopSec > grain) {
          const en = i - gap
          if ((en - st) * this.hopSec >= MIN_SEGMENT_SEC) out.push([st * this.hopSec, en * this.hopSec])
          st = null
          gap = 0
        }
      }
    }
    if (st !== null && (envelope.length - gap - st) * this.hopSec >= MIN_SEGMENT_SEC) {
      out.push([st * this.hopSec, (envelope.length - gap) * this.hopSec])
    }

    const dur = this.audio.duration || Infinity
    // 前后各留一点余量，避免切掉句首辅音和句尾尾音
    this.segs = out.map(([s, e]) => ({ s: Math.max(0, s - 0.15), e: Math.min(dur, e + 0.25) }))
    this.patch({ segCount: this.segs.length })
  }

  private goSeg(index: number) {
    if (!this.segs.length) return
    const seg = this.segs[clamp(index, 0, this.segs.length - 1)]
    this.audio.currentTime = seg.s
    this.segStart = seg.s
    if (this.snapshot.autoLoop) {
      this.patch({ a: seg.s, b: seg.e, passes: 0 })
    }
  }

  nextSeg = () => {
    const t = this.audio.currentTime
    let i = 0
    while (i < this.segs.length && this.segs[i].s <= t + 0.25) i++
    this.goSeg(i < this.segs.length ? i : this.segs.length - 1)
  }

  prevSeg = () => {
    const t = this.audio.currentTime
    let i = this.segs.length - 1
    while (i >= 0 && this.segs[i].s >= t - 0.5) i--
    this.goSeg(i >= 0 ? i : 0)
  }

  /** 雅思每节开头是 narrator 指令 + 一段留给看题的长静音，正文就在最长的那个静音之后 */
  toBody = () => {
    if (!this.segs.length) return
    let best = 0
    let bestGap = 0
    for (let i = 1; i < this.segs.length && this.segs[i].s < 240; i++) {
      const gap = this.segs[i].s - this.segs[i - 1].e
      if (gap > bestGap) {
        bestGap = gap
        best = i
      }
    }
    this.goSeg(bestGap > 2 ? best : 0)
  }

  /* ---------- 走带 ---------- */
  play = () => {
    if (!this.snapshot.loaded) return
    this.audio.play().catch(() => undefined)
    this.segStart = this.audio.currentTime
  }

  toggle = () => {
    if (!this.snapshot.loaded) return
    this.audio.paused ? this.play() : this.audio.pause()
  }

  nudge = (sec: number) => {
    if (!this.snapshot.loaded) return
    this.audio.currentTime = clamp(this.audio.currentTime + sec, 0, this.audio.duration || 0)
    this.segStart = this.audio.currentTime
  }

  replay = () => {
    if (!this.snapshot.loaded) return
    this.audio.currentTime = this.snapshot.a != null ? this.snapshot.a : Math.max(0, this.audio.currentTime - 5)
    this.segStart = this.audio.currentTime
    this.patch({ passes: 0 })
    this.play()
  }

  seek = (time: number) => {
    if (!this.snapshot.loaded) return
    this.audio.currentTime = clamp(time, 0, this.audio.duration || 0)
    this.segStart = this.audio.currentTime
  }

  /* ---------- A / B ---------- */
  setA = () => {
    if (!this.snapshot.loaded) return
    const a = this.audio.currentTime
    const b = this.snapshot.b != null && this.snapshot.b <= a ? null : this.snapshot.b
    this.patch({ a, b, passes: 0 })
  }

  setB = () => {
    if (!this.snapshot.loaded) return
    const b = this.audio.currentTime
    const a = this.snapshot.a != null && this.snapshot.a >= b ? null : this.snapshot.a
    this.patch({ a, b, passes: 0 })
  }

  setRange = (a: number, b: number) => {
    this.patch({ a, b, passes: 0 })
  }

  clearRange = () => {
    this.patch({ a: null, b: null, passes: 0 })
  }

  /* ---------- 参数 ---------- */
  setGrain = (grain: number) => {
    this.patch({ grain })
    this.segment()
  }

  setLimit = (limit: number) => {
    this.patch({ limit, passes: 0 })
  }

  setDictSec = (dictSec: number) => {
    this.patch({ dictSec })
    this.segStart = this.audio.currentTime
  }

  toggleAutoLoop = () => {
    this.patch({ autoLoop: !this.snapshot.autoLoop })
  }

  setRate = (rate: number) => {
    const next = clamp(rate, 0.5, 1.5)
    this.audio.playbackRate = next
    this.patch({ rate: next })
  }

  bumpRate = (delta: number) => {
    // 滑杆以 5% 为一档，先还原成整数再加减，避免浮点误差累积
    this.setRate(clamp(Math.round(this.snapshot.rate * 100) + delta, 50, 150) / 100)
  }

  /* ---------- 引擎主循环 ---------- */
  private frame = () => {
    const t = this.audio.currentTime
    const { a, b, limit, dictSec, passes } = this.snapshot

    if (a != null && b != null && !this.audio.paused && t >= b - 0.015) {
      const nextPasses = passes + 1
      this.patch({ passes: nextPasses, passTick: this.snapshot.passTick + 1 })
      this.audio.currentTime = a
      this.segStart = a
      if (limit && nextPasses >= limit) this.audio.pause()
    }

    if (dictSec && !this.audio.paused && t - this.segStart >= dictSec) {
      this.audio.pause()
      this.segStart = t
    }

    this.tickListeners.forEach((listener) => listener())
    this.rafId = requestAnimationFrame(this.frame)
  }
}

/** 把秒数格式化为 mm:ss 或 mm:ss.f */
export function formatTime(t: number, showMs = false) {
  if (!isFinite(t)) return showMs ? '00:00.0' : '--:--'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return showMs ? `${base}.${Math.floor((t % 1) * 10)}` : base
}
