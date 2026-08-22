import { useEffect } from 'react'

const FONT_LINK_ID = 'repeater-fonts'
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans+SC:wght@400;450;600&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;1,7..72,400&family=Noto+Serif+SC:wght@400&display=swap'

/**
 * 复读机用的一组字体只在进入本页面时加载，不拖慢首页；
 * 字体拉不到时样式里的 fallback 字体栈会接手，页面依旧可用。
 */
export function useRepeaterFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}
