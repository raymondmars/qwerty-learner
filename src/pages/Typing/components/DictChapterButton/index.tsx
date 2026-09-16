import Tooltip from '@/components/Tooltip'
import { currentChapterAtom, currentDictInfoAtom, isReviewModeAtom } from '@/store'
import range from '@/utils/range'
import { Listbox, Transition } from '@headlessui/react'
import { useAtom, useAtomValue } from 'jotai'
import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'
import IconCheck from '~icons/tabler/check'

export const DictChapterButton = () => {
  const currentDictInfo = useAtomValue(currentDictInfoAtom)
  const [currentChapter, setCurrentChapter] = useAtom(currentChapterAtom)
  const chapterCount = currentDictInfo.chapterCount
  const isReviewMode = useAtomValue(isReviewModeAtom)

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (event.key === ' ') {
      event.preventDefault()
    }
  }
  return (
    <>
      <Tooltip content="词典切换">
        <NavLink
          className="block rounded-lg text-[13px] font-medium text-gray-700 transition-colors duration-300 ease-in-out hover:text-indigo-500 focus:outline-none dark:text-gray-200 dark:hover:text-indigo-300"
          to="/gallery"
        >
          {currentDictInfo.name} {isReviewMode && '错题复习'}
        </NavLink>
      </Tooltip>
      <span className="dark:bg-white/15 h-4 w-px shrink-0 bg-gray-200" />
      {!isReviewMode && (
        <Tooltip content="章节切换">
          <Listbox value={currentChapter} onChange={setCurrentChapter}>
            <Listbox.Button
              onKeyDown={handleKeyDown}
              className="opacity-55 rounded-lg text-[12.5px] text-gray-600 transition-opacity duration-300 ease-in-out hover:opacity-100 focus:outline-none dark:text-gray-200"
            >
              第 {currentChapter + 1} 章
            </Listbox.Button>
            <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
              <Listbox.Options className="listbox-options z-10 w-32">
                {range(0, chapterCount, 1).map((index) => (
                  <Listbox.Option key={index} value={index}>
                    {({ selected }) => (
                      <div className="group flex cursor-pointer items-center justify-between">
                        {selected ? (
                          <span className="listbox-options-icon">
                            <IconCheck className="focus:outline-none" />
                          </span>
                        ) : null}
                        <span>第 {index + 1} 章</span>
                      </div>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </Listbox>
        </Tooltip>
      )}
    </>
  )
}
