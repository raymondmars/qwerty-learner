import type React from 'react'

const UPSTREAM_REPO = 'https://github.com/RealKai42/qwerty-learner'
const CURRENT_REPO = 'https://github.com/raymondmars/qwerty-learner'
const LICENSE_URL = 'https://github.com/raymondmars/qwerty-learner/blob/master/LICENSE'

const linkClassName = 'underline decoration-dotted underline-offset-2 transition-colors hover:text-indigo-500'

const Footer: React.FC = () => {
  return (
    <footer className="w-full pb-4 pt-6 text-center text-xs leading-relaxed text-gray-400 dark:text-gray-500">
      <p>
        本站基于开源项目{' '}
        <a className={linkClassName} href={UPSTREAM_REPO} target="_blank" rel="noreferrer">
          Qwerty Learner
        </a>{' '}
        二次开发，专注英语单词与肌肉记忆练习。
      </p>
      <p className="mt-1">
        遵循{' '}
        <a className={linkClassName} href={LICENSE_URL} target="_blank" rel="noreferrer">
          GPL-3.0
        </a>{' '}
        协议继续开源，本站源码：
        <a className={linkClassName} href={CURRENT_REPO} target="_blank" rel="noreferrer">
          raymondmars/qwerty-learner
        </a>
      </p>
    </footer>
  )
}

export default Footer
