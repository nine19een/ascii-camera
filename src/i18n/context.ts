import { createContext, useContext } from 'react'
import { DEFAULT_LANG, MESSAGES, type Lang, type Messages } from './messages'

export interface I18nValue {
  lang: Lang
  /** 当前语言的全部界面文案。 */
  m: Messages
  setLang: (lang: Lang) => void
}

export const I18nContext = createContext<I18nValue>({
  lang: DEFAULT_LANG,
  m: MESSAGES[DEFAULT_LANG],
  setLang: () => {},
})

/** 组件内取当前语言的文案：const { m } = useI18n()。 */
export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
