/**
 * 快捷键的键帽标记。
 *
 * 为什么需要：本项目的快捷键（ctrl+j 发音、v 视频例句等）此前一个提示都没有，
 * 用户不翻代码就不可能知道它们存在 —— 没有提示的快捷键等于没有快捷键。
 *
 * 只贴在快捷键真正生效的地方。同一个图标在不同页面未必都绑了快捷键（比如发音图标
 * 在词表卡片里就没绑 ctrl+j），所以这个标记不做进图标组件本身，由调用方按需带上，
 * 免得在没有快捷键的位置骗人。
 */
export default function HotkeyHint({ keys, className = '' }: { keys: string; className?: string }) {
  return (
    <kbd
      className={`rounded border border-gray-300 px-1 font-mono text-[10px] leading-[1.4] text-gray-400 dark:border-gray-600 dark:text-gray-500 ${className}`}
    >
      {keys}
    </kbd>
  )
}
