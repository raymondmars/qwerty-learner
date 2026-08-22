import { useCallback, useEffect, useState } from 'react'

export type RepeaterTheme = 'dark' | 'light'

const QUERY = '(prefers-color-scheme: light)'

/**
 * 复读机维持自己的明暗主题，与站点的深色模式开关互不影响：
 * 默认跟随系统，用户在页面里手动切过之后仍然会继续跟随系统的变化，与原型行为一致。
 */
export function useRepeaterTheme() {
  const [theme, setTheme] = useState<RepeaterTheme>(() =>
    typeof window !== 'undefined' && window.matchMedia && window.matchMedia(QUERY).matches ? 'light' : 'dark',
  )

  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setTheme(e.matches ? 'light' : 'dark')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = useCallback(() => setTheme((old) => (old === 'light' ? 'dark' : 'light')), [])

  return { theme, toggleTheme }
}
