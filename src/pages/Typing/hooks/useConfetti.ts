import { CONFETTI_DEFAULTS, WORD_CONFETTI_DEFAULTS } from '@/constants'
import confetti from 'canvas-confetti'
import { useEffect } from 'react'

// 单词拼写全对时的三点位喷射：中心一束大的，左右两侧各补一束
const WORD_BURSTS = [
  { particleCount: 90, startVelocity: 30, origin: { x: 0.5, y: 0.42 } },
  { particleCount: 45, startVelocity: 24, origin: { x: 0.18, y: 0.55 } },
  { particleCount: 45, startVelocity: 24, origin: { x: 0.82, y: 0.55 } },
]

export function useWordConfetti(isAllCorrect: boolean) {
  useEffect(() => {
    if (!isAllCorrect) return

    WORD_BURSTS.forEach((burst) => confetti({ ...WORD_CONFETTI_DEFAULTS, spread: 360, ...burst }))
  }, [isAllCorrect])
}

export function useConfetti(state: boolean) {
  useEffect(() => {
    let leftConfettiTimer: number | undefined
    let rightConfettiTimer: number | undefined
    if (state) {
      leftConfettiTimer = window.setTimeout(() => {
        confetti({
          ...CONFETTI_DEFAULTS,
          particleCount: 50,
          angle: 60,
          spread: 100,
          origin: { x: 0 },
        })
      }, 250)
      rightConfettiTimer = window.setTimeout(() => {
        confetti({
          ...CONFETTI_DEFAULTS,
          particleCount: 50,
          angle: 120,
          spread: 100,
          origin: { x: 1 },
        })
      }, 400)
    }
    return () => {
      window.clearTimeout(leftConfettiTimer)
      window.clearTimeout(rightConfettiTimer)
    }
  }, [state])
}
