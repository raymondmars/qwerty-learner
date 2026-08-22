/// <reference types="vite/client" />
declare const REACT_APP_DEPLOY_ENV: string
declare const LATEST_COMMIT_HASH: string

interface ImportMetaEnv {
  /** GA4 衡量 ID，构建时注入；不设置则不接入统计 */
  readonly VITE_GA_MEASUREMENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
