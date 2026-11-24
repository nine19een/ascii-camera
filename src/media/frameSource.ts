/**
 * 统一的画面来源：摄像头（HTMLVideoElement）与演示视频（复制到帧画布上的雕塑视频）都通过它进入同一条 ASCII 渲染管线。
 * 渲染器只关心“当前帧的图像、宽高、是否就绪”，不再依赖具体的媒体类型。
 */
import type { DemoSource } from '../demo/DemoSource'

export type FrameSourceKind = 'camera' | 'demo'

export interface FrameSource {
  readonly kind: FrameSourceKind
  /** 当前帧，可直接用于 drawImage。 */
  readonly image: CanvasImageSource
  readonly width: number
  readonly height: number
  /** 是否已有可绘制的画面。 */
  readonly ready: boolean
}

export class VideoFrameSource implements FrameSource {
  readonly kind = 'camera' as const
  private readonly video: HTMLVideoElement

  constructor(video: HTMLVideoElement) {
    this.video = video
  }

  get image(): CanvasImageSource {
    return this.video
  }

  get width(): number {
    return this.video.videoWidth
  }

  get height(): number {
    return this.video.videoHeight
  }

  get ready(): boolean {
    return this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.video.videoWidth > 0
  }
}

export class DemoFrameSource implements FrameSource {
  readonly kind = 'demo' as const
  private readonly demo: DemoSource

  constructor(demo: DemoSource) {
    this.demo = demo
  }

  get image(): CanvasImageSource {
    return this.demo.canvas
  }

  get width(): number {
    return this.demo.width
  }

  get height(): number {
    return this.demo.height
  }

  get ready(): boolean {
    return this.demo.hasFrame
  }

  /** 把演示画面更新到视频当前帧（同一视频帧内重复调用不会重复复制）。 */
  update(now?: number): void {
    this.demo.update(now)
  }
}
