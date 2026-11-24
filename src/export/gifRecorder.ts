/**
 * GIF 动图录制：按固定帧率从最终合成画布采样，缩放到最大 640px 宽，交给 Worker 逐帧编码。
 *
 * - 主线程只做缩放和读取像素（每帧一次 getImageData），像素数据以 Transferable 形式移交给 Worker，
 *   主线程最多只暂存 1 帧（用于计算该帧的显示时长），不会积累未压缩的视频帧。
 * - GIF 每帧最多 256 色（每帧单独量化），渐变和原色画面会有一定的色带 / 颗粒感，这是 GIF 格式本身的限制。
 */
import { ExportError, toExportError } from './exportError'
import type { GifWorkerRequest, GifWorkerResponse } from './gifProtocol'

export interface GifProgress {
  phase: 'recording' | 'encoding'
  elapsedMs: number
  framesCaptured: number
  framesEncoded: number
}

export interface GifResult {
  blob: Blob
  frames: number
  durationMs: number
  width: number
  height: number
}

export interface GifRecorderOptions {
  fps?: number
  maxDurationMs?: number
  maxWidth?: number
  onProgress: (progress: GifProgress) => void
  onComplete: (result: GifResult) => void
  onError: (error: ExportError) => void
  /** 达到最长录制时间、自动停止并开始编码时调用。 */
  onAutoStop?: () => void
  /** 测试或特殊环境可替换 Worker 的创建方式。 */
  createWorker?: () => Worker
}

export const GIF_FPS = 10
export const GIF_MAX_DURATION_MS = 10_000
export const GIF_MAX_WIDTH = 640

export function isGifSupported(): boolean {
  return typeof Worker !== 'undefined'
}

function defaultCreateWorker(): Worker {
  return new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module', name: 'gif-encoder' })
}

export class GifRecorder {
  private readonly source: HTMLCanvasElement
  private readonly options: GifRecorderOptions
  private readonly fps: number
  private readonly maxDurationMs: number
  private readonly maxWidth: number

  private worker: Worker | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private timer = 0
  private phase: 'idle' | 'recording' | 'encoding' | 'done' = 'idle'
  private width = 0
  private height = 0
  private startedAt = 0
  private stoppedAt = 0
  private framesCaptured = 0
  private framesEncoded = 0
  /** 已采样但还不知道显示时长的最后一帧。 */
  private pending: { buffer: ArrayBuffer; time: number } | null = null

  constructor(source: HTMLCanvasElement, options: GifRecorderOptions) {
    this.source = source
    this.options = options
    this.fps = options.fps ?? GIF_FPS
    this.maxDurationMs = options.maxDurationMs ?? GIF_MAX_DURATION_MS
    this.maxWidth = options.maxWidth ?? GIF_MAX_WIDTH
  }

  get state(): 'idle' | 'recording' | 'encoding' | 'done' {
    return this.phase
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  /** 开始录制。失败时抛出异常（调用方负责提示）。 */
  start(): void {
    if (this.phase !== 'idle') return
    if (this.source.width < 2 || this.source.height < 2) throw new ExportError('not-ready')

    // 宽度不超过 640px（也不放大），高度按画面比例计算
    const width = Math.min(this.maxWidth, this.source.width)
    const height = Math.max(1, Math.round((width * this.source.height) / this.source.width))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!ctx) throw new ExportError('canvas')

    const worker = (this.options.createWorker ?? defaultCreateWorker)()
    worker.onmessage = (event: MessageEvent<GifWorkerResponse>) => this.handleMessage(event.data)
    worker.onerror = (event) => {
      event.preventDefault()
      this.fail(new ExportError('encoder', event.message || undefined))
    }
    worker.onmessageerror = () => this.fail(new ExportError('encoder', 'messageerror'))

    this.worker = worker
    this.canvas = canvas
    this.ctx = ctx
    this.width = width
    this.height = height
    this.phase = 'recording'
    this.post({ type: 'init', width, height })

    this.startedAt = performance.now()
    this.capture()
    this.timer = window.setInterval(() => this.capture(), 1000 / this.fps)
  }

  /** 停止录制并开始收尾编码。 */
  stop(): void {
    if (this.phase !== 'recording') return
    clearInterval(this.timer)
    this.timer = 0
    this.stoppedAt = performance.now()
    this.flushPending(this.stoppedAt)
    if (this.framesCaptured === 0) {
      this.fail(new ExportError('no-frames'))
      return
    }
    this.phase = 'encoding'
    this.post({ type: 'finish' })
    this.emitProgress()
  }

  /** 取消录制或编码：终止 Worker，释放全部资源，不交付文件。 */
  cancel(): void {
    this.release()
    this.phase = 'done'
  }

  private capture(): void {
    if (this.phase !== 'recording' || !this.ctx || !this.canvas) return
    const now = performance.now()
    if (now - this.startedAt >= this.maxDurationMs) {
      this.stop()
      this.options.onAutoStop?.()
      return
    }
    const { ctx, width, height, source } = this
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    if (source.width > 0 && source.height > 0) {
      // 画布尺寸在录制中变化时（例如进入全屏）等比放入，必要时留黑边
      const scale = Math.min(width / source.width, height / source.height)
      const w = source.width * scale
      const h = source.height * scale
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h)
    }
    const buffer = ctx.getImageData(0, 0, width, height).data.buffer as ArrayBuffer
    this.flushPending(now)
    this.pending = { buffer, time: now }
    this.framesCaptured += 1
    this.emitProgress()
  }

  /** 上一帧的显示时长 = 下一帧采样时刻 - 上一帧采样时刻（GIF 以 10ms 为单位，最少 20ms）。 */
  private flushPending(nextTime: number): void {
    const pending = this.pending
    if (!pending) return
    this.pending = null
    const delay = Math.max(20, Math.round((nextTime - pending.time) / 10) * 10)
    this.post({ type: 'frame', buffer: pending.buffer, delay }, [pending.buffer])
  }

  private handleMessage(message: GifWorkerResponse): void {
    switch (message.type) {
      case 'progress':
        this.framesEncoded = message.encoded
        this.emitProgress()
        break
      case 'done': {
        const blob = new Blob([message.buffer], { type: 'image/gif' })
        const result: GifResult = {
          blob,
          frames: message.frames,
          durationMs: this.stoppedAt - this.startedAt,
          width: this.width,
          height: this.height,
        }
        this.release()
        this.phase = 'done'
        this.options.onComplete(result)
        break
      }
      case 'error':
        this.fail(new ExportError('encode-failed', message.message))
        break
    }
  }

  private emitProgress(): void {
    if (this.phase !== 'recording' && this.phase !== 'encoding') return
    this.options.onProgress({
      phase: this.phase,
      elapsedMs: (this.phase === 'recording' ? performance.now() : this.stoppedAt) - this.startedAt,
      framesCaptured: this.framesCaptured,
      framesEncoded: this.framesEncoded,
    })
  }

  private post(message: GifWorkerRequest, transfer: Transferable[] = []): void {
    try {
      this.worker?.postMessage(message, transfer)
    } catch (error) {
      this.fail(toExportError(error, 'encoder'))
    }
  }

  private fail(error: ExportError): void {
    if (this.phase === 'done') return
    this.release()
    this.phase = 'done'
    this.options.onError(error)
  }

  private release(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = 0
    this.pending = null
    if (this.worker) {
      this.worker.onmessage = null
      this.worker.onerror = null
      this.worker.onmessageerror = null
      this.worker.terminate()
    }
    this.worker = null
    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
    }
    this.canvas = null
    this.ctx = null
  }
}
