import { useEffect, useState, type ReactNode } from 'react'
import { formatBytes, formatDuration } from '../export/download'
import type { CameraNotice } from '../hooks/useAsciiCamera'
import type { ExportMessage, ExportResult } from '../hooks/useExports'
import type { FullscreenError } from '../hooks/useFullscreen'
import { useI18n } from '../i18n/context'
import { cameraNoticeText, exportMessageText, fullscreenErrorText } from '../i18n/format'
import { AlertIcon, CheckIcon, CloseIcon, DownloadIcon } from './icons'

interface ToastsProps {
  result: ExportResult | null
  message: ExportMessage | null
  cameraNotice: CameraNotice | null
  fullscreenError: FullscreenError | null
  onDismissResult: () => void
  onDismissMessage: () => void
  /** 录制 / 编码进度的读屏文字（视觉上由采集区显示） */
  children?: ReactNode
}

/** 成功提示与导出结果卡片停留时间；之后结果收成一枚可下载的小胶囊。 */
const TOAST_MS = 6000

/**
 * 舞台底部的提示：导出结果、导出提示、摄像头切换提示、全屏错误。
 * 成功类提示自动收起；错误一直保留，直到用户关闭或被新的状态替换。
 */
export function Toasts(props: ToastsProps) {
  const { m } = useI18n()
  const { result, message, cameraNotice, fullscreenError, onDismissMessage } = props
  const [collapsedUrl, setCollapsedUrl] = useState<string | null>(null)
  const [dismissedNotice, setDismissedNotice] = useState<CameraNotice | null>(null)
  const [dismissedFullscreen, setDismissedFullscreen] = useState<FullscreenError | null>(null)

  // 新结果出现 6 秒后收起为胶囊（链接仍可下载）；带兼容性提示的结果保留到用户关闭
  useEffect(() => {
    if (!result || result.fallback) return
    const timer = window.setTimeout(() => setCollapsedUrl(result.url), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [result])

  // 信息类提示自动消失，错误保留
  useEffect(() => {
    if (!message || message.tone === 'error') return
    const timer = window.setTimeout(onDismissMessage, TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [message, onDismissMessage])

  const collapsed = result !== null && collapsedUrl === result.url
  const showNotice = cameraNotice !== null && cameraNotice !== dismissedNotice
  const showFullscreen = fullscreenError !== null && fullscreenError !== dismissedFullscreen

  return (
    <div className="export-status toasts" aria-live="polite">
      {props.children}
      {message && (
        <div className={message.tone === 'error' ? 'toast is-error' : 'toast'}>
          {message.tone === 'error' ? <AlertIcon size={18} /> : <CheckIcon size={18} />}
          <p className={message.tone === 'error' ? 'toast-text notice notice-error' : 'toast-text notice'}>
            {exportMessageText(m, message)}
          </p>
          <DismissButton onClick={onDismissMessage} />
        </div>
      )}
      {showNotice && (
        <div className="toast is-error">
          <AlertIcon size={18} />
          <p className="toast-text notice notice-error">{cameraNoticeText(m, cameraNotice)}</p>
          <DismissButton onClick={() => setDismissedNotice(cameraNotice)} />
        </div>
      )}
      {showFullscreen && (
        <div className="toast">
          <AlertIcon size={18} />
          <p className="toast-text notice">{fullscreenErrorText(m, fullscreenError)}</p>
          <DismissButton onClick={() => setDismissedFullscreen(fullscreenError)} />
        </div>
      )}
      {result && (
        <div className={collapsed ? 'toast export-result is-collapsed' : 'toast export-result'}>
          <CheckIcon size={18} />
          <div className="toast-text">
            <span className="result-title">{result.kind === 'gif' ? m.exports.gifReady : m.exports.videoReady}</span>
            <a href={result.url} download={result.filename} className="result-link">
              <DownloadIcon size={16} />
              {result.filename}
            </a>
            <span className="export-meta">
              {formatDuration(result.durationMs)} · {result.width} × {result.height} · {formatBytes(result.bytes)}
            </span>
            {result.fallback && <span className="export-meta">{m.exports.videoFallback}</span>}
          </div>
          <DismissButton onClick={props.onDismissResult} />
        </div>
      )}
    </div>
  )
}

function DismissButton({ onClick }: { onClick: () => void }) {
  const { m } = useI18n()
  return (
    <button type="button" className="toast-close" onClick={onClick}>
      <CloseIcon size={16} />
      <span className="sr-only">{m.exports.dismiss}</span>
    </button>
  )
}
