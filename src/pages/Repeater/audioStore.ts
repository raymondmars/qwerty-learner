import type { Table } from 'dexie'
import Dexie from 'dexie'

/**
 * 上次载入的音频。浏览器拿不到本地文件路径，刷新后也无法凭路径重新打开，
 * 只能把文件内容本身存下来，所以这里存的是 Blob。
 * 单独开一个库，避免与错题本等用户数据表混在一起。
 */
export type StoredAudio = {
  id: string
  name: string
  type: string
  blob: Blob
  savedAt: number
}

class RepeaterDB extends Dexie {
  audio!: Table<StoredAudio, string>

  constructor() {
    super('RepeaterDB')
    this.version(1).stores({ audio: 'id' })
  }
}

const db = new RepeaterDB()
const LAST_AUDIO_ID = 'last'
/** 超过这个大小就不落库了，避免挤占浏览器存储配额 */
const MAX_PERSIST_SIZE = 200 * 1024 * 1024

export async function saveLastAudio(file: File): Promise<void> {
  if (file.size > MAX_PERSIST_SIZE) return
  try {
    await db.audio.put({
      id: LAST_AUDIO_ID,
      name: file.name,
      type: file.type,
      blob: file,
      savedAt: Date.now(),
    })
  } catch (err) {
    // 配额不足或隐私模式下写入失败，不影响本次播放
    console.warn('保存音频失败', err)
  }
}

export async function loadLastAudio(): Promise<File | null> {
  try {
    const stored = await db.audio.get(LAST_AUDIO_ID)
    if (!stored) return null
    return new File([stored.blob], stored.name, { type: stored.type })
  } catch (err) {
    console.warn('读取上次音频失败', err)
    return null
  }
}

export async function clearLastAudio(): Promise<void> {
  try {
    await db.audio.delete(LAST_AUDIO_ID)
  } catch (err) {
    console.warn('清除音频失败', err)
  }
}
