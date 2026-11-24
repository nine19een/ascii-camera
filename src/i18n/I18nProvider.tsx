import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type I18nValue } from './context'
import { MESSAGES, applyDocumentLang, readStoredLang, storeLang, type Lang } from './messages'

/**
 * 语言状态只存在于这里：切换语言只会让读取文案的组件重新渲染，
 * 不会重新挂载任何组件，摄像头、录制、预设和参数状态都不受影响。
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  useLayoutEffect(() => {
    applyDocumentLang(lang)
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    storeLang(next)
  }, [])

  const value = useMemo<I18nValue>(() => ({ lang, m: MESSAGES[lang], setLang }), [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
