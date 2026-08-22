import { RepeaterEngine } from '../engine'
import type { RepeaterSnapshot } from '../engine'
import { useEffect, useState, useSyncExternalStore } from 'react'

export function useRepeaterEngine(): RepeaterEngine {
  const [engine, setEngine] = useState(() => new RepeaterEngine())

  useEffect(() => {
    // StrictMode 下组件会挂载两次，第一次的清理已经销毁了引擎，这里需要重建一个
    if (engine.destroyed) {
      setEngine(new RepeaterEngine())
      return
    }
    engine.start()
    return () => engine.destroy()
  }, [engine])

  return engine
}

export function useRepeaterSnapshot(engine: RepeaterEngine): RepeaterSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot)
}
