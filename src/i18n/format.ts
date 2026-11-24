import type { GridSize } from '../ascii/AsciiRenderer'
import type { CameraNotice, CameraStatus } from '../hooks/useAsciiCamera'
import type { ExportMessage } from '../hooks/useExports'
import type { FullscreenError } from '../hooks/useFullscreen'
import type { Messages } from './messages'

/**
 * 把状态描述（类别 + 参数）转换成当前语言的文字。这里只按类别选择文案，不包含任何语言判断。
 */

export function statusText(m: Messages, status: CameraStatus, frozen: boolean, grid: GridSize | null): string {
  const base = m.status[status]
  const withFrozen = frozen && status !== 'starting' ? m.status.frozen({ status: base }) : base
  return grid ? `${withFrozen} · ${m.status.grid({ columns: grid.columns, rows: grid.rows })}` : withFrozen
}

/** 浏览器或编码器给出的原始信息附在句末，不翻译。 */
function withDetail(m: Messages, text: string, detail?: string): string {
  return detail ? m.common.withDetail({ text, detail }) : text
}

export function exportMessageText(m: Messages, message: ExportMessage): string {
  const e = m.exports
  switch (message.kind) {
    case 'snapshot-not-ready':
      return e.snapshotNotReady
    case 'snapshot-failed':
      return e.snapshotFailed
    case 'snapshot-saved':
      return e.snapshotSaved(message)
    case 'video-failed':
      return withDetail(m, e.videoFailed({ reason: e.errors[message.code] }), message.detail)
    case 'gif-failed':
      return withDetail(m, e.gifFailed({ reason: e.errors[message.code] }), message.detail)
    case 'gif-limit':
      return e.gifLimit(message)
    case 'gif-cancelled':
      return e.gifCancelled
  }
}

export function cameraNoticeText(m: Messages, notice: CameraNotice): string {
  const n = m.cameraNotices
  switch (notice.kind) {
    case 'switch-locked':
      return n.switchLocked
    case 'switch-unavailable':
      return n.switchUnavailable
    case 'switch-failed':
      return n.switchFailed({ reason: m.cameraErrors[notice.error] })
    case 'switch-restored':
      return n.switchRestored({ reason: m.cameraErrors[notice.error] })
  }
}

export function fullscreenErrorText(m: Messages, error: FullscreenError): string {
  return error.kind === 'unsupported' ? m.fullscreenErrors.unsupported : withDetail(m, m.fullscreenErrors.denied, error.detail)
}

/** 自定义字符梯度中被忽略的字符：不可见字符用名称或码位表示。 */
export function describeChar(m: Messages, char: string): string {
  if (char === '\n') return m.charsets.newline
  if (char === '\t') return m.charsets.tab
  if (char === '\r') return m.charsets.carriageReturn
  const code = char.codePointAt(0) ?? 0
  return code < 0x20 || code === 0x7f
    ? `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
    : m.charsets.quoted({ char })
}

/** 字符梯度的显示形式：空格显示为 ␣。 */
export function visibleRamp(ramp: string): string {
  return ramp.replaceAll(' ', '␣')
}
