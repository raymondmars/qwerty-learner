import { isYouglishOpenAtom } from '@/store'
import { Dialog, Transition } from '@headlessui/react'
import { useSetAtom } from 'jotai'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import IconXMark from '~icons/heroicons/x-mark-solid'

/**
 * 视频例句弹窗。用 YouGlish 官方的嵌入 widget，不是自建。
 *
 * 为什么不自建：YouGlish 的原理是索引 YouTube 字幕轨（每条 cue 自带时间戳），
 * 但 YouTube Data API 的 captions.download 要求 OAuth 且必须是视频所有者，
 * 对第三方公开视频一律 403；剩下的只有播放器用的非公开 timedtext 接口，属于 ToS
 * 灰区，而且机房 IP 会被反爬拦掉，线上根本跑不通。加上他们索引了 5000 万条 track，
 * 这是一门生意不是一个功能。官方 widget 是唯一正当且可行的路。
 *
 * 为什么是弹窗不是内联：内联要在每个词上都加载第三方 iframe，不用也得付代价。
 * 弹窗点开才加载 widget.js，不点就一行请求都不发。
 *
 * 刻意不开搜索框（components 里不含 1）：搜索框会邀请用户在弹窗里漫游，
 * 而这个入口的定位是「拼完之后加深这一个词」，不是一个可以逛的地方。
 *
 * 使用条款：必须常驻显示 "Powered by YouGlish.com"，见下方页脚，不要移除。
 */

const WIDGET_SCRIPT = 'https://youglish.com/public/emb/widget.js'
const WIDGET_ELEMENT_ID = 'youglish-widget'
// 标题(4) + 字幕(8) + 语速(16) + 播放控制(64)；刻意不含搜索框(1)
const WIDGET_COMPONENTS = 4 + 8 + 16 + 64

/**
 * widget 高度必须是一个确定的像素值，不能由内容决定。
 *
 * YouGlish 页面里有一条不断滚动的文字广告，它会改变 widget 内部的内容高度；而 widget
 * 默认高度自适应（iframe 参数里的 e_h=-1、e_notif_h=1 就是「自适应 + 回报高度变化」），
 * 于是那条广告每滚一次就把 iframe 撑高一点，一路传上来把弹窗也撑高，滚动条忽有忽无，
 * 用户看到的就是页面在上下跳。传了显式 height 之后 e_notif_h 直接消失，高度回报被关掉。
 *
 * 高度按视口算：视频看得越大越好，占到视口的 85% 都不过分。但 widget 的 height 是
 * 构造参数，构造完就改不了了 —— 重建 widget 会让视频从头开始播，所以窗口缩放时只调
 * 外层容器，widget 保持打开那一刻的尺寸，超出部分由外层的内部滚动兜住。
 */
const VIEWPORT_RATIO = 0.85
/** 弹窗自身的开销：标题行 + 页脚 + panel 上下内边距 */
const DIALOG_CHROME_HEIGHT = 112
/** widget 再矮就看不清视频了；再高在超高屏上会变成一条傻长的白条 */
const MIN_WIDGET_HEIGHT = 320
const MAX_WIDGET_HEIGHT = 900
/**
 * 只算 widget 需要的像素高度。容器的实际高度由 CSS flex 决定，不在这里算 ——
 * 早先版本让 JS 同时算容器高度，就得估一个 DIALOG_CHROME_HEIGHT，估偏了弹窗就会
 * 比视口高，外层跟着冒出第二条滚动条。现在 Panel 用 max-h 卡死在视口内、容器可收缩，
 * 这个常数估不准也只影响 widget 的初始尺寸，不再影响布局正确性。
 */
function computeWidgetHeight() {
  if (typeof window === 'undefined') return MIN_WIDGET_HEIGHT

  const available = Math.round(window.innerHeight * VIEWPORT_RATIO) - DIALOG_CHROME_HEIGHT
  return Math.min(MAX_WIDGET_HEIGHT, Math.max(MIN_WIDGET_HEIGHT, available))
}

type YouglishWidget = {
  fetch: (query: string, lang: string, accent?: string) => void
  pause: () => void
}

declare global {
  interface Window {
    YG?: { Widget: new (element: string, options: Record<string, unknown>) => YouglishWidget }
    onYouglishAPIReady?: () => void
  }
}

/** widget.js 只加载一次，全局共用同一个 promise */
let apiPromise: Promise<void> | undefined

function loadYouglishApi(): Promise<void> {
  if (window.YG) return Promise.resolve()

  apiPromise ??= new Promise<void>((resolve, reject) => {
    // 脚本就绪时由它回调这个全局函数，这是官方规定的握手方式
    window.onYouglishAPIReady = () => resolve()

    const script = document.createElement('script')
    script.src = WIDGET_SCRIPT
    script.async = true
    script.onerror = () => {
      apiPromise = undefined // 允许下次重试
      reject(new Error('YouGlish widget 加载失败'))
    }
    document.head.appendChild(script)
  })

  return apiPromise
}

/**
 * 'empty' 只在 widget 明确回报 totalResult === 0 时出现，'error' 只在脚本加载失败或
 * widget 报错时出现，其余一律按 'ready' 处理 —— widget 容器始终可见。
 *
 * 这里踩过一次坑：最初把「显示 widget」挂在 onFetchDone 上，容器在事件到达前用 hidden
 * 藏着。实测发现 widget 可能一直停在它自己的 "Loading Youglish…" 画面上，onFetchDone
 * 和 onError 都不来（第三方 iframe 被网络环境挡住时就是这样），于是弹窗永远停在
 * 「正在加载」，而底下的 widget 被藏着谁也看不见。可见性不能依赖一个可能永远不到的事件。
 */
type Status = 'ready' | 'empty' | 'error'

export default function YouglishDialog({ word, accent, onClose }: { word: string; accent: 'us' | 'uk'; onClose: () => void }) {
  const setIsYouglishOpen = useSetAtom(isYouglishOpenAtom)
  const [status, setStatus] = useState<Status>('ready')
  // widget 的高度定在打开那一刻，之后不再变 —— 改它要重建 widget，视频会从头播。
  // 窗口缩放不需要 JS 处理：Panel 的 max-h 和容器的 flex 收缩会自动接住
  const widgetHeightRef = useRef(computeWidgetHeight())
  const widgetRef = useRef<YouglishWidget | undefined>(undefined)

  // 练习页的快捷键（Enter 翻页、Tab 显示释义）注册时带了 enableOnFormTags，
  // 弹窗盖在上面照样会触发，必须让它们知道现在该让路
  useEffect(() => {
    setIsYouglishOpen(true)
    return () => setIsYouglishOpen(false)
  }, [setIsYouglishOpen])

  useEffect(() => {
    let cancelled = false

    loadYouglishApi()
      .then(() => {
        if (cancelled || !window.YG) return
        widgetRef.current = new window.YG.Widget(WIDGET_ELEMENT_ID, {
          // 不写死 width：widget 默认取容器宽度，窄屏才不会横向溢出
          height: widgetHeightRef.current,
          components: WIDGET_COMPONENTS,
          autoStart: 1,
          events: {
            // 生僻词和词组可能一条结果都没有。给一句话加外链兜底，
            // 而不是留一个什么都不显示的空框
            onFetchDone: (event: { totalResult: number }) => {
              if (!cancelled && event.totalResult === 0) setStatus('empty')
            },
            onError: () => {
              if (!cancelled) setStatus('error')
            },
          },
        })
        widgetRef.current.fetch(word, 'english', accent)
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      // 关闭时必须停掉，否则声音会在背后继续放
      try {
        widgetRef.current?.pause()
      } catch {
        // widget 可能还没初始化完，忽略
      }
      widgetRef.current = undefined
    }
  }, [word, accent])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const fallbackHref = `https://youglish.com/pronounce/${encodeURIComponent(word)}/english/${accent}`

  return (
    <Transition appear show as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        {/* 外层不滚动：Panel 由 max-h 保证永远塞得进视口，唯一该滚的是里面的 widget 容器。
            早先这里是 overflow-y-auto，于是外层和内层各有一条滚动条 */}
        <div className="fixed inset-0 overflow-hidden">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="flex max-h-[calc(100vh-2rem)] w-full max-w-[43rem] transform flex-col overflow-hidden rounded-2xl bg-white p-5 text-left shadow-xl transition-all dark:bg-gray-800">
                <div className="mb-3 flex flex-none items-center justify-between">
                  <Dialog.Title className="font-mono text-lg font-bold text-gray-800 dark:text-gray-100">{word}</Dialog.Title>
                  <button
                    type="button"
                    onClick={handleClose}
                    title="关闭（Esc）"
                    className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                  >
                    <IconXMark className="text-lg" />
                  </button>
                </div>

                {status === 'empty' && (
                  <p className="py-10 text-center text-sm text-gray-400">
                    没有找到 {word} 的视频用例。
                    <a href={fallbackHref} target="_blank" rel="noreferrer" className="ml-1 text-indigo-500 hover:text-indigo-600">
                      去 YouGlish 站内搜索
                    </a>
                  </p>
                )}

                {status === 'error' && (
                  <p className="py-10 text-center text-sm text-gray-400">
                    视频加载失败。
                    <a href={fallbackHref} target="_blank" rel="noreferrer" className="ml-1 text-indigo-500 hover:text-indigo-600">
                      在 YouGlish 上打开
                    </a>
                  </p>
                )}

                {/* widget 要挂在固定 id 的容器上，任何状态下都不能卸载，否则它无处可挂。
                    只有明确无结果或出错时才藏起来 */}
                {/* 两层是必须的：widget 初始化时会把它拿到的那个元素的 class 和 style 整个覆写掉
                    （实测变成 class="ygContainer" style="background-color:white;z-index:999999"），
                    我们设在上面的高度和 overflow 会被抹掉，React 还会和它抢同一个元素的属性。
                    所以高度和滚动锁在外层由我们控制，内层交给 widget 随便改 */}
                <div
                  style={status === 'ready' ? { height: widgetHeightRef.current } : undefined}
                  className={status === 'ready' ? 'scrollbar-hidden min-h-0 flex-shrink overflow-y-auto' : 'hidden'}
                >
                  <div id={WIDGET_ELEMENT_ID} />
                </div>

                {status === 'ready' && (
                  <p className="mt-2 flex-none text-center text-[11px] text-gray-400 dark:text-gray-500">
                    视频迟迟不出来？
                    <a href={fallbackHref} target="_blank" rel="noreferrer" className="ml-1 hover:text-indigo-500">
                      在 YouGlish 上打开
                    </a>
                  </p>
                )}

                {/* 使用条款要求这行常驻可见，不要移除 */}
                <div className="mt-3 flex-none text-right text-[11px] text-gray-400 dark:text-gray-500">
                  Powered by{' '}
                  <a href="https://youglish.com" target="_blank" rel="noreferrer" className="hover:text-indigo-500">
                    YouGlish.com
                  </a>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
