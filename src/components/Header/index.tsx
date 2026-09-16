import logo from '@/assets/logo.svg'
import type { PropsWithChildren } from 'react'
import type React from 'react'
import { NavLink } from 'react-router-dom'

const Header: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <header className="z-20 flex w-full flex-wrap items-center justify-between gap-6 px-10 pt-6">
      <NavLink className="flex items-center gap-3 no-underline hover:no-underline" to="/">
        <img src={logo} className="h-9 w-9 drop-shadow-[0_6px_18px_oklch(0.62_0.18_288/0.35)]" alt="Qwerty Learner Logo" />
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-gray-800 dark:text-gray-100">
          Qwerty<span className="opacity-45 font-medium"> Learner</span>
        </h1>
      </NavLink>
      {/* 毛玻璃胶囊，和页面的柔光渐变底融合；内部控件自己负责各自的样式 */}
      <nav
        className="flex w-auto content-center items-center justify-end gap-2.5 rounded-full border border-gray-200/90 bg-white/70 py-2 pl-[18px] pr-2.5 backdrop-blur-[14px] dark:border-white/10 dark:bg-gray-800/70"
        style={{ boxShadow: '0 10px 30px oklch(0.4 0.06 285 / 0.08)' }}
      >
        {children}
      </nav>
    </header>
  )
}

export default Header
