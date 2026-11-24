import { useI18n } from '../i18n/context'
import { LANGS, LANG_LABELS } from '../i18n/messages'

/** 中文 / EN 切换。按钮文字始终用对应语言书写，并标注 lang 便于读屏软件正确朗读。 */
export function LanguageSwitch() {
  const { lang, setLang, m } = useI18n()
  return (
    <div className="lang-switch segmented" role="group" aria-label={m.header.language}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          className={code === lang ? 'lang-option segment is-selected' : 'lang-option segment'}
          aria-pressed={code === lang}
          onClick={() => setLang(code)}
        >
          {LANG_LABELS[code]}
        </button>
      ))}
    </div>
  )
}
