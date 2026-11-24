export type FrameLoopKind = 'video-frame' | 'animation-frame'

export interface FrameLoop {
  /** 当前使用的调度方式（requestVideoFrameCallback 或 requestAnimationFrame）。 */
  readonly kind: FrameLoopKind
  /** 停止循环并取消尚未执行的回调。可以重复调用。 */
  stop(): void
}

export interface FrameLoopOptions {
  onFrame: () => void
  onError: (error: unknown) => void
  /** 只用于 requestAnimationFrame 模式：最高渲染帧率（演示动画为 30）。 */
  maxFps?: number
}

/**
 * 如果视频在播放、页面可见，但 requestVideoFrameCallback 超过这个时间仍未回调，
 * 就认为该浏览器在当前条件下（例如视频元素不可见）不派发视频帧回调，改用 rAF。
 */
const VIDEO_FRAME_STALL_MS = 1500

/**
 * 启动一个渲染循环。
 *
 * 优先使用 requestVideoFrameCallback：只在摄像头真正产出新帧时渲染，
 * 30fps 的摄像头不会在 60/120Hz 屏幕上重复计算同一帧。
 * 不支持时回退到 requestAnimationFrame。
 *
 * 每个循环通过闭包内的 active 标记保证：stop() 之后不会再执行任何渲染，
 * 也不会再调度新的回调。
 */
export function startFrameLoop(
  video: HTMLVideoElement | null,
  { onFrame, onError, maxFps }: FrameLoopOptions,
): FrameLoop {
  let active = true
  let kind: FrameLoopKind =
    video && typeof video.requestVideoFrameCallback === 'function' ? 'video-frame' : 'animation-frame'
  // 没有视频（演示动画）时只能使用 rAF；按 maxFps 节流，留 1ms 容差避免在 60Hz 屏幕上丢帧
  const minInterval = maxFps ? 1000 / maxFps - 1 : 0
  let lastRaf = -Infinity
  let videoFrameHandle = 0
  let animationFrameHandle = 0
  let watchdog = 0
  let lastFrameAt = performance.now()

  const runFrame = (): boolean => {
    lastFrameAt = performance.now()
    try {
      onFrame()
      return true
    } catch (error) {
      stop()
      onError(error)
      return false
    }
  }

  const onVideoFrame = () => {
    videoFrameHandle = 0
    if (!active || kind !== 'video-frame' || !video) return
    if (runFrame() && active) videoFrameHandle = video.requestVideoFrameCallback(onVideoFrame)
  }

  const onAnimationFrame = (now: number) => {
    animationFrameHandle = 0
    if (!active) return
    if (now - lastRaf >= minInterval) {
      lastRaf = now
      if (!runFrame()) return
    }
    if (active) animationFrameHandle = requestAnimationFrame(onAnimationFrame)
  }

  const cancelPending = () => {
    if (videoFrameHandle && video) {
      video.cancelVideoFrameCallback(videoFrameHandle)
      videoFrameHandle = 0
    }
    if (animationFrameHandle) {
      cancelAnimationFrame(animationFrameHandle)
      animationFrameHandle = 0
    }
  }

  const fallbackToAnimationFrame = () => {
    cancelPending()
    kind = 'animation-frame'
    animationFrameHandle = requestAnimationFrame(onAnimationFrame)
  }

  // 页面从后台切回前台时重新计时，避免把“后台暂停”误判为“回调失效”。
  const onVisibilityChange = () => {
    lastFrameAt = performance.now()
  }

  function stop() {
    if (!active) return
    active = false
    cancelPending()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (watchdog) {
      clearInterval(watchdog)
      watchdog = 0
    }
  }

  if (kind === 'video-frame' && video) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    videoFrameHandle = video.requestVideoFrameCallback(onVideoFrame)
    watchdog = window.setInterval(() => {
      if (!active || kind !== 'video-frame') {
        clearInterval(watchdog)
        watchdog = 0
        return
      }
      const playing = !video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      if (playing && !document.hidden && performance.now() - lastFrameAt > VIDEO_FRAME_STALL_MS) {
        clearInterval(watchdog)
        watchdog = 0
        fallbackToAnimationFrame()
      }
    }, VIDEO_FRAME_STALL_MS)
  } else {
    animationFrameHandle = requestAnimationFrame(onAnimationFrame)
  }

  return {
    get kind() {
      return kind
    },
    stop,
  }
}
