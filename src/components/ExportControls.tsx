import type { VideoContainer } from '../export/canvasRecorder'
import { useI18n } from '../i18n/context'
import { VIDEO_FORMAT_LABELS } from './capture'

interface ExportControlsProps {
  container: VideoContainer
  supported: Record<VideoContainer, boolean>
  /** 录制进行中：格式锁定 */
  locked: boolean
  onChange: (container: VideoContainer) => void
}

const ORDER: readonly VideoContainer[] = ['mp4', 'webm']

/** 导出：视频封装选择。浏览器录不了的格式置灰并说明。 */
export function ExportControls({ container, supported, locked, onChange }: ExportControlsProps) {
  const { m } = useI18n()
  const unsupported = ORDER.filter((item) => !supported[item])
  return (
    <div className="control-stack">
      <fieldset className="segmented mode-switch" disabled={locked}>
        <legend className="sr-only">{m.videoFormat.label}</legend>
        {ORDER.map((item) => (
          <label
            key={item}
            className={[
              'mode-option segment',
              item === container ? 'is-selected' : '',
              supported[item] ? '' : 'is-disabled',
            ].join(' ').trim()}
          >
            <input
              type="radio"
              name="video-format"
              value={item}
              checked={item === container}
              disabled={!supported[item]}
              onChange={() => onChange(item)}
            />
            {VIDEO_FORMAT_LABELS[item]}
          </label>
        ))}
      </fieldset>
      <p className="hint">{container === 'mp4' ? m.videoFormat.mp4Hint : m.videoFormat.webmHint}</p>
      {unsupported.map((item) => (
        <p key={item} className="hint">
          {m.videoFormat.unsupported({ format: VIDEO_FORMAT_LABELS[item] })}
        </p>
      ))}
      {locked && <p className="hint">{m.videoFormat.locked}</p>}
    </div>
  )
}
