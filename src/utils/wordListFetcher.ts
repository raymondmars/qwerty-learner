import type { Word } from '@/typings'
import { withAssetVersion } from '@/utils'

export async function wordListFetcher(url: string): Promise<Word[]> {
  const URL_PREFIX: string = REACT_APP_DEPLOY_ENV === 'pages' ? '/qwerty-learner' : ''

  // 版本号加在真正发出的请求上，SWR 的 key 仍是原始 url，各调用点不用改
  const response = await fetch(withAssetVersion(URL_PREFIX + url))
  const words: Word[] = await response.json()
  return words
}
