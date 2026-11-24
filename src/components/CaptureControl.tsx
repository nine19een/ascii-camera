import type { CSSProperties, KeyboardEvent } from 'react'
import { formatDuration } from '../export/download'
import { GIF_MAX_DURATION_MS } from '../export/gifRecorder'
import type { useExports } from '../hooks/useExports'
import { useI18n } from '../i18n/context'
import type { VideoContainer } from '../export/canvasRecorder'
import { CAPTURE_FORMATS, VIDEO_FORMAT_LABELS, type CaptureFormat } from './capture'


type ExportsApi = ReturnType<typeof useExports>

interface CaptureControlProps {
  exportsApi: ExportsApi
  /** 主画面已有内容 */
  ready: boolean
  format: CaptureFormat
  /** 当前视频封装（用于说明文字） */
  videoContainer: VideoContainer
  onFormatChange: (format: CaptureFormat) => void
  /** 截图成功触发时调用（舞台闪一下作为反馈） */
  onSnapshot: () => void
}

const GIF_MAX_SECONDS = GIF_MAX_DURATION_MS / 1000

/**
 * 采集区：格式切换 + 一个快门。录制与编码期间格式切换换成计时 / 进度，快门本身变成停止或取消。
 * 状态全部来自 useExports，这里只做展示与分派。
 */
export function CaptureControl({ exportsApi, ready, format, videoContainer, onFormatChange, onSnapshot }: CaptureControlProps) {
  const { m } = useI18n()
  const { videoState, gifState, gifProgress } = exportsApi
  const videoBusy = videoState !== 'idle'
  const gifBusy = gifState !== 'idle'
  const busy = videoBusy || gifBusy
  const active: CaptureFormat = videoBusy ? 'video' : gifBusy ? 'gif' : format

  const formatLabel: Record<CaptureFormat, string> = {
    photo: m.toolbar.screenshot,
    video: m.capture.video,
    gif: m.capture.gif,
  }

  // 快门的状态、文字、动作、是否可用、悬停说明
  let state: string = 'idle'
  let label = m.toolbar.screenshot
  let action: (() => void) | undefined
  let disabled = !ready
  let hint: string | undefined
  let progress: number | null = null

  if (active === 'photo') {
    label = m.toolbar.screenshot
    hint = m.toolbar.screenshotHint
    action = () => {
      exportsApi.snapshot()
      onSnapshot()
    }
  } else if (active === 'video') {
    state = videoState
    if (videoState === 'recording') {
      label = m.toolbar.stopRecording
      action = exportsApi.stopVideo
      disabled = false
    } else if (videoState === 'finalizing') {
      label = m.toolbar.finishingVideo
      disabled = true
    } else {
      label = m.toolbar.recordVideo
      hint = exportsApi.videoSupported ? m.toolbar.videoHint({ format: VIDEO_FORMAT_LABELS[videoContainer] }) : m.toolbar.videoUnsupported
      action = exportsApi.startVideo
      disabled = !ready || !exportsApi.videoSupported || gifBusy
    }
  } else {
    state = gifState
    if (gifState === 'recording') {
      label = m.toolbar.finishGif
      action = exportsApi.stopGif
      disabled = false
      progress = gifProgress ? Math.min(1, gifProgress.elapsedMs / GIF_MAX_DURATION_MS) : 0
    } else if (gifState === 'encoding') {
      label = m.toolbar.cancelEncoding
      action = exportsApi.cancelGif
      disabled = false
      progress = gifProgress ? gifProgress.framesEncoded / Math.max(1, gifProgress.framesCaptured) : 0
    } else {
      label = m.toolbar.recordGif
      hint = m.toolbar.gifHint({ seconds: GIF_MAX_SECONDS })
      action = exportsApi.startGif
      disabled = !ready || !exportsApi.gifSupported || videoBusy
    }
  }

  const onFormatKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = CAPTURE_FORMATS.indexOf(format)
    const next = CAPTURE_FORMATS[(index + (event.key === 'ArrowRight' ? 1 : CAPTURE_FORMATS.length - 1)) % CAPTURE_FORMATS.length]
    onFormatChange(next)
    const target = event.currentTarget.querySelector<HTMLButtonElement>(`[data-format="${next}"]`)
    target?.focus()
  }

  let status: string | null = null
  if (videoState === 'recording') status = formatDuration(exportsApi.videoElapsedMs)
  else if (videoState === 'finalizing') status = m.toolbar.finishingVideo
  else if (gifState === 'recording' && gifProgress)
    status = m.capture.gifProgress({ seconds: (gifProgress.elapsedMs / 1000).toFixed(1), max: GIF_MAX_SECONDS })
  else if (gifState === 'encoding' && gifProgress)
    status = m.capture.encodingFrames({ done: gifProgress.framesEncoded, total: gifProgress.framesCaptured })

  const ringStyle = progress === null ? undefined : ({ '--progress': `${(progress * 100).toFixed(1)}%` } as CSSProperties)

  return (
    <div className="capture" data-format={active} data-state={state}>
      <div className="capture-top">
        {busy ? (
          <span className={videoState === 'recording' ? 'capture-status rec-timer' : 'capture-status'}>
            {videoState === 'recording' && <span className="rec-dot" aria-hidden="true" />}
            {status}
            {gifState === 'recording' && (
              <button type="button" className="capture-cancel" onClick={exportsApi.cancelGif}>
                {m.toolbar.cancel}
              </button>
            )}
          </span>
        ) : (
          <div className="capture-format" role="radiogroup" aria-label={m.capture.group} onKeyDown={onFormatKey}>
            {CAPTURE_FORMATS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={item === format}
                tabIndex={item === format ? 0 : -1}
                data-format={item}
                className="format-option"
                onClick={() => onFormatChange(item)}
              >
                {formatLabel[item]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="capture-main">
        <button
          type="button"
          className="shutter"
          data-format={active}
          data-state={state}
          style={ringStyle}
          disabled={disabled}
          title={hint}
          onClick={action}
        >
          <span className="shutter-core" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      </div>
    </div>
  )
}
