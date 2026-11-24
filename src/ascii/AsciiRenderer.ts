import { CLASSIC_RAMP, buildRampLut } from './charset'
import { FONT_FAMILY, measureAdvanceRatio } from './glyphMetrics'
import { luminance } from './luminance'
import { BUILTIN_PALETTES, buildPaletteLut, type PaletteColors, type PaletteLut } from './palettes'
import type { FrameSource } from '../media/frameSource'
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  CONTRAST_MAX,
  CONTRAST_MIN,
  DEFAULT_BRIGHTNESS,
  DEFAULT_COLUMNS,
  DEFAULT_CONTRAST,
  DEFAULT_MODE,
  DEFAULT_SPLIT,
  clamp,
  normalizeColumns,
  type RenderMode,
} from './settings'

const BACKGROUND = '#000'
const FOREGROUND = '#fff'

/** 自动色阶：取明度直方图的 2% / 98% 分位作为黑点 / 白点。 */
const LEVEL_LOW_PERCENTILE = 0.02
const LEVEL_HIGH_PERCENTILE = 0.98
/** 黑白点在帧之间做指数平滑，避免画面亮度闪烁。 */
const LEVEL_SMOOTHING = 0.15
/** 黑白点之间的最小跨度，防止纯色画面被拉伸出大量噪点。 */
const LEVEL_MIN_RANGE = 48

/** 亮度 ±50 对应在 0～1 的明度范围内整体平移 ±0.25。 */
const BRIGHTNESS_RANGE = 0.25


/** 对比模式分割线（CSS 像素）：白色主线 + 两侧深色描边，保证在任何画面上都清晰可见。 */
const DIVIDER_WIDTH = 2
const DIVIDER_OUTLINE = 1

export class RendererUnsupportedError extends Error {
  constructor() {
    super('Canvas 2D context is not available')
    this.name = 'RendererUnsupportedError'
  }
}

export interface GridSize {
  columns: number
  rows: number
}

/**
 * 把视频帧转换为 ASCII 字符画，并在可见画布上合成最终画面。
 *
 * 可见画布就是“最终合成画布”：屏幕显示、全屏、PNG 截图、WebM 录制、GIF 录制都以它为唯一来源。
 *
 * 每帧流程：
 *   画面来源（FrameSource：摄像头或演示动画；冻结时为保存的那一帧）
 *     → 采样画布（降采样 + 镜像）→ 明度 → 自动色阶 → 对比度 → 亮度 → 字符 / 颜色
 *     → 绘制字符画（黑白 / 原色 / 调色板）
 *     → 对比模式：用同一个画面来源在分割线右侧绘制原画，并画出分割线
 *
 * - 原画与字符画在同一次 render 调用中、从同一个画面来源绘制，因此一定来自同一帧。
 * - 镜像在采样阶段完成，字符本身不会被翻转；对比模式的原画使用相同的镜像设置。
 * - 自动色阶只根据原始明度统计黑白点，亮度 / 对比度在色阶之后施加，手动调整不会被自动色阶抵消。
 * - 黑白：逐行 fillText 白色文字（第一阶段已验收的路径）。
 * - 原色 / 调色板：先画白色文字层，再用 source-in 合成一张“每个字符格一个色块”的小图完成逐字符着色。
 *   调色板模式下每个字符格的颜色 = 256 级渐变查找表[该格色调]，背景使用调色板背景色。
 * - 所有缓冲区只在布局、模式或冻结状态变化时分配，逐帧渲染不创建大型对象（getImageData 返回的数组除外）。
 */
export class AsciiRenderer {
  private readonly output: HTMLCanvasElement
  private readonly outputCtx: CanvasRenderingContext2D
  private readonly sample: HTMLCanvasElement
  private readonly sampleCtx: CanvasRenderingContext2D
  /** 本帧：原始明度 → 字符编码。 */
  private readonly charLut = new Uint16Array(256)
  /** 本帧：原始明度（或单个颜色通道）→ 调整后的 0～255 色调。 */
  private readonly toneLut = new Uint8Array(256)
  private readonly histogram = new Uint32Array(256)
  /** 调色板模式：色调 → RGB 的 256 级查找表，只在调色板变化时重建。 */
  private readonly paletteLut: PaletteLut
  private paletteBackground: string

  private rampLut: Uint16Array
  /** 当前字符梯度中字形的平均水平步进 / 字号。 */
  private advanceRatio: number

  private columns: number = DEFAULT_COLUMNS
  private mode: RenderMode = DEFAULT_MODE
  private mirror = true
  private brightness = DEFAULT_BRIGHTNESS
  private contrast = DEFAULT_CONTRAST
  private compare = false
  private split = DEFAULT_SPLIT

  private rows = 0
  private cssWidth = 0
  private cssHeight = 0
  private rowHeight = 0
  private font = ''
  private luma: Uint8Array = new Uint8Array(0)
  private rowCodes: number[] = []

  // 原色 / 绿色模式使用的资源，首次需要时才创建。
  private textLayer: HTMLCanvasElement | null = null
  private textLayerCtx: CanvasRenderingContext2D | null = null
  private colorCanvas: HTMLCanvasElement | null = null
  private colorCtx: CanvasRenderingContext2D | null = null
  private colorImage: ImageData | null = null

  /** 冻结时保存的视频帧（原始分辨率、未镜像）。为 null 表示使用实时视频。 */
  private frozenFrame: HTMLCanvasElement | null = null
  /**
   * 对比模式下每帧先把视频复制到这里，字符采样和右侧原画都从这张画布读取，
   * 保证两侧严格来自同一帧（直接对 video 调用两次 drawImage 时，浏览器可能在两次调用之间切换到新帧）。
   */
  private compareFrame: HTMLCanvasElement | null = null
  private compareFrameCtx: CanvasRenderingContext2D | null = null

  private levelLow = 0
  private levelHigh = 255
  private levelsReady = false

  constructor(output: HTMLCanvasElement, ramp: string = CLASSIC_RAMP) {
    const outputCtx = output.getContext('2d', { alpha: false })
    const sample = document.createElement('canvas')
    const sampleCtx = sample.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!outputCtx || !sampleCtx) throw new RendererUnsupportedError()

    this.output = output
    this.outputCtx = outputCtx
    this.sample = sample
    this.sampleCtx = sampleCtx
    this.rampLut = buildRampLut(ramp)
    this.advanceRatio = measureAdvanceRatio(ramp)
    const initialPalette = BUILTIN_PALETTES[0].colors
    this.paletteLut = buildPaletteLut(initialPalette)
    this.paletteBackground = initialPalette.background
  }

  get grid(): GridSize {
    return { columns: this.columns, rows: this.rows }
  }

  get isFrozen(): boolean {
    return this.frozenFrame !== null
  }

  /** 切换镜像。下一帧立即生效，无需重新布局。 */
  setMirror(mirror: boolean): void {
    this.mirror = mirror
  }

  /** 切换视觉模式。下一帧立即生效。 */
  setMode(mode: RenderMode): void {
    this.mode = mode
  }

  /** 亮度 -50～+50。下一帧立即生效。 */
  setBrightness(brightness: number): void {
    this.brightness = clamp(brightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX)
  }

  /** 对比度 50～150（百分比）。下一帧立即生效。 */
  setContrast(contrast: number): void {
    this.contrast = clamp(contrast, CONTRAST_MIN, CONTRAST_MAX)
  }

  /** 设置渐变调色板（重建 256 级查找表）。下一帧立即生效。 */
  setPalette(colors: PaletteColors): void {
    buildPaletteLut(colors, this.paletteLut)
    this.paletteBackground = colors.background
  }

  /** 对比模式开关与分割位置（左侧字符画所占比例 0～1）。下一帧立即生效。 */
  setCompare(enabled: boolean, split: number): void {
    this.compare = enabled
    this.split = clamp(split, 0, 1)
    if (!enabled) this.releaseCompareFrame()
  }

  /**
   * 设置列数。调用方随后需要调用 layout() 使新网格生效。
   * 主画面限定在 60～180 列（步长 10）；预设预览卡片尺寸很小，传 normalize = false 使用更少的列数。
   */
  setColumns(columns: number, normalize = true): void {
    this.columns = normalize ? normalizeColumns(columns) : Math.max(8, Math.round(columns))
  }

  /**
   * 切换字符梯度（从暗到亮）。会重新测量字形宽度；
   * 返回 true 表示字宽比例变化，调用方需要重新 layout() 以重新计算字号和行数。
   */
  setRamp(ramp: string): boolean {
    this.rampLut = buildRampLut(ramp)
    const ratio = measureAdvanceRatio(ramp)
    const changed = Math.abs(ratio - this.advanceRatio) > 1e-4
    this.advanceRatio = ratio
    return changed
  }

  /**
   * 冻结：把视频当前帧复制到离屏画布，此后渲染都使用这一帧。
   * 冻结的是画面来源而不是渲染结果，所以冻结后仍可调整模式、字符集、参数并重新渲染同一帧。
   */
  freeze(source: FrameSource): boolean {
    if (!source.ready || source.width === 0) return false
    const frame = document.createElement('canvas')
    frame.width = source.width
    frame.height = source.height
    const ctx = frame.getContext('2d', { alpha: false })
    if (!ctx) return false
    ctx.drawImage(source.image, 0, 0, source.width, source.height)
    this.releaseFrozenFrame()
    this.frozenFrame = frame
    return true
  }

  /** 恢复使用实时视频，并释放冻结帧。 */
  unfreeze(): void {
    this.releaseFrozenFrame()
  }

  /**
   * 根据容器尺寸和视频分辨率计算字符网格与画布尺寸。
   * 仅在容器尺寸、视频分辨率、列数或字符集变化时调用，不在逐帧路径上。
   *
   * 比例处理：
   * 1. 显示区域严格按照视频宽高比放入容器（等比缩放、居中留黑边）。
   * 2. 字符格不是正方形：宽 = 字号 × advanceRatio（约 0.6），高 = 行高。
   *    行数 = 列数 × (视频高 / 视频宽) × (字符格宽 / 字符格高)，
   *    这样每个字符格在原视频中对应的采样区域与字符格本身同比例，人物不会被拉长或压扁。
   * 3. 行数取整带来的误差用微调行高吸收，而不是拉伸画面。
   */
  layout(
    containerWidth: number,
    containerHeight: number,
    videoWidth: number,
    videoHeight: number,
    pixelRatio: number = window.devicePixelRatio || 1,
  ): boolean {
    if (containerWidth <= 0 || containerHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) return false

    const columns = this.columns
    const videoAspect = videoWidth / videoHeight
    const cssWidth = Math.min(containerWidth, containerHeight * videoAspect)
    const cssHeight = cssWidth / videoAspect
    const fontSize = cssWidth / (columns * this.advanceRatio)
    // 字符格宽高比 = advanceRatio（行高取 1 倍字号）
    const rows = Math.max(1, Math.round((columns / videoAspect) * this.advanceRatio))

    const dpr = pixelRatio > 0 ? pixelRatio : 1
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))

    resizeCanvas(this.output, pixelWidth, pixelHeight)
    this.output.style.width = `${cssWidth}px`
    this.output.style.height = `${cssHeight}px`

    this.cssWidth = cssWidth
    this.cssHeight = cssHeight
    this.rowHeight = cssHeight / rows
    this.font = `${fontSize}px ${FONT_FAMILY}`

    // 修改画布尺寸会重置上下文状态，所以每次布局后都重新设置。
    this.configureTextContext(this.outputCtx)
    if (this.textLayer && this.textLayerCtx) {
      resizeCanvas(this.textLayer, pixelWidth, pixelHeight)
      this.configureTextContext(this.textLayerCtx)
    }

    // 只有网格尺寸真的变化时才重新分配采样相关缓冲区。
    if (this.rows !== rows || this.sample.width !== columns || this.sample.height !== rows) {
      this.sample.width = columns
      this.sample.height = rows
      this.luma = new Uint8Array(columns * rows)
      this.rowCodes = new Array<number>(columns).fill(32)
      this.rows = rows
      if (this.colorCanvas) this.allocateColorImage()
    }
    this.sampleCtx.imageSmoothingEnabled = true
    this.sampleCtx.imageSmoothingQuality = 'high'

    this.outputCtx.fillStyle = BACKGROUND
    this.outputCtx.fillRect(0, 0, cssWidth, cssHeight)
    return true
  }

  /**
   * 渲染一帧。冻结时使用冻结帧，否则使用画面来源的当前帧。
   * 画面来源尚未就绪或尚未完成布局时直接跳过。
   */
  render(frameSource: FrameSource): void {
    const { columns, rows } = this
    const frozen = this.frozenFrame
    if (rows === 0) return
    if (!frozen && !frameSource.ready) return
    const source: CanvasImageSource = frozen ?? (this.compare ? this.captureCompareFrame(frameSource) : frameSource.image)

    // 1. 降采样（镜像在这里完成：只翻转采样坐标，不翻转字符）
    const sctx = this.sampleCtx
    if (this.mirror) sctx.setTransform(-1, 0, 0, 1, columns, 0)
    else sctx.setTransform(1, 0, 0, 1, 0, 0)
    sctx.drawImage(source, 0, 0, columns, rows)
    const pixels = sctx.getImageData(0, 0, columns, rows).data

    // 2. 计算明度并统计直方图
    const luma = this.luma
    const histogram = this.histogram
    histogram.fill(0)
    const cellCount = columns * rows
    for (let i = 0, p = 0; i < cellCount; i++, p += 4) {
      const y = luminance(pixels[p], pixels[p + 1], pixels[p + 2])
      luma[i] = y
      histogram[y]++
    }

    // 3. 自动色阶（只看原始明度）→ 对比度 → 亮度，得到本帧的查找表。
    //    冻结期间黑白点保持冻结那一刻的值：画面不会因为冻结而跳变，同一组参数总是得到同一张画面。
    if (!frozen || !this.levelsReady) this.updateLevels(cellCount)
    this.rebuildToneLuts()

    // 4. 绘制字符画
    if (this.mode === 'mono') {
      this.drawMono()
    } else {
      this.fillCellColors(pixels, cellCount)
      this.drawColored(this.mode === 'palette' ? this.paletteBackground : BACKGROUND)
    }

    // 5. 对比模式：同一画面来源的原画 + 分割线
    if (this.compare) this.drawCompare(source)
  }

  /** 清空画布并释放与本次会话相关的缓冲区（含冻结帧），之后需要重新 layout 才能渲染。设置保留。 */
  clear(): void {
    const ctx = this.outputCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.output.width, this.output.height)
    this.output.width = 0
    this.output.height = 0
    this.output.style.width = ''
    this.output.style.height = ''

    this.sample.width = 1
    this.sample.height = 1
    this.luma = new Uint8Array(0)
    this.rowCodes = []
    this.rows = 0
    this.cssWidth = 0
    this.cssHeight = 0
    this.levelsReady = false
    this.releaseColorResources()
    this.releaseFrozenFrame()
    this.releaseCompareFrame()
  }

  /** 组件卸载时调用。 */
  dispose(): void {
    this.clear()
    this.sample.width = 0
    this.sample.height = 0
  }

  private configureTextContext(ctx: CanvasRenderingContext2D): void {
    const canvas = ctx.canvas
    ctx.setTransform(canvas.width / this.cssWidth, 0, 0, canvas.height / this.cssHeight, 0, 0)
    ctx.font = this.font
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
  }

  /** 逐行拼接字符串，每行只调用一次 fillText。 */
  private drawRows(ctx: CanvasRenderingContext2D): void {
    const { columns, rows, rowHeight } = this
    const charLut = this.charLut
    const luma = this.luma
    const rowCodes = this.rowCodes
    const maxWidth = this.cssWidth
    for (let r = 0, i = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++, i++) rowCodes[c] = charLut[luma[i]]
      const line = String.fromCharCode.apply(null, rowCodes)
      ctx.fillText(line, 0, (r + 0.5) * rowHeight, maxWidth)
    }
  }

  /** 黑白模式：黑底白字。 */
  private drawMono(): void {
    const ctx = this.outputCtx
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight)
    ctx.fillStyle = FOREGROUND
    this.drawRows(ctx)
  }

  /** 原色：每个格子取采样区域颜色（经过同一套色阶 / 对比度 / 亮度）；调色板：按色调查渐变表。 */
  private fillCellColors(pixels: Uint8ClampedArray, cellCount: number): void {
    this.ensureColorResources()
    const data = this.colorImage!.data
    const toneLut = this.toneLut
    if (this.mode === 'color') {
      for (let p = 0, end = cellCount * 4; p < end; p += 4) {
        data[p] = toneLut[pixels[p]]
        data[p + 1] = toneLut[pixels[p + 1]]
        data[p + 2] = toneLut[pixels[p + 2]]
      }
    } else {
      const luma = this.luma
      const { r: lutR, g: lutG, b: lutB } = this.paletteLut
      for (let i = 0, p = 0; i < cellCount; i++, p += 4) {
        const tone = toneLut[luma[i]]
        data[p] = lutR[tone]
        data[p + 1] = lutG[tone]
        data[p + 2] = lutB[tone]
      }
    }
  }

  private drawColored(background: string): void {
    const layerCtx = this.textLayerCtx!
    const { cssWidth, cssHeight } = this

    // 1. 色块图：每个字符格一个像素
    this.colorCtx!.putImageData(this.colorImage!, 0, 0)

    // 2. 白色文字层
    layerCtx.globalCompositeOperation = 'source-over'
    layerCtx.clearRect(0, 0, cssWidth, cssHeight)
    layerCtx.fillStyle = FOREGROUND
    this.drawRows(layerCtx)

    // 3. 用色块图给文字着色：source-in 只保留文字覆盖的像素，最近邻放大保证每个字符格颜色独立
    layerCtx.globalCompositeOperation = 'source-in'
    layerCtx.imageSmoothingEnabled = false
    layerCtx.drawImage(this.colorCanvas!, 0, 0, cssWidth, cssHeight)
    layerCtx.globalCompositeOperation = 'source-over'

    // 4. 合成到背景（原色模式为黑色，调色板模式为调色板背景色）
    const ctx = this.outputCtx
    ctx.fillStyle = background
    ctx.fillRect(0, 0, cssWidth, cssHeight)
    ctx.drawImage(this.textLayer!, 0, 0, cssWidth, cssHeight)
  }

  /** 对比模式：分割线右侧绘制原画（与字符画同一来源、同一镜像设置），再画分割线。 */
  private drawCompare(source: CanvasImageSource): void {
    const ctx = this.outputCtx
    const { cssWidth, cssHeight } = this
    const splitX = cssWidth * this.split

    if (splitX < cssWidth) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(splitX, 0, cssWidth - splitX, cssHeight)
      ctx.clip()
      if (this.mirror) {
        ctx.translate(cssWidth, 0)
        ctx.scale(-1, 1)
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, 0, 0, cssWidth, cssHeight)
      ctx.restore()
    }

    const half = DIVIDER_WIDTH / 2
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.fillRect(splitX - half - DIVIDER_OUTLINE, 0, DIVIDER_WIDTH + DIVIDER_OUTLINE * 2, cssHeight)
    ctx.fillStyle = FOREGROUND
    ctx.fillRect(splitX - half, 0, DIVIDER_WIDTH, cssHeight)
  }

  private ensureColorResources(): void {
    if (!this.textLayer) {
      const layer = document.createElement('canvas')
      const layerCtx = layer.getContext('2d')
      const colorCanvas = document.createElement('canvas')
      const colorCtx = colorCanvas.getContext('2d', { alpha: false })
      if (!layerCtx || !colorCtx) throw new RendererUnsupportedError()
      this.textLayer = layer
      this.textLayerCtx = layerCtx
      this.colorCanvas = colorCanvas
      this.colorCtx = colorCtx
      resizeCanvas(layer, this.output.width, this.output.height)
      this.configureTextContext(layerCtx)
      this.allocateColorImage()
    }
  }

  private allocateColorImage(): void {
    if (!this.colorCanvas || !this.colorCtx) return
    resizeCanvas(this.colorCanvas, this.columns, this.rows)
    const image = this.colorCtx.createImageData(this.columns, this.rows)
    // 只在分配时写入一次不透明 alpha，逐帧只更新 RGB。
    for (let p = 3; p < image.data.length; p += 4) image.data[p] = 255
    this.colorImage = image
  }

  private releaseColorResources(): void {
    if (this.textLayer) {
      this.textLayer.width = 0
      this.textLayer.height = 0
    }
    if (this.colorCanvas) {
      this.colorCanvas.width = 0
      this.colorCanvas.height = 0
    }
    this.textLayer = null
    this.textLayerCtx = null
    this.colorCanvas = null
    this.colorCtx = null
    this.colorImage = null
  }

  /** 把画面来源的当前帧按原始分辨率复制到对比用画布（不缩放，采样结果与直接读取来源相同）。 */
  private captureCompareFrame(source: FrameSource): CanvasImageSource {
    const width = source.width
    const height = source.height
    if (width === 0 || height === 0) return source.image
    if (!this.compareFrame) {
      this.compareFrame = document.createElement('canvas')
      this.compareFrameCtx = this.compareFrame.getContext('2d', { alpha: false })
    }
    const ctx = this.compareFrameCtx
    if (!ctx) return source.image
    resizeCanvas(this.compareFrame, width, height)
    ctx.drawImage(source.image, 0, 0, width, height)
    return this.compareFrame
  }

  private releaseCompareFrame(): void {
    if (this.compareFrame) {
      this.compareFrame.width = 0
      this.compareFrame.height = 0
    }
    this.compareFrame = null
    this.compareFrameCtx = null
  }

  private releaseFrozenFrame(): void {
    if (this.frozenFrame) {
      this.frozenFrame.width = 0
      this.frozenFrame.height = 0
    }
    this.frozenFrame = null
  }

  private updateLevels(total: number): void {
    const histogram = this.histogram
    const lowTarget = total * LEVEL_LOW_PERCENTILE
    const highTarget = total * LEVEL_HIGH_PERCENTILE
    let low = 0
    let high = 255
    let acc = 0
    let foundLow = false
    for (let v = 0; v < 256; v++) {
      acc += histogram[v]
      if (!foundLow && acc > lowTarget) {
        low = v
        foundLow = true
      }
      if (acc >= highTarget) {
        high = v
        break
      }
    }

    if (high - low < LEVEL_MIN_RANGE) {
      const center = (low + high) / 2
      low = Math.max(0, center - LEVEL_MIN_RANGE / 2)
      high = Math.min(255, low + LEVEL_MIN_RANGE)
      low = high - LEVEL_MIN_RANGE
    }

    if (!this.levelsReady) {
      this.levelLow = low
      this.levelHigh = high
      this.levelsReady = true
    } else {
      this.levelLow += (low - this.levelLow) * LEVEL_SMOOTHING
      this.levelHigh += (high - this.levelHigh) * LEVEL_SMOOTHING
    }
  }

  /**
   * 生成本帧的 256 级查找表，处理顺序固定为：
   *   1. 自动色阶：把 [黑点, 白点] 拉伸到 0～1（黑白点只由原始画面决定）
   *   2. 对比度：以 0.5 为中心缩放
   *   3. 亮度：整体平移
   * 手动调整位于自动色阶之后，自动色阶统计的是调整前的画面，因此不会把用户的调整“拉回去”。
   */
  private rebuildToneLuts(): void {
    const low = this.levelLow
    const range = Math.max(1, this.levelHigh - low)
    const contrast = this.contrast / 100
    const offset = (this.brightness / BRIGHTNESS_MAX) * BRIGHTNESS_RANGE
    const rampLut = this.rampLut
    const toneLut = this.toneLut
    const charLut = this.charLut
    for (let v = 0; v < 256; v++) {
      let t = (v - low) / range
      t = t < 0 ? 0 : t > 1 ? 1 : t
      t = (t - 0.5) * contrast + 0.5 + offset
      const tone = Math.round((t < 0 ? 0 : t > 1 ? 1 : t) * 255)
      toneLut[v] = tone
      charLut[v] = rampLut[tone]
    }
  }
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}
