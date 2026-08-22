/**
 * Google Analytics（GA4）按需接入：
 * 只有在构建时通过环境变量 VITE_GA_MEASUREMENT_ID 提供了衡量 ID 才会加载，
 * 不提供时页面完全不会向 Google 发出任何请求。
 *
 *   VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run build
 */
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID

export function initGoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return
  if (document.getElementById('ga-script')) return

  const script = document.createElement('script')
  script.id = 'ga-script'
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer || []
  // gtag 依赖 arguments 对象，这里必须用 function 而不是箭头函数
  function gtag(...args: unknown[]) {
    window.dataLayer.push(args)
  }
  gtag('js', new Date())
  gtag('config', GA_MEASUREMENT_ID)
}
