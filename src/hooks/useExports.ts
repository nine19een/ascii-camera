import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  CanvasRecorder,
  supportedVideoContainers,
  type VideoContainer,
  type RecordingResult,
} from '../export/canvasRecorder'
import { ObjectUrlStore, exportFileName, triggerDownload } from '../export/download'
import { toExportError, type ExportErrorCode } from '../export/exportError'
import { GIF_MAX_DURATION_MS, GifRecorder, isGifSupported, type GifProgress, type GifResult } from '../export/gifRecorder'

export type VideoRecordingState = 'idle' | 'recording' | 'finalizing'
export type GifState = 'idle' | 'recording' | 'encoding'

export interface ExportResult {
  kind: 'video' | 'gif'
  url: string
  filename: string
  bytes: number
  durationMs: number
  width: number
  height: number
  /** 视频容器收尾失败，交付的是原始文件（界面提示部分播放器可能无法显示时长或拖动）。 */
  fallback?: boolean
}

/** 导出相关的提示：只记录类别和参数，文字由界面按当前语言生成（切换语言后随之更新）。 */
export type ExportMessage =
  | { tone: 'error'; kind: 'snapshot-not-ready' }
  | { tone: 'error'; kind: 'snapshot-failed' }
  | { tone: 'info'; kind: 'snapshot-saved'; filename: string; width: number; height: number }
  | { tone: 'error'; kind: 'video-failed'; code: ExportErrorCode; detail?: string }
  | { tone: 'error'; kind: 'gif-failed'; code: ExportErrorCode; detail?: string }
  | { tone: 'info'; kind: 'gif-limit'; seconds: number }
  | { tone: 'info'; kind: 'gif-cancelled' }

function failure(kind: 'video-failed' | 'gif-failed', error: unknown, fallback: ExportErrorCode): ExportMessage {
  const { code, detail } = toExportError(error, fallback)
  return { tone: 'error', kind, code, detail }
}

/** 截图的 Blob URL 保留时间：足够浏览器开始下载，之后立即释放。 */
const SNAPSHOT_URL_TTL_MS = 4000

/**
 * 截图、视频录制、GIF 录制。三者都以最终合成画布（可见画布）为唯一来源，不重复实现渲染逻辑。
 *
 * 冲突处理：
 * - 视频录制与 GIF 录制互斥；重复点击不会创建第二个录制实例。
 * - 录制只读取最终合成画布，不依赖画面来源：录制期间开启 / 停止摄像头（在摄像头与演示动画之间切换）
 *   不会中断录制，也不会留下失效资源；画布尺寸变化时录制内容等比缩放。
 * - 页面离开 / 组件卸载：放弃所有录制与编码，终止 Worker，释放所有 Blob URL。
 */
/**
 * @param videoContainer 视频录制使用的封装（MP4 / WebM）；只在开始录制时读取，录制中改变不影响当前录制。
 */
export function useExports(canvasRef: RefObject<HTMLCanvasElement | null>, videoContainer: VideoContainer = 'mp4') {
  const [videoState, setVideoState] = useState<VideoRecordingState>('idle')
  const [videoStartedAt, setVideoStartedAt] = useState(0)
  const [gifState, setGifState] = useState<GifState>('idle')
  const [gifProgress, setGifProgress] = useState<GifProgress | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [message, setMessage] = useState<ExportMessage | null>(null)
  const [now, setNow] = useState(() => performance.now())
  const [videoContainers] = useState(supportedVideoContainers)
  const videoSupported = videoContainers.mp4 || videoContainers.webm
  const containerRef = useRef(videoContainer)
  useEffect(() => {
    containerRef.current = videoContainer
  }, [videoContainer])
  const [gifSupported] = useState(isGifSupported)

  const urlsRef = useRef<ObjectUrlStore | null>(null)
  const videoRef = useRef<CanvasRecorder | null>(null)
  const gifRef = useRef<GifRecorder | null>(null)
  const resultUrlRef = useRef<string | null>(null)
  const gifProgressRef = useRef<GifProgress | null>(null)
  /** pagehide / 卸载后忽略尚未返回的 PNG 编码回调。 */
  const generationRef = useRef(0)

  const urls = useCallback(() => {
    if (!urlsRef.current) urlsRef.current = new ObjectUrlStore()
    return urlsRef.current
  }, [])

  /** 交付录制结果：自动下载一次，并保留下载链接直到被下一个结果替换或页面卸载。 */
  const deliver = useCallback(
    (next: Omit<ExportResult, 'url'>, blob: Blob) => {
      const store = urls()
      if (resultUrlRef.current) store.revoke(resultUrlRef.current)
      const url = store.create(blob)
      resultUrlRef.current = url
      setResult({ ...next, url })
      triggerDownload(url, next.filename)
    },
    [urls],
  )

  const dismissResult = useCallback(() => {
    if (resultUrlRef.current) urls().revoke(resultUrlRef.current)
    resultUrlRef.current = null
    setResult(null)
  }, [urls])

  // ---------------------------------------------------------------------------
  // PNG 截图

  const snapshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || canvas.width < 1 || canvas.height < 1) {
      setMessage({ tone: 'error', kind: 'snapshot-not-ready' })
      return
    }
    const filename = exportFileName('png')
    const generation = generationRef.current
    const { width, height } = canvas
    // toBlob 按画布的实际像素尺寸（含 devicePixelRatio）导出，不额外缩放
    canvas.toBlob((blob) => {
      if (generation !== generationRef.current) return
      if (!blob) {
        setMessage({ tone: 'error', kind: 'snapshot-failed' })
        return
      }
      const store = urls()
      const url = store.create(blob)
      triggerDownload(url, filename)
      store.revokeLater(url, SNAPSHOT_URL_TTL_MS)
      setMessage({ tone: 'info', kind: 'snapshot-saved', filename, width, height })
    }, 'image/png')
  }, [canvasRef, urls])

  // ---------------------------------------------------------------------------
  // 视频录制

  const startVideo = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || videoRef.current || gifRef.current) return
    const recorder = new CanvasRecorder(canvas, {
      fps: 30,
      container: containerRef.current,
      onComplete: (recording: RecordingResult) => {
        videoRef.current = null
        setVideoState('idle')
        const filename = exportFileName(recording.format.extension)
        deliver(
          {
            kind: 'video',
            filename,
            bytes: recording.blob.size,
            durationMs: recording.durationMs,
            width: recording.width,
            height: recording.height,
            fallback: recording.fallback,
          },
          recording.blob,
        )
      },
      onError: (error) => {
        videoRef.current = null
        setVideoState('idle')
        setMessage(failure('video-failed', error, 'recorder'))
      },
    })
    try {
      recorder.start()
    } catch (error) {
      setMessage(failure('video-failed', error, 'recorder'))
      return
    }
    videoRef.current = recorder
    setVideoStartedAt(recorder.startTime)
    setVideoState('recording')
    setMessage(null)
  }, [canvasRef, deliver])

  const stopVideo = useCallback(() => {
    const recorder = videoRef.current
    if (!recorder) return
    setVideoState('finalizing')
    recorder.stop()
  }, [])

  // ---------------------------------------------------------------------------
  // GIF

  const startGif = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || videoRef.current || gifRef.current) return
    const recorder = new GifRecorder(canvas, {
      onProgress: (progress) => {
        gifProgressRef.current = progress
        if (progress.phase === 'encoding') {
          setGifState('encoding')
          setGifProgress(progress)
        }
      },
      onComplete: (gif: GifResult) => {
        gifRef.current = null
        gifProgressRef.current = null
        setGifState('idle')
        setGifProgress(null)
        deliver(
          {
            kind: 'gif',
            filename: exportFileName('gif'),
            bytes: gif.blob.size,
            durationMs: gif.durationMs,
            width: gif.width,
            height: gif.height,
          },
          gif.blob,
        )
        setMessage(null)
      },
      onError: (error) => {
        gifRef.current = null
        gifProgressRef.current = null
        setGifState('idle')
        setGifProgress(null)
        setMessage(failure('gif-failed', error, 'encoder'))
      },
      onAutoStop: () =>
        setMessage({ tone: 'info', kind: 'gif-limit', seconds: GIF_MAX_DURATION_MS / 1000 }),
    })
    try {
      recorder.start()
    } catch (error) {
      setMessage(failure('gif-failed', error, 'encoder'))
      return
    }
    gifRef.current = recorder
    setGifState('recording')
    setMessage(null)
  }, [canvasRef, deliver])

  const stopGif = useCallback(() => {
    gifRef.current?.stop()
  }, [])

  const cancelGif = useCallback(() => {
    const recorder = gifRef.current
    if (!recorder) return
    recorder.cancel()
    gifRef.current = null
    gifProgressRef.current = null
    setGifState('idle')
    setGifProgress(null)
    setMessage({ tone: 'info', kind: 'gif-cancelled' })
  }, [])

  // 录制中每 250ms 更新一次计时与 GIF 进度显示（不随视频帧刷新 React）。
  const ticking = videoState === 'recording' || gifState === 'recording'
  useEffect(() => {
    if (!ticking) return
    const timer = window.setInterval(() => {
      setNow(performance.now())
      if (gifProgressRef.current) setGifProgress(gifProgressRef.current)
    }, 250)
    return () => clearInterval(timer)
  }, [ticking])

  // 页面离开 / 卸载：放弃所有录制与编码，释放 Worker 与 Blob URL
  useEffect(() => {
    const abortAll = () => {
      generationRef.current += 1
      videoRef.current?.abort()
      videoRef.current = null
      gifRef.current?.cancel()
      gifRef.current = null
      urlsRef.current?.revokeAll()
      resultUrlRef.current = null
      gifProgressRef.current = null
    }
    const onPageHide = () => {
      abortAll()
      // 页面可能从往返缓存恢复：界面回到空闲状态
      setVideoState('idle')
      setGifState('idle')
      setGifProgress(null)
      setResult(null)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      abortAll()
    }
  }, [])

  const videoElapsedMs = videoState === 'recording' ? Math.max(0, now - videoStartedAt) : 0

  return {
    videoSupported,
    videoContainers,
    gifSupported,
    videoState,
    videoElapsedMs,
    gifState,
    gifProgress,
    /** 是否有录制在进行（用于锁定摄像头切换等操作）。GIF 编码阶段不再依赖摄像头。 */
    recording: videoState !== 'idle' || gifState === 'recording',
    busy: videoState !== 'idle' || gifState !== 'idle',
    result,
    message,
    snapshot,
    startVideo,
    stopVideo,
    startGif,
    stopGif,
    cancelGif,
    dismissResult,
    dismissMessage: () => setMessage(null),
  }
}
