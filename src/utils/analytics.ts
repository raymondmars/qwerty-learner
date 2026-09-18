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
  // 必须把 arguments 对象原样推进 dataLayer。gtag.js 只把 [object Arguments] 的条目
  // 当作 gtag 命令来执行，推普通数组会被它静默跳过 —— 脚本照样加载、容器照样初始化，
  // 但 js / config 从未生效，页面一个 page_view 都发不出去，GA 实时里完全看不到。
  // 所以既不能用箭头函数，也不能用 rest 参数（rest 拿到的就是普通数组）。
  const gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  } as (...args: unknown[]) => void
  window.gtag = gtag
  gtag('js', new Date())
  gtag('config', GA_MEASUREMENT_ID)
}
