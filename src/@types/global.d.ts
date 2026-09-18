declare global {
  interface Window {
    dataLayer: unknown[]
    // gtag 的入参是 arguments 对象而不是数组，见 utils/analytics.ts 里的说明
    gtag: (...args: unknown[]) => void
  }
}

export {}
