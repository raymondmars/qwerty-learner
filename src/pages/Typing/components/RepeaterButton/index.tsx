import { recordRepeaterAction } from '@/utils'
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import IconHeadphones from '~icons/tabler/headphones'

const RepeaterButton = () => {
  const handleClick = useCallback(() => {
    recordRepeaterAction('open')
  }, [])

  return (
    // 用真实链接而不是 button：复读机是独立的一整页，默认新开标签页，
    // 练习进度不会被冲掉；⌘/Ctrl + 点击、中键点击、右键复制链接也都是浏览器原生行为
    <Link
      to="/repeater"
      target="_blank"
      rel="noopener"
      onClick={handleClick}
      className={`flex items-center justify-center rounded p-[2px] text-lg text-indigo-500 no-underline outline-none transition-colors duration-300 ease-in-out hover:bg-indigo-400 hover:text-white`}
      title="打开复读机（新标签页）"
    >
      <IconHeadphones className="icon" />
    </Link>
  )
}

export default RepeaterButton
