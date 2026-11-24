import { memo, useEffect, useRef, useState } from 'react'
import type { GridSize } from '../ascii/AsciiRenderer'
import type { CameraStatus } from '../hooks/useAsciiCamera'
import { useI18n } from '../i18n/context'
import { InfoIcon } from './icons'
import { LanguageSwitch } from './LanguageSwitch'

/** 作者署名：名字与链接不随语言变化。 */
const AUTHOR_NAME = 'nine19een'
const AUTHOR_URL = 'https://nine19een.com'

interface TopBarProps {
  status: CameraStatus
  isDemo: boolean
  grid: GridSize | null
}

/** 顶栏：产品名、画面来源、网格尺寸、语言、隐私说明。 */
export const TopBar = memo(function TopBar({ status, isDemo, grid }: TopBarProps) {
  const { m } = useI18n()
  // 摄像头出错时画面回到演示动画：标签仍写“演示动画”，红点提示出错，原因见舞台顶部的横幅
  const source = status === 'starting' ? 'starting' : isDemo ? 'demo' : 'camera'
  const failed = status === 'error'
  return (
    <header className="topbar">
      <div className="topbar-start">
        <h1 className="brand">ASCII Camera</h1>
        <span
          className="source-chip"
          data-source={source}
          data-error={failed || undefined}
          title={failed ? m.source.error : undefined}
        >
          <span className="source-dot" aria-hidden="true" />
          {m.source[source]}
        </span>
      </div>
      <div className="topbar-end">
        {grid && (
          <span className="grid-size">{m.status.grid({ columns: grid.columns, rows: grid.rows })}</span>
        )}
        <LanguageSwitch />
        <PrivacyButton />
      </div>
    </header>
  )
})

/** 信息面板：隐私说明与作者署名。点按显示，点击别处或按 Esc 收起。 */
function PrivacyButton() {
  const { m } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="privacy" ref={rootRef}>
      <button
        type="button"
        className="icon-button icon-button-small"
        aria-expanded={open}
        aria-controls="privacy-note"
        onClick={() => setOpen((value) => !value)}
      >
        <InfoIcon size={18} />
        <span className="sr-only">{m.header.privacyButton}</span>
      </button>
      {open && (
        <div id="privacy-note" className="privacy-note" role="note">
          <p>{m.header.privacy}</p>
          <p className="privacy-credit">
            {m.header.creditPrefix}
            <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
              {AUTHOR_NAME}
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
