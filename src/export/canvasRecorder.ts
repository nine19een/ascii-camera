import { ExportError } from './exportError'
import { finalizeMp4 } from './mp4Finalize'
import { finalizeWebm } from './webmFinalize'

/**
 * 视频录制：Canvas.captureStream + MediaRecorder，只录画面，不录音频。
 *
 * 录制的是最终合成画布的内容。为了兼容不同浏览器：
 * - 录制开始时按当时的画布尺寸创建一块固定尺寸的录制画布（偶数宽高，最大 1920×1080），
 *   之后每个动画帧把最终画布等比复制过去。这样录制过程中进入全屏、调整窗口或密度导致画布尺寸变化时，
 *   视频分辨率保持不变（部分浏览器的编码器不支持中途改变分辨率）。
 * - 复制按固定的目标时间轴（每 1/fps 秒一次）进行，与显示器刷新率无关；即使冻结画面（最终画布不再更新）
 *   视频也保持连续的帧。
 * - 视频帧由每次复制后的 track.requestFrame() 显式提交（captureStream(0)），每次复制恰好产生一帧。
 *   不使用 captureStream(fps) 的内部定时采样：那个定时器与复制节奏同为 30 Hz 却互不同步，
 *   两者相位接近时只要有一点抖动就会漏采一帧（视频里出现约 66 ms 的跳帧），而录制中切换字符集、
 *   密度、模式等会改变每帧的渲染开销和抖动，漏帧会明显增多，看起来就像视频"中断"。
 *   浏览器不支持 requestFrame 时退回 captureStream(fps)。
 * - 两种封装：MP4（H.264）和 WebM（VP9 / VP8）。都由浏览器原生 MediaRecorder 编码，不做转码。
 *   MP4 适合手机相册和系统播放器；WebM 体积更小，但 iPhone 相册等无法播放。
 * - MediaRecorder 写出的是边录边写的"直播式"文件：WebM 的 Segment / Cluster 长度未知、没有时长和索引；
 *   Chrome 的 MP4 是分片结构（moov 时长为 0，样本表分散在各片段里）。录制结束后分别用 webmFinalize /
 *   mp4Finalize 改写成带时长和索引的普通文件（只改容器，不重新编码），失败时保留原文件并在结果中标记 fallback。
 */

export interface RecordingFormat {
  mimeType: string
  extension: 'webm' | 'mp4'
}

export interface RecordingResult {
  blob: Blob
  format: RecordingFormat
  durationMs: number
  width: number
  height: number
  /** 容器收尾失败、交付的是 MediaRecorder 的原始文件（可以播放，但部分播放器可能显示不出时长或不能拖动）。 */
  fallback: boolean
}

export interface CanvasRecorderOptions {
  fps?: number
  /** 视频封装；默认 MP4 */
  container?: VideoContainer
  onComplete: (result: RecordingResult) => void
  onError: (error: unknown) => void
}

export type VideoContainer = 'mp4' | 'webm'
export const VIDEO_CONTAINERS: readonly VideoContainer[] = ['mp4', 'webm']

/**
 * 每种封装按顺序尝试的 MIME 类型。MP4 只接受 H.264（avc1）：同一封装里的 VP9 / AV1 手机相册不认。
 * 不带 codecs 的 video/mp4 只作为最后的退路（Safari 的默认编码就是 H.264）。
 */
const FORMAT_CANDIDATES: Record<VideoContainer, RecordingFormat[]> = {
  mp4: [
    { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1.42E01F', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ],
  webm: [
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ],
}

const MAX_WIDTH = 1920
const MAX_HEIGHT = 1080

function recordingCandidates(container: VideoContainer): RecordingFormat[] {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return []
  return FORMAT_CANDIDATES[container].filter((format) => MediaRecorder.isTypeSupported(format.mimeType))
}

export function pickRecordingFormat(container: VideoContainer): RecordingFormat | null {
  return recordingCandidates(container)[0] ?? null
}

/** 当前浏览器能录制哪些封装。 */
export function supportedVideoContainers(): Record<VideoContainer, boolean> {
  const canvasOk = typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
  return {
    mp4: canvasOk && pickRecordingFormat('mp4') !== null,
    webm: canvasOk && pickRecordingFormat('webm') !== null,
  }
}

function evenFloor(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2)
}

export class CanvasRecorder {
  private readonly source: HTMLCanvasElement
  private readonly fps: number
  private readonly container: VideoContainer
  private readonly options: CanvasRecorderOptions

  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private stream: MediaStream | null = null
  /** 手动提交帧的采集轨道；为 null 表示退回 captureStream(fps) 的自动采样。 */
  private manualTrack: CanvasCaptureMediaStreamTrack | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private format: RecordingFormat | null = null
  private frameHandle = 0
  private nextCopyAt = 0
  private startedAt = 0
  private stoppedAt = 0
  private aborted = false
  private finished = false

  constructor(source: HTMLCanvasElement, options: CanvasRecorderOptions) {
    this.source = source
    this.fps = options.fps ?? 30
    this.container = options.container ?? 'mp4'
    this.options = options
  }

  get startTime(): number {
    return this.startedAt
  }

  get mimeType(): string | null {
    return this.format?.mimeType ?? null
  }

  get size(): { width: number; height: number } | null {
    return this.canvas ? { width: this.canvas.width, height: this.canvas.height } : null
  }

  /** 开始录制。不支持或画布尚无内容时抛出异常。 */
  start(): void {
    const candidates = recordingCandidates(this.container)
    if (candidates.length === 0 || typeof this.source.captureStream !== 'function') {
      throw new ExportError('unsupported')
    }
    if (this.source.width < 2 || this.source.height < 2) throw new ExportError('not-ready')

    const scale = Math.min(1, MAX_WIDTH / this.source.width, MAX_HEIGHT / this.source.height)
    const canvas = document.createElement('canvas')
    canvas.width = evenFloor(this.source.width * scale)
    canvas.height = evenFloor(this.source.height * scale)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new ExportError('canvas')

    this.canvas = canvas
    this.ctx = ctx
    this.copyFrame()

    this.stream = this.createStream(canvas)
    const stream = this.stream
    // 视频码率按分辨率估算：字符画细节多，默认码率会让文字发糊
    const bitsPerSecond = Math.round(Math.min(12_000_000, Math.max(2_500_000, canvas.width * canvas.height * this.fps * 0.2)))
    // isTypeSupported 为真但构造仍可能被拒绝（编码器不可用）：依次尝试同一封装的候选类型
    let recorder: MediaRecorder | null = null
    let lastError: unknown = null
    for (const candidate of candidates) {
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: candidate.mimeType,
          videoBitsPerSecond: bitsPerSecond,
          // 每秒至少一个关键帧：冻结或静止画面时编码器默认很少插关键帧，播放器拖动进度会很慢。
          // 较新的 Chrome / Edge 支持该选项，其他浏览器忽略。
          videoKeyFrameIntervalDuration: 1000,
        } as MediaRecorderOptions)
        this.format = candidate
        break
      } catch (error) {
        lastError = error
      }
    }
    if (!recorder) {
      this.release()
      throw lastError ?? new ExportError('unsupported')
    }
    this.recorder = recorder
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data)
    }
    recorder.onerror = (event) => {
      const error = (event as Event & { error?: unknown }).error ?? new Error('MediaRecorder error')
      this.release()
      if (!this.aborted && !this.finished) {
        this.finished = true
        this.options.onError(error)
      }
    }
    recorder.onstop = () => this.finish()

    try {
      recorder.start(1000)
    } catch (error) {
      this.release()
      throw error
    }
    this.requestFrame()
    this.startedAt = performance.now()
    this.nextCopyAt = this.startedAt + 1000 / this.fps
    this.frameHandle = requestAnimationFrame(this.tick)
  }

  /** 停止录制；数据收集完成后通过 onComplete 交付文件。可以重复调用。 */
  stop(): void {
    if (!this.recorder || this.recorder.state === 'inactive') return
    this.stoppedAt = performance.now()
    cancelAnimationFrame(this.frameHandle)
    this.frameHandle = 0
    this.copyFrame()
    this.requestFrame()
    this.recorder.stop()
  }

  /** 放弃录制（页面卸载等）：停止并释放全部资源，不交付文件。 */
  abort(): void {
    this.aborted = true
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        // 已经停止
      }
    }
    this.release()
  }

  /** 优先 captureStream(0) + requestFrame()；不支持时退回 captureStream(fps)。 */
  private createStream(canvas: HTMLCanvasElement): MediaStream {
    const manual = canvas.captureStream(0)
    const track = manual.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
    if (track && typeof track.requestFrame === 'function') {
      this.manualTrack = track
      return manual
    }
    for (const t of manual.getTracks()) t.stop()
    this.manualTrack = null
    return canvas.captureStream(this.fps)
  }

  private requestFrame(): void {
    const track = this.manualTrack
    if (track && track.readyState === 'live') track.requestFrame()
  }

  private readonly tick = (now: number) => {
    this.frameHandle = 0
    if (!this.recorder || this.recorder.state === 'inactive') return
    const interval = 1000 / this.fps
    // 1 ms 容差：刷新时刻与目标时间轴的浮点误差不应推迟到下一次刷新
    if (now >= this.nextCopyAt - 1) {
      this.copyFrame()
      this.requestFrame()
      this.nextCopyAt += interval
      // 页面被节流或卡顿后不追帧，从当前时间重新对齐
      if (now - this.nextCopyAt > interval) this.nextCopyAt = now + interval
    }
    this.frameHandle = requestAnimationFrame(this.tick)
  }

  /** 把最终画布等比复制到固定尺寸的录制画布（必要时留黑边）。 */
  private copyFrame(): void {
    const { canvas, ctx, source } = this
    if (!canvas || !ctx) return
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (source.width < 1 || source.height < 1) return
    const scale = Math.min(canvas.width / source.width, canvas.height / source.height)
    const width = source.width * scale
    const height = source.height * scale
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
  }

  private finish(): void {
    const format = this.format
    const size = this.size
    const chunks = this.chunks
    const durationMs = (this.stoppedAt || performance.now()) - this.startedAt
    this.release()
    if (this.aborted || this.finished) return
    this.finished = true
    if (!format || !size || chunks.length === 0) {
      this.options.onError(new ExportError('no-data'))
      return
    }
    const raw = new Blob(chunks, { type: format.mimeType.split(';')[0] })
    const deliver = (blob: Blob, fallback: boolean) => {
      if (this.aborted) return
      this.options.onComplete({ blob, format, durationMs, width: size.width, height: size.height, fallback })
    }
    const finalize = format.extension === 'mp4' ? finalizeMp4(raw) : finalizeWebm(raw, durationMs)
    finalize.then(
      (result) => deliver(result.blob, result.fallback),
      () => deliver(raw, true),
    )
  }

  private release(): void {
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle)
    this.frameHandle = 0
    if (this.stream) for (const track of this.stream.getTracks()) track.stop()
    this.stream = null
    this.manualTrack = null
    if (this.recorder) {
      this.recorder.ondataavailable = null
      this.recorder.onerror = null
      this.recorder.onstop = null
    }
    this.recorder = null
    this.chunks = []
    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
    }
    this.canvas = null
    this.ctx = null
  }
}
