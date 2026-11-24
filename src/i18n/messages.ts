import { en } from './en'
import { zhCN } from './zh-CN'

/** 支持的界面语言。 */
export type Lang = 'zh-CN' | 'en'

/** 文案结构以简体中文为准；英文必须逐项对应（缺项、多项、参数不符都会在类型检查时报错）。 */
export type Messages = typeof zhCN

export const LANGS: readonly Lang[] = ['zh-CN', 'en']
export const DEFAULT_LANG: Lang = 'zh-CN'
export const LANG_STORAGE_KEY = 'ascii-camera:lang'

export const MESSAGES: Record<Lang, Messages> = { 'zh-CN': zhCN, en }

/** 语言切换按钮上的名称（始终用该语言本身书写）。 */
export const LANG_LABELS: Record<Lang, string> = { 'zh-CN': '中文', en: 'EN' }

export function isLang(value: unknown): value is Lang {
  return value === 'zh-CN' || value === 'en'
}

/** 读取已保存的语言；没有保存或无法访问 localStorage 时使用默认语言（简体中文）。 */
export function readStoredLang(): Lang {
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY)
    return isLang(stored) ? stored : DEFAULT_LANG
  } catch {
    return DEFAULT_LANG
  }
}

export function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    // 隐私模式等环境下无法保存：本次会话内仍然生效
  }
}

/** 同步 <html lang> 与页面描述。 */
export function applyDocumentLang(lang: Lang): void {
  document.documentElement.lang = lang
  document.querySelector('meta[name="description"]')?.setAttribute('content', MESSAGES[lang].meta.description)
}
