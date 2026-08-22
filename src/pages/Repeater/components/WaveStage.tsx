import type { RepeaterEngine } from '../engine'
import type { RepeaterSnapshot } from '../engine'
import type { RepeaterTheme } from '../hooks/useRepeaterTheme'
import styles from '../index.module.css'
import clamp from '@/utils/clamp'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  engine: RepeaterEngine
  snapshot: RepeaterSnapshot
  theme: RepeaterTheme
  onPickFile: (file: File) => void
}

const PALETTE_KEYS = ['band', 'w-past', 'w-next', 'w-loop', 'seg', 'playhead', 'amber', 'on-accent'] as const
type PaletteKey = (typeof PALETTE_KEYS)[number]
type Palette = Record<PaletteKey, string>

const WaveStage: React.FC<Props> = ({ engine, snapshot, theme, onPickFile }) => {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paletteRef = useRef<Palette>({} as Palette)
  const pointerDownRef = useRef<number | null>(null)
  const movedRef = useRef(false)
  const [dragOver, setDragOver] = useState(false)

  const readPalette = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const style = getComputedStyle(stage)
    const palette = {} as Palette
    PALETTE_KEYS.forEach((key) => {
      palette[key] = style.getPropertyValue(`--${key}`).trim()
    })
    paletteRef.current = palette
  }, [])

  const draw = useCallback(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!stage || !canvas || !ctx) return

    const { width: W, height: H } = stage.getBoundingClientRect()
    const mid = H / 2
    const { audio, peaks, segs } = engine
    const { a: A, b: B } = engine.getSnapshot()
    const d = audio.duration || 0
    const PAL = paletteRef.current

    ctx.clearRect(0, 0, W, H)
    if (!d) return

    const xA = A != null ? (A / d) * W : null
    const xB = B != null ? (B / d) * W : null
    const xP = (audio.currentTime / d) * W

    if (xA != null && xB != null) {
      ctx.fillStyle = PAL['band']
      ctx.fillRect(xA, 0, xB - xA, H)
    }

    if (peaks) {
      const n = peaks.length
      const bw = W / n
      for (let i = 0; i < n; i++) {
        const x = i * bw
        const h = Math.max(1.2, peaks[i] * (H * 0.44))
        const inLoop = xA != null && xB != null && x >= xA && x <= xB
        ctx.fillStyle = inLoop ? PAL['w-loop'] : x < xP ? PAL['w-past'] : PAL['w-next']
        ctx.fillRect(x, mid - h, Math.max(bw - 0.4, 0.6), h * 2)
      }
    } else {
      ctx.fillStyle = PAL['w-next']
      ctx.fillRect(0, mid - 1, W, 2)
      ctx.fillStyle = PAL['w-past']
      ctx.fillRect(0, mid - 1, xP, 2)
    }

    // 底部的短横线标出识别到的人声段
    for (let i = 0; i < segs.length; i++) {
      const s = (segs[i].s / d) * W
      const e = (segs[i].e / d) * W
      ctx.fillStyle = PAL['seg']
      ctx.fillRect(s, H - 3, Math.max(1.5, e - s), 2)
    }

    const markers: Array<[number | null, 'A' | 'B']> = [
      [xA, 'A'],
      [xB, 'B'],
    ]
    markers.forEach(([x, label]) => {
      if (x == null) return
      ctx.fillStyle = PAL['amber']
      ctx.fillRect(x - 1, 0, 2, H)
      ctx.fillRect(label === 'A' ? x - 1 : x - 15, 0, 16, 15)
      ctx.fillStyle = PAL['on-accent']
      ctx.font = '600 10px "IBM Plex Mono", monospace'
      ctx.fillText(label, label === 'A' ? x + 4 : x - 11, 11)
    })

    ctx.fillStyle = PAL['playhead']
    ctx.fillRect(xP - 0.5, 0, 1.5, H)
  }, [engine])

  const resize = useCallback(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!stage || !canvas || !ctx) return
    const rect = stage.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }, [draw])

  useEffect(() => {
    readPalette()
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [readPalette, resize])

  // 切换明暗后画布用的颜色要重新取一遍
  useEffect(() => {
    readPalette()
    draw()
  }, [theme, readPalette, draw])

  useEffect(() => engine.subscribeTick(draw), [engine, draw])

  const xToTime = useCallback(
    (clientX: number) => {
      const stage = stageRef.current
      if (!stage) return 0
      const rect = stage.getBoundingClientRect()
      return clamp((clientX - rect.left) / rect.width, 0, 1) * (engine.audio.duration || 0)
    },
    [engine],
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!engine.audio.duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerDownRef.current = xToTime(e.clientX)
    movedRef.current = false
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const down = pointerDownRef.current
    if (down == null) return
    const t = xToTime(e.clientX)
    // 拖动超过 0.12 秒才算框选，避免手抖把点击变成一个极短的区间
    if (Math.abs(t - down) > 0.12) {
      movedRef.current = true
      engine.setRange(Math.min(down, t), Math.max(down, t))
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const down = pointerDownRef.current
    if (down == null) return
    if (!movedRef.current) {
      engine.seek(xToTime(e.clientX))
    } else {
      const { a } = engine.getSnapshot()
      if (a != null) engine.seek(a)
    }
    pointerDownRef.current = null
    draw()
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files && e.dataTransfer.files[0]
    if (file) onPickFile(file)
  }

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      tabIndex={0}
      aria-label="音频波形，点击定位，拖动选择复读区间"
      data-drag={dragOver ? '1' : '0'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDragEnter={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} />
      {snapshot.showNotice && (
        <div className={styles.empty}>
          {snapshot.waveStatus === 'idle' && (
            <>
              <b>把音频文件拖进来</b>
              <small>或点击上方「选择音频文件」· mp3 / m4a / wav</small>
              <small>文件只在本机浏览器里播放，不会上传</small>
            </>
          )}
          {snapshot.waveStatus === 'decoding' && <b>读取波形…</b>}
          {snapshot.waveStatus === 'nowave' && <small>波形不可用，播放与复读功能不受影响</small>}
        </div>
      )}
    </div>
  )
}

export default WaveStage
