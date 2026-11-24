import demoPosterUrl from './statue-poster.jpg'
import demoVideoUrl from './statue-demo.mp4'

/** 演示素材的帧率。主预览按这个上限刷新。 */
export const DEMO_FPS = 30

/** 视频迟迟拿不到画面（例如自动播放被系统拦截且没有预载）时，改用静态海报帧的等待时间。 */
const POSTER_FALLBACK_MS = 2500
/** 视频意外暂停后自动恢复播放的最小间隔。 */
const RESUME_RETRY_MS = 1000

export type DemoPlayback = 'loading' | 'playing' | 'blocked' | 'poster' | 'failed'

/**
 * 全产品唯一的演示画面来源：一段雕塑旋转视频（1280×720，30 FPS，10 秒一周，首尾无缝）。
 *
 * - 只有一个 <video> 元素、一路解码。每出现一帧新画面，就复制到一张帧画布上；主预览与六张预设卡片
 *   都从这张画布取画面，因此它们看到的是同一帧、同一时间基准（视频的 currentTime）。
 * - 惰性复制：同一视频帧内多次调用 update() 只复制一次。
 * - 视频静音、循环、playsinline；页面隐藏时暂停，回到前台继续。
 * - 浏览器拦截自动播放（例如 iPhone 低电量模式）时先显示已解码的第一帧（或海报帧），
 *   并在用户第一次点按页面时恢复播放；视频无法加载或解码时改用海报帧，画面保持可用。
 * - 冻结主预览不会影响这里：渲染器会把冻结帧复制到自己的画布中，视频照常播放（预设卡片继续动）。
 */
export class DemoSource {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null = null
  private video: HTMLVideoElement | null = null
  private poster: HTMLImageElement | null = null
  private frame = -1
  /** 最近一次复制的视频帧号 */
  private lastMediaTime = -1
  private startedAt = 0
  private lastResume = 0
  private released = false
  private playback: DemoPlayback = 'loading'
  private readonly listeners: Array<() => void> = []

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 0
    this.canvas.height = 0
  }

  /** 帧画布的尺寸（拿到第一帧之前为 0）。 */
  get width(): number {
    return this.canvas.width
  }

  get height(): number {
    return this.canvas.height
  }

  get hasFrame(): boolean {
    return this.frame >= 0
  }

  /** 已复制的帧数（-1 表示尚无画面）。 */
  get frameNumber(): number {
    return this.frame
  }

  /** 当前帧在循环中的时间（秒）。 */
  get loopTime(): number {
    return this.video ? this.video.currentTime : 0
  }

  get state(): DemoPlayback {
    return this.playback
  }

  /** 唯一的解码来源（测试与诊断用）。 */
  get element(): HTMLVideoElement | null {
    return this.video
  }

  /** 把帧画布更新到视频当前显示的帧。同一视频帧内重复调用不会重复复制。 */
  update(now: number = performance.now()): void {
    if (this.released) this.released = false
    const video = this.ensureVideo(now)
    if (this.playback === 'failed') return

    const hasData = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0
    // 只在视频换了一帧时复制：播放时间按素材帧率量化成帧号，主预览（30 FPS）与预设卡片（约 10 FPS）
    // 落在同一视频帧时共用一次复制。不用 requestVideoFrameCallback：它只属于摄像头的渲染循环。
    const frameKey = Math.floor(video.currentTime * DEMO_FPS + 1e-3)
    if (hasData && (frameKey !== this.lastMediaTime || this.frame < 0 || this.playback === 'poster')) {
      // 视频有画面后总是由视频接管（包括先显示了海报帧的情况）
      if (this.playback === 'poster') this.playback = video.paused ? 'blocked' : 'playing'
      this.copy(video, video.videoWidth, video.videoHeight)
      this.lastMediaTime = frameKey
    }

    // 视频被意外暂停（系统省电、浏览器策略等）：页面可见时自动恢复
    if (video.paused && this.playback === 'playing' && !document.hidden && now - this.lastResume > RESUME_RETRY_MS) {
      this.lastResume = now
      this.play()
    }
    // 迟迟没有画面：先用海报帧顶上（视频之后能播放时会接管）
    if (!hasData && this.frame < 0 && now - this.startedAt > POSTER_FALLBACK_MS) this.showPoster()
  }

  /** 释放视频解码器与帧画布；之后再次调用 update() 会重新创建。 */
  release(): void {
    this.released = true
    for (const off of this.listeners.splice(0)) off()
    const video = this.video
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load() // 让浏览器立即释放解码器和缓冲
      video.remove()
    }
    this.video = null
    this.poster = null
    this.canvas.width = 0
    this.canvas.height = 0
    this.ctx = null
    this.frame = -1
    this.lastMediaTime = -1
    this.playback = 'loading'
  }

  // ---------------------------------------------------------------------------

  private ensureVideo(now: number): HTMLVideoElement {
    if (this.video) return this.video
    const video = document.createElement('video')
    video.muted = true
    video.defaultMuted = true
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'
    video.setAttribute('muted', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.setAttribute('aria-hidden', 'true')
    video.tabIndex = -1
    video.disablePictureInPicture = true
    // 与摄像头的输入视频相同：放在页面里但不可见（不用 display:none，部分浏览器会因此停止解码）
    video.className = 'source-video demo-video'
    video.src = demoVideoUrl
    this.video = video
    this.startedAt = now
    document.body.appendChild(video)

    const on = <K extends keyof HTMLMediaElementEventMap>(type: K, handler: () => void) => {
      video.addEventListener(type, handler)
      this.listeners.push(() => video.removeEventListener(type, handler))
    }
    on('error', () => this.showPoster(true))
    on('playing', () => {
      if (this.playback !== 'failed') this.playback = 'playing'
    })
    const onVisibility = () => {
      if (!this.video) return
      if (document.hidden) this.video.pause()
      else if (this.playback !== 'failed') this.play()
    }
    document.addEventListener('visibilitychange', onVisibility)
    this.listeners.push(() => document.removeEventListener('visibilitychange', onVisibility))

    if (!document.hidden) this.play()
    return video
  }

  private play(): void {
    const video = this.video
    if (!video) return
    const attempt = video.play()
    if (!attempt) return
    attempt.then(
      () => {
        this.playback = 'playing'
      },
      (error: unknown) => {
        if (!this.video || this.released) return
        const name = error instanceof DOMException ? error.name : ''
        if (name === 'NotAllowedError') this.waitForGesture()
        // AbortError：play() 被随后的 pause() / 换源打断，属于正常情况
      },
    )
  }

  /** 自动播放被拦截：显示已有画面，用户第一次与页面交互时再播放。 */
  private waitForGesture(): void {
    if (this.playback === 'blocked') return
    this.playback = 'blocked'
    const resume = () => {
      off()
      if (this.video && !this.released) this.play()
    }
    const off = () => {
      window.removeEventListener('pointerdown', resume, true)
      window.removeEventListener('keydown', resume, true)
    }
    window.addEventListener('pointerdown', resume, true)
    window.addEventListener('keydown', resume, true)
    this.listeners.push(off)
  }

  /** 视频不可用：改用同一素材的静态海报帧。failed 为真时不再尝试视频。 */
  private showPoster(failed = false): void {
    if (failed) this.playback = 'failed'
    if (this.poster) return
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (this.poster !== img) return
      const video = this.video
      const videoHasFrame = !failed && video !== null && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.frame >= 0
      if (videoHasFrame) return
      if (this.playback !== 'failed') this.playback = 'poster'
      this.copy(img, img.naturalWidth, img.naturalHeight)
    }
    img.src = demoPosterUrl
    this.poster = img
  }

  private copy(image: CanvasImageSource, width: number, height: number): void {
    if (!this.ctx || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.ctx = this.canvas.getContext('2d', { alpha: false })
      if (!this.ctx) return
    }
    this.ctx.drawImage(image, 0, 0, width, height)
    this.frame += 1
  }
}
