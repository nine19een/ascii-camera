/**
 * 录制与编码错误：只携带错误类别和浏览器给出的原始信息，面向用户的文字由界面按当前语言生成。
 */
export type ExportErrorCode =
  | 'unsupported'
  | 'not-ready'
  | 'canvas'
  | 'no-data'
  | 'recorder'
  | 'encoder'
  | 'no-frames'
  | 'encode-failed'

export class ExportError extends Error {
  readonly code: ExportErrorCode
  /** 浏览器或编码器返回的原始信息（不翻译，便于排查）。 */
  readonly detail?: string

  constructor(code: ExportErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ExportError'
    this.code = code
    this.detail = detail
  }
}

/** 把任意异常归入一个错误类别；已是 ExportError 时原样返回。 */
export function toExportError(error: unknown, fallback: ExportErrorCode): ExportError {
  if (error instanceof ExportError) return error
  if (error instanceof Error) return new ExportError(fallback, error.message || error.name)
  return new ExportError(fallback, error === undefined || error === null ? undefined : String(error))
}
