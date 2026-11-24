import { AsciiRenderer } from '../ascii/AsciiRenderer'
import { getBuiltinPalette } from '../ascii/palettes'
import { getLookPreset, type LookPresetId } from '../ascii/presets'
import type { DemoFrameSource, FrameSource } from '../media/frameSource'
import { resolvePresetRamp } from '../ascii/resolveRamp'

/** 预览画布最大像素尺寸。 */
const MAX_PREVIEW_WIDTH = 240
/**
 * 卡片只有约 140px 宽：如果使用与主画面相同的 120～150 列，每个字符不到 2 像素，看不出字符集差异。
 * 预览使用预设的全部参数，只把列数按卡片尺寸等比缩小（保持各预设之间的相对密度）。
 */
const PREVIEW_COLUMN_SCALE = 0.4
/** 预览帧率：默认 10 FPS，根据实际耗时在 4～12 FPS 之间自适应。 */
const DEFAULT_FPS = 10
const MIN_FPS = 4
const MAX_FPS = 12
/**
 * 自适应降帧的两个信号（保证主画面优先）：
 * 1. 浏览器开始掉帧：动画帧间隔的平滑值超过显示刷新间隔的 1.6 倍；
 * 2. 单次预览刷新（6 张卡片）的主线程耗时超过预算（不到 60Hz 下的一帧）。
 * 任一信号出现就降低预览帧率；耗时低于预算一半且不掉帧时逐步恢复。
 */
const TICK_BUDGET_MS = 14
const FRAME_DROP_RATIO = 1.6

/** 共享的缩小帧：每次刷新把演示动画当前帧缩小复制一次，所有卡片都从这份副本采样。 */
class SharedPreviewFrame implements FrameSource {
  readonly kind = 'demo' as const
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private hasContent = false

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    // CPU 画布：演示帧只读回一次，之后各卡片的采样都是 CPU 内存之间的小尺寸复制
    this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  }

  get image(): CanvasImageSource {
    return this.canvas
  }

  get width(): number {
    return this.canvas.width
  }

  get height(): number {
    return this.canvas.height
  }

  get ready(): boolean {
    return this.hasContent
  }

  copyFrom(source: FrameSource): void {
    if (!this.ctx || !source.ready) return
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'high'
    this.ctx.drawImage(source.image, 0, 0, this.canvas.width, this.canvas.height)
    this.hasContent = true
  }

  release(): void {
    this.canvas.width = 0
    this.canvas.height = 0
  }
}

interface PreviewEntry {
  id: LookPresetId
  canvas: HTMLCanvasElement
  container: HTMLElement
  renderer: AsciiRenderer
  visible: boolean
  laidOut: boolean
  frames: number
}

export interface PreviewStats {
  fps: number
  tickCostMs: number
  ticks: number
  frameIntervalMs: number
}

/**
 * 六张效果预设卡片的动态预览。
 *
 * - 共享同一个演示动画来源与同一个时钟（DemoSource），不创建任何额外的视频源或解码器。
 * - 每张卡片一个独立的小尺寸 AsciiRenderer（与主渲染器资源完全隔离），使用该预设的完整参数。
 * - 只渲染在视口内的卡片（IntersectionObserver）；页面进入后台时暂停，回到前台时恢复。
 * - 不触发任何 React 状态更新。
 */
export class PresetPreviewManager {
  private readonly demo: DemoFrameSource
  private readonly entries = new Map<LookPresetId, PreviewEntry>()
  private readonly shared = new SharedPreviewFrame(MAX_PREVIEW_WIDTH, Math.round((MAX_PREVIEW_WIDTH * 9) / 16))
  private readonly intersection: IntersectionObserver | null
  private readonly resize: ResizeObserver
  private mirror = true
  private frameHandle = 0
  private lastTick = -Infinity
  private fps = DEFAULT_FPS
  private costEma = 0
  private ticks = 0
  private lastRaf = 0
  private rafEma = 0
  private rafMin = Infinity
  private disposed = false

  constructor(demo: DemoFrameSource) {
    this.demo = demo
    this.intersection =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((records) => {
            for (const record of records) {
              const entry = this.findByContainer(record.target)
              if (entry) entry.visible = record.isIntersecting
            }
          })
        : null
    this.resize = new ResizeObserver((records) => {
      for (const record of records) {
        const entry = this.findByContainer(record.target)
        if (entry) this.layout(entry)
      }
    })
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.schedule()
  }

  get stats(): PreviewStats {
    return { fps: this.fps, tickCostMs: this.costEma, ticks: this.ticks, frameIntervalMs: this.rafEma }
  }

  /** 注册一张卡片；返回注销函数。 */
  register(id: LookPresetId, canvas: HTMLCanvasElement, container: HTMLElement): () => void {
    this.unregister(id)
    const renderer = new AsciiRenderer(canvas, resolvePresetRamp(getLookPreset(id).config.charset))
    const preset = getLookPreset(id).config
    renderer.setMode(preset.mode)
    renderer.setColumns(preset.columns * PREVIEW_COLUMN_SCALE, false)
    renderer.setBrightness(preset.brightness)
    renderer.setContrast(preset.contrast)
    if (preset.palette) renderer.setPalette(getBuiltinPalette(preset.palette).colors)
    renderer.setMirror(this.mirror)
    renderer.setCompare(false, 0.5)
    const entry: PreviewEntry = { id, canvas, container, renderer, visible: !this.intersection, laidOut: false, frames: 0 }
    this.entries.set(id, entry)
    this.intersection?.observe(container)
    this.resize.observe(container)
    this.layout(entry)
    return () => this.unregister(id)
  }

  /** 预览跟随主画面的镜像设置（同一素材在主画面与卡片中方向一致）。 */
  setMirror(mirror: boolean): void {
    this.mirror = mirror
    for (const entry of this.entries.values()) entry.renderer.setMirror(mirror)
  }

  dispose(): void {
    this.disposed = true
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle)
    this.frameHandle = 0
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    for (const id of Array.from(this.entries.keys())) this.unregister(id)
    this.intersection?.disconnect()
    this.resize.disconnect()
    this.shared.release()
  }

  private unregister(id: LookPresetId): void {
    const entry = this.entries.get(id)
    if (!entry) return
    this.intersection?.unobserve(entry.container)
    this.resize.unobserve(entry.container)
    entry.renderer.dispose()
    this.entries.delete(id)
  }

  private findByContainer(target: Element): PreviewEntry | undefined {
    for (const entry of this.entries.values()) if (entry.container === target) return entry
    return undefined
  }

  private layout(entry: PreviewEntry): void {
    const width = entry.container.clientWidth
    const height = entry.container.clientHeight
    if (width <= 0 || height <= 0) return
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PREVIEW_WIDTH / width)
    entry.laidOut = entry.renderer.layout(width, height, this.shared.width, this.shared.height, ratio)
  }

  private readonly onVisibilityChange = () => {
    // 从后台返回时重新开始测量帧间隔
    this.lastRaf = 0
    this.rafEma = 0
    if (document.hidden) {
      if (this.frameHandle) cancelAnimationFrame(this.frameHandle)
      this.frameHandle = 0
    } else {
      this.schedule()
    }
  }

  private schedule(): void {
    if (this.disposed || this.frameHandle || document.hidden) return
    this.frameHandle = requestAnimationFrame(this.onFrame)
  }

  private readonly onFrame = (now: number) => {
    this.frameHandle = 0
    if (this.disposed || document.hidden) return
    // 记录动画帧间隔：最小值近似显示刷新间隔，平滑值反映是否在掉帧
    if (this.lastRaf > 0) {
      const delta = now - this.lastRaf
      if (delta > 0 && delta < 250) {
        this.rafMin = Math.min(this.rafMin, delta)
        this.rafEma = this.rafEma ? this.rafEma * 0.9 + delta * 0.1 : delta
      }
    }
    this.lastRaf = now
    if (now - this.lastTick >= 1000 / this.fps - 1) {
      this.lastTick = now
      this.tick(now)
    }
    this.schedule()
  }

  private tick(now: number): void {
    const visible = Array.from(this.entries.values()).filter((entry) => entry.visible && entry.laidOut)
    if (visible.length === 0) return
    const t0 = performance.now()
    // 同一时钟、同一帧：主预览在演示模式下已经画过这一帧时，这里不会重复绘制
    this.demo.update(now)
    this.shared.copyFrom(this.demo)
    for (const entry of visible) {
      entry.renderer.render(this.shared)
      entry.frames += 1
    }
    const cost = performance.now() - t0
    this.ticks += 1
    this.costEma = this.ticks === 1 ? cost : this.costEma * 0.8 + cost * 0.2
    // 自适应帧率：掉帧或超出预算时降帧，宽裕时逐步恢复
    const dropping = this.rafEma > 0 && Number.isFinite(this.rafMin) && this.rafEma > this.rafMin * FRAME_DROP_RATIO
    if ((dropping || this.costEma > TICK_BUDGET_MS) && this.fps > MIN_FPS) this.fps -= 1
    else if (!dropping && this.costEma < TICK_BUDGET_MS / 2 && this.fps < DEFAULT_FPS) this.fps += 1
    if (this.fps > MAX_FPS) this.fps = MAX_FPS
  }
}
