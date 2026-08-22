import type { RepeaterEngine, RepeaterSnapshot } from '../engine'
import { formatTime } from '../engine'
import styles from '../index.module.css'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  engine: RepeaterEngine
  snapshot: RepeaterSnapshot
}

const Meter: React.FC<Props> = ({ engine, snapshot }) => {
  const [time, setTime] = useState('00:00.0')
  const passesRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      engine.subscribeTick(() => {
        const next = formatTime(engine.audio.currentTime, true)
        // 计时器精确到 0.1 秒，只有显示真的变了才触发一次渲染
        setTime((old) => (old === next ? old : next))
      }),
    [engine],
  )

  useEffect(() => {
    const el = passesRef.current
    if (!el || snapshot.passTick === 0) return
    el.classList.remove(styles.tick)
    // 强制回流，让同一个动画能够重新播放
    void el.offsetWidth
    el.classList.add(styles.tick)
  }, [snapshot.passTick])

  const [base, ms] = time.split('.')

  return (
    <div className={styles.meter}>
      <div className={styles.clock}>
        {base}
        <span className={styles.ms}>.{ms}</span>
      </div>
      <div className={styles.total}>/ {snapshot.duration ? formatTime(snapshot.duration) : '--:--'}</div>
      <div className={styles.passes}>
        <div className={styles.k}>复读次数</div>
        <div ref={passesRef} className={styles.v} data-live={snapshot.passes > 0 ? '1' : '0'}>
          {snapshot.passes}
        </div>
      </div>
    </div>
  )
}

export default Meter
