import { useCallback, useEffect, useRef, useState } from 'react'
import { AsciiRenderer, RendererUnsupportedError, type GridSize } from '../ascii/AsciiRenderer'
import { DEFAULT_CUSTOM_RAMP, parseCustomRamp, type CharsetId, type RampParseResult } from '../ascii/charset'
import { isSingleCellGlyph } from '../ascii/glyphMetrics'
import { resolvePresetRamp } from '../ascii/resolveRamp'
import {
  BUILTIN_PALETTES,
  DEFAULT_PALETTE,
  getBuiltinPalette,
  isHexColor,
  type BuiltinPaletteId,
  type PaletteColors,
  type PaletteId,
} from '../ascii/palettes'
import { DEFAULT_LOOK_PRESET, getLookPreset, matchLookPreset, type LookPresetId } from '../ascii/presets'
import { DEFAULT_SPLIT, clamp, normalizeColumns, type RenderMode } from '../ascii/settings'
import {
  DISCONNECTED_ERROR,
  UNSUPPORTED_CANVAS_ERROR,
  describeCameraError,
  getCameraSupportError,
  getStreamDeviceId,
  playbackError,
  renderError,
  requestCameraStream,
  stopStream,
  type CameraError,
  type CameraErrorCode,
} from '../camera/camera'
import { startFrameLoop, type FrameLoop } from '../camera/frameLoop'
import { DemoSource } from '../demo/DemoSource'
import { DemoFrameSource, VideoFrameSource, type FrameSource, type FrameSourceKind } from '../media/frameSource'
import { useCameraDevices } from './useCameraDevices'

export type CameraStatus = 'idle' | 'starting' | 'running' | 'error'

/** 切换摄像头时的提示：只记录类别，文字由界面按当前语言生成。 */
export type CameraNotice =
  | { kind: 'switch-locked' }
  | { kind: 'switch-unavailable' }
  | { kind: 'switch-failed'; error: CameraErrorCode }
  | { kind: 'switch-restored'; error: CameraErrorCode }

export interface DisplaySize {
  width: number
  height: number
}

interface PipelineState {
  status: CameraStatus
  error: CameraError | null
  /** 主画面当前的画面来源：演示动画或摄像头。 */
  source: FrameSourceKind
  grid: GridSize | null
  /** 字符画在页面上的显示尺寸（CSS 像素），用于对齐对比滑杆等覆盖层。 */
  displaySize: DisplaySize | null
  frozen: boolean
}

const INITIAL_STATE: PipelineState = {
  status: 'idle',
  error: null,
  source: 'demo',
  grid: null,
  displaySize: null,
  frozen: false,
}

/** 一次摄像头会话内可用的操作。会话结束（停止、出错、卸载、离开页面）后失效。 */
interface SessionApi {
  session: number
  attachStream: (stream: MediaStream) => Promise<boolean>
}

const DEMO_FPS_LIMIT = 30
const initialLook = getLookPreset(DEFAULT_LOOK_PRESET).config

/**
 * 主画面渲染管线 + 摄像头生命周期 + 视觉参数。
 *
 * 主渲染管线常驻（渲染器、当前画面来源、唯一的渲染循环、尺寸监听），画面来源在两者之间切换：
 * - 演示动画（Demo Mode）：页面打开即播放；摄像头未运行、启动中、停止或出错时都显示演示动画，预览永不空白。
 * - 摄像头：启动成功、视频开始播放后才切换过来，沿用当前全部视觉参数。
 * 两种来源走同一条渲染、对比、冻结和导出路径。
 *
 * React 状态只在状态切换、网格尺寸变化和控件操作时更新，逐帧渲染完全在 React 之外。
 *
 * 并发与清理策略（沿用第一阶段）：
 * - sessionRef 是递增的摄像头会话号；start / stop / 出错 / 卸载 / 页面离开都会让它 +1，
 *   异步流程在每个 await 之后检查会话号，过期就立即释放刚拿到的资源并退出。
 * - 渲染循环只通过 startMainLoop 启动，它总是先停止旧循环，因此任何时刻最多一个渲染循环。
 */
export function useAsciiCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const [demo] = useState(() => new DemoSource())
  const [demoFrames] = useState(() => new DemoFrameSource(demo))

  const [state, setState] = useState<PipelineState>(INITIAL_STATE)
  const [notice, setNotice] = useState<CameraNotice | null>(null)
  const [switching, setSwitching] = useState(false)
  const [activeDeviceId, setActiveDeviceId] = useState('')
  const [preferredDeviceId, setPreferredDeviceId] = useState('')

  const [mirror, setMirrorState] = useState(true)
  const [mode, setModeState] = useState<RenderMode>(initialLook.mode)
  const [columns, setColumnsState] = useState(initialLook.columns)
  const [brightness, setBrightnessState] = useState(initialLook.brightness)
  const [contrast, setContrastState] = useState(initialLook.contrast)
  const [charset, setCharsetState] = useState<CharsetId>(initialLook.charset)
  const [customRampInput, setCustomRampInputState] = useState(DEFAULT_CUSTOM_RAMP)
  const [customRampResult, setCustomRampResult] = useState<RampParseResult | null>(null)
  const [paletteId, setPaletteIdState] = useState<PaletteId>(DEFAULT_PALETTE)
  const [customPalette, setCustomPaletteState] = useState<PaletteColors>(() => ({
    ...getBuiltinPalette(DEFAULT_PALETTE).colors,
  }))
  const [customPaletteBase, setCustomPaletteBase] = useState<BuiltinPaletteId>(DEFAULT_PALETTE)
  const [compare, setCompareState] = useState(false)
  const [split, setSplitState] = useState(DEFAULT_SPLIT)

  // 渲染参数同时保存在 ref 中：调整时直接写入渲染器，不经过 React 渲染。
  const mirrorRef = useRef(true)
  const modeRef = useRef<RenderMode>(initialLook.mode)
  const columnsRef = useRef(initialLook.columns)
  const brightnessRef = useRef(initialLook.brightness)
  const contrastRef = useRef(initialLook.contrast)
  const rampRef = useRef(resolvePresetRamp(initialLook.charset))
  const charsetRef = useRef<CharsetId>(initialLook.charset)
  const customRampRef = useRef<string | null>(null)
  const customRampInputRef = useRef(DEFAULT_CUSTOM_RAMP)
  const paletteIdRef = useRef<PaletteId>(DEFAULT_PALETTE)
  const customPaletteRef = useRef<PaletteColors>({ ...getBuiltinPalette(DEFAULT_PALETTE).colors })
  const compareRef = useRef(false)
  const splitRef = useRef(DEFAULT_SPLIT)

  const statusRef = useRef<CameraStatus>('idle')
  const sessionRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<FrameLoop | null>(null)
  const rendererRef = useRef<AsciiRenderer | null>(null)
  const sourceRef = useRef<FrameSource>(demoFrames)
  const videoSourceRef = useRef<VideoFrameSource | null>(null)
  const sessionApiRef = useRef<SessionApi | null>(null)
  const detachTracksRef = useRef<(() => void) | null>(null)
  const redrawFrameRef = useRef(0)
  /** 最近一次成功布局时画面来源的尺寸 */
  const laidOutRef = useRef({ width: 0, height: 0 })
  const switchingRef = useRef(false)
  const switchingFromRef = useRef<MediaStream | null>(null)
  const switchLockedRef = useRef(false)
  const activeDeviceIdRef = useRef('')
  const preferredDeviceIdRef = useRef('')
  /** 渲染循环的错误回调需要调用 fail，但 fail 依赖于启动循环的函数：通过 ref 打破循环依赖。 */
  const failRef = useRef<(session: number, error: CameraError) => void>(() => {})

  const { devices, refresh: refreshDevices } = useCameraDevices()

  const updateState = useCallback((next: PipelineState | ((prev: PipelineState) => PipelineState)) => {
    setState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      statusRef.current = value.status
      return value
    })
  }, [])

  const currentPaletteColors = useCallback((): PaletteColors => {
    const id = paletteIdRef.current
    return id === 'custom' ? customPaletteRef.current : getBuiltinPalette(id).colors
  }, [])

  // ---------------------------------------------------------------------------
  // 主渲染管线

  /** 按当前画面来源与容器尺寸重新布局；冻结时立即重新渲染冻结帧。 */
  const relayout = useCallback(() => {
    const renderer = rendererRef.current
    const viewport = viewportRef.current
    const source = sourceRef.current
    if (!renderer || !viewport || source.width === 0 || source.height === 0) return
    const changed = renderer.layout(viewport.clientWidth, viewport.clientHeight, source.width, source.height)
    if (source.ready) laidOutRef.current = { width: source.width, height: source.height }
    if (!changed) return
    // 布局会清空画布：冻结时重画冻结帧，实时来源则立即补画一帧，避免出现一帧黑屏
    renderer.render(source)
    const grid = renderer.grid
    const canvas = canvasRef.current
    const displaySize = canvas
      ? { width: parseFloat(canvas.style.width) || 0, height: parseFloat(canvas.style.height) || 0 }
      : null
    updateState((prev) => {
      const sameGrid = prev.grid?.columns === grid.columns && prev.grid.rows === grid.rows
      const sameSize =
        prev.displaySize?.width === displaySize?.width && prev.displaySize?.height === displaySize?.height
      return sameGrid && sameSize ? prev : { ...prev, grid, displaySize }
    })
  }, [updateState])

  /** 启动主画面的渲染循环（总是先停止旧循环）。摄像头用 rVFC，演示动画用 rAF（30 FPS）。 */
  const startMainLoop = useCallback(() => {
    const renderer = rendererRef.current
    loopRef.current?.stop()
    loopRef.current = null
    if (!renderer) return
    const source = sourceRef.current
    if (source.kind === 'camera') {
      const session = sessionRef.current
      loopRef.current = startFrameLoop(videoRef.current, {
        onFrame: () => renderer.render(source),
        onError: (error) => failRef.current(session, renderError(error)),
      })
    } else {
      loopRef.current = startFrameLoop(null, {
        maxFps: DEMO_FPS_LIMIT,
        onFrame: () => {
          demoFrames.update()
          // 演示视频是异步加载的：第一帧到达（或尺寸变化）后才能布局。第一帧可能由预设卡片先取到，
          // 所以比较的是“上次布局时的来源尺寸”，而不是本次调用前后的变化。
          if (demoFrames.ready && (demoFrames.width !== laidOutRef.current.width || demoFrames.height !== laidOutRef.current.height)) {
            relayout()
          }
          renderer.render(demoFrames)
        },
        onError: (error) => {
          loopRef.current?.stop()
          loopRef.current = null
          updateState((prev) => ({ ...prev, error: renderError(error) }))
        },
      })
    }
  }, [demoFrames, relayout, updateState])

  /** 切换主画面的画面来源；新来源总是从实时画面开始（解除冻结）。 */
  const switchSource = useCallback(
    (source: FrameSource) => {
      const renderer = rendererRef.current
      sourceRef.current = source
      if (renderer?.isFrozen) renderer.unfreeze()
      if (source.kind === 'demo') demoFrames.update()
      updateState((prev) =>
        prev.source === source.kind && !prev.frozen ? prev : { ...prev, source: source.kind, frozen: false },
      )
      relayout()
      startMainLoop()
    },
    [demoFrames, relayout, startMainLoop, updateState],
  )

  const showDemo = useCallback(() => switchSource(demoFrames), [demoFrames, switchSource])

  // ---------------------------------------------------------------------------
  // 摄像头会话

  /** 同步释放摄像头相关的全部资源（不影响演示动画）。不触碰 React 状态，也可以在卸载时调用。 */
  const releaseCamera = useCallback(() => {
    if (sourceRef.current.kind === 'camera') {
      loopRef.current?.stop()
      loopRef.current = null
    }
    if (redrawFrameRef.current) cancelAnimationFrame(redrawFrameRef.current)
    redrawFrameRef.current = 0

    detachTracksRef.current?.()
    detachTracksRef.current = null
    sessionApiRef.current = null

    stopStream(streamRef.current)
    streamRef.current = null

    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
  }, [])

  const stop = useCallback(() => {
    sessionRef.current += 1
    releaseCamera()
    setNotice(null)
    updateState((prev) => ({ ...prev, status: 'idle', error: null }))
    showDemo()
  }, [releaseCamera, showDemo, updateState])

  const fail = useCallback(
    (session: number, error: CameraError) => {
      if (session !== sessionRef.current) return
      sessionRef.current += 1
      releaseCamera()
      updateState((prev) => ({ ...prev, status: 'error', error }))
      // 摄像头失败时继续显示演示动画
      showDemo()
    },
    [releaseCamera, showDemo, updateState],
  )
  useEffect(() => {
    failRef.current = fail
  }, [fail])

  /** 冻结状态下参数变化后重新渲染同一帧。多次调整合并到下一个动画帧，只渲染一次。 */
  const requestRedraw = useCallback(() => {
    if (!rendererRef.current?.isFrozen || redrawFrameRef.current) return
    redrawFrameRef.current = requestAnimationFrame(() => {
      redrawFrameRef.current = 0
      const renderer = rendererRef.current
      if (renderer?.isFrozen) renderer.render(sourceRef.current)
    })
  }, [])

  const applySettings = useCallback(
    (renderer: AsciiRenderer) => {
      renderer.setMirror(mirrorRef.current)
      renderer.setMode(modeRef.current)
      renderer.setColumns(columnsRef.current)
      renderer.setBrightness(brightnessRef.current)
      renderer.setContrast(contrastRef.current)
      renderer.setRamp(rampRef.current)
      renderer.setPalette(currentPaletteColors())
      renderer.setCompare(compareRef.current, splitRef.current)
    },
    [currentPaletteColors],
  )

  /** 为一次摄像头会话创建操作集合：接入（或替换）视频流。 */
  const createSessionApi = useCallback(
    (session: number, video: HTMLVideoElement): SessionApi => {
      const isCurrent = () => session === sessionRef.current

      const attachStream = async (stream: MediaStream): Promise<boolean> => {
        if (!isCurrent()) {
          stopStream(stream)
          return false
        }
        // 先解除旧轨道的监听，再停止旧流：被主动停止的旧轨道不应触发“摄像头断开”。
        detachTracksRef.current?.()
        detachTracksRef.current = null
        const previous = streamRef.current
        streamRef.current = stream
        if (previous && previous !== stream) stopStream(previous)

        video.srcObject = stream
        try {
          await video.play()
        } catch (error) {
          // 如果是 stop() 清除 srcObject 导致的中断，会话号已经变化，fail 会直接忽略。
          fail(session, playbackError(error))
          return false
        }
        if (!isCurrent()) return false

        // 摄像头被拔出、被系统收回或被其他程序抢占时，track 会触发 ended。
        const onTrackEnded = () => {
          // iOS may end the old capture while getUserMedia is opening its replacement.
          // Let the switch attach or restore a stream before treating that as a disconnect.
          if (stream !== streamRef.current || stream === switchingFromRef.current) return
          fail(session, DISCONNECTED_ERROR)
        }
        const tracks = stream.getVideoTracks()
        for (const track of tracks) track.addEventListener('ended', onTrackEnded)
        detachTracksRef.current = () => {
          for (const track of tracks) track.removeEventListener('ended', onTrackEnded)
        }

        const deviceId = getStreamDeviceId(stream)
        activeDeviceIdRef.current = deviceId
        setActiveDeviceId(deviceId)

        // 新视频流接入：主画面切换到摄像头（总是回到实时画面）
        if (!videoSourceRef.current) videoSourceRef.current = new VideoFrameSource(video)
        switchSource(videoSourceRef.current)
        return true
      }

      return { session, attachStream }
    },
    [fail, switchSource],
  )

  const start = useCallback(async () => {
    // 新会话开始：使所有进行中的旧启动流程失效，并确保旧摄像头资源已释放。
    // 演示动画在请求权限期间继续播放，摄像头画面就绪后才切换。
    const session = ++sessionRef.current
    const isCurrent = () => session === sessionRef.current
    const wasCamera = sourceRef.current.kind === 'camera'
    releaseCamera()
    if (wasCamera) showDemo()
    setNotice(null)
    updateState((prev) => ({ ...prev, status: 'starting', error: null }))

    const supportError = getCameraSupportError()
    if (supportError) {
      fail(session, supportError)
      return
    }

    const video = videoRef.current
    if (!video || !rendererRef.current) {
      fail(session, renderError(new Error('Video or canvas element is not mounted')))
      return
    }

    let stream: MediaStream
    try {
      const preferred = preferredDeviceIdRef.current
      stream = await requestCameraStream(preferred ? { deviceId: preferred, exact: false } : undefined)
    } catch (error) {
      fail(session, describeCameraError(error))
      return
    }
    if (!isCurrent()) {
      // 等待权限期间用户点了停止 / 组件已卸载 / 又发起了新的启动：立刻归还摄像头。
      stopStream(stream)
      return
    }

    const api = createSessionApi(session, video)
    sessionApiRef.current = api
    updateState((prev) => ({ ...prev, status: 'running' }))
    if (!(await api.attachStream(stream))) return
    // 获得权限后浏览器才会提供设备名称
    void refreshDevices()
  }, [createSessionApi, fail, refreshDevices, releaseCamera, showDemo, updateState])

  // ---------------------------------------------------------------------------
  // 冻结 / 恢复（摄像头与演示动画通用）

  const freeze = useCallback(() => {
    const renderer = rendererRef.current
    const source = sourceRef.current
    if (!renderer || renderer.isFrozen || !source.ready) return
    if (!renderer.freeze(source)) return
    // 停止主画面的渲染循环（摄像头仍在运行；演示时钟照常前进，预设预览不受影响）
    loopRef.current?.stop()
    loopRef.current = null
    renderer.render(source)
    updateState((prev) => ({ ...prev, frozen: true }))
  }, [updateState])

  const resume = useCallback(() => {
    const renderer = rendererRef.current
    if (!renderer || !renderer.isFrozen) return
    renderer.unfreeze()
    startMainLoop()
    updateState((prev) => ({ ...prev, frozen: false }))
  }, [startMainLoop, updateState])

  // ---------------------------------------------------------------------------
  // 摄像头设备

  /** 录制期间锁定设备切换（由导出模块设置）。 */
  const setSwitchLocked = useCallback((locked: boolean) => {
    switchLockedRef.current = locked
  }, [])

  const selectDevice = useCallback(
    async (deviceId: string) => {
      const api = sessionApiRef.current
      if (!api || statusRef.current !== 'running') {
        // 未运行（演示模式）：设备选择不可用，只记住选择
        preferredDeviceIdRef.current = deviceId
        setPreferredDeviceId(deviceId)
        return
      }
      if (switchingRef.current || !deviceId || deviceId === activeDeviceIdRef.current) return
      if (switchLockedRef.current) {
        setNotice({ kind: 'switch-locked' })
        return
      }

      const session = api.session
      const isCurrent = () => session === sessionRef.current
      const previousId = activeDeviceIdRef.current
      switchingRef.current = true
      switchingFromRef.current = streamRef.current
      setSwitching(true)
      setNotice(null)
      try {
        let next: MediaStream
        try {
          // 先打开新设备，成功后再替换旧流：失败时原摄像头不受影响。
          next = await requestCameraStream({ deviceId, exact: true })
        } catch (error) {
          if (!isCurrent()) return
          const described = describeCameraError(error)
          const previousEnded = !streamRef.current?.getVideoTracks().some((track) => track.readyState === 'live')
          if (!previousEnded && (described.code === 'not-found' || described.code === 'overconstrained')) {
            setNotice({ kind: 'switch-unavailable' })
            return
          }
          if (!previousEnded && described.code !== 'not-readable') {
            setNotice({ kind: 'switch-failed', error: described.code })
            return
          }
          // Exclusive drivers reject the new capture; iOS may instead end the old one.
          // In either case release it, retry, and restore the previous device on failure.
          detachTracksRef.current?.()
          detachTracksRef.current = null
          stopStream(streamRef.current)
          streamRef.current = null
          try {
            next = await requestCameraStream({ deviceId, exact: true })
          } catch (retryError) {
            if (!isCurrent()) return
            // 新设备仍然打不开：尝试恢复原来的摄像头，恢复失败则进入错误状态（回到演示动画）。
            try {
              const restored = await requestCameraStream(
                previousId ? { deviceId: previousId, exact: true } : undefined,
              )
              if (await api.attachStream(restored)) {
                setNotice({ kind: 'switch-restored', error: describeCameraError(retryError).code })
              }
            } catch (restoreError) {
              fail(session, describeCameraError(restoreError))
            }
            return
          }
        }
        if (!isCurrent()) {
          stopStream(next)
          return
        }
        if (await api.attachStream(next)) {
          preferredDeviceIdRef.current = deviceId
          setPreferredDeviceId(deviceId)
        }
      } finally {
        switchingFromRef.current = null
        switchingRef.current = false
        setSwitching(false)
      }
    },
    [fail],
  )

  // ---------------------------------------------------------------------------
  // 视觉参数：都只修改渲染器内部状态，下一帧生效；冻结时重新渲染同一帧。
  // 不会重新申请摄像头，也不会新建渲染循环。

  const setMirror = useCallback(
    (value: boolean) => {
      mirrorRef.current = value
      rendererRef.current?.setMirror(value)
      setMirrorState(value)
      requestRedraw()
    },
    [requestRedraw],
  )

  const setMode = useCallback(
    (value: RenderMode) => {
      modeRef.current = value
      rendererRef.current?.setMode(value)
      setModeState(value)
      requestRedraw()
    },
    [requestRedraw],
  )

  /** 写入列数；返回是否需要重新布局。 */
  const writeColumns = useCallback((value: number) => {
    const next = normalizeColumns(value)
    if (next === columnsRef.current) return false
    columnsRef.current = next
    rendererRef.current?.setColumns(next)
    setColumnsState(next)
    return true
  }, [])

  const setColumns = useCallback(
    (value: number) => {
      // 列数变化需要重新计算行数和画布尺寸（冻结时布局后会重新渲染）。
      if (writeColumns(value)) relayout()
    },
    [relayout, writeColumns],
  )

  const setBrightness = useCallback(
    (value: number) => {
      brightnessRef.current = value
      rendererRef.current?.setBrightness(value)
      setBrightnessState(value)
      requestRedraw()
    },
    [requestRedraw],
  )

  const setContrast = useCallback(
    (value: number) => {
      contrastRef.current = value
      rendererRef.current?.setContrast(value)
      setContrastState(value)
      requestRedraw()
    },
    [requestRedraw],
  )

  /** 写入新的字符梯度；返回是否需要重新布局（字宽比例变化）。 */
  const writeRamp = useCallback((ramp: string) => {
    if (ramp === rampRef.current) return false
    rampRef.current = ramp
    return rendererRef.current?.setRamp(ramp) ?? false
  }, [])

  const applyRamp = useCallback(
    (ramp: string) => {
      if (writeRamp(ramp)) relayout()
      requestRedraw()
    },
    [relayout, requestRedraw, writeRamp],
  )

  /** 选择字符集；返回需要应用的字符梯度（自定义梯度无效时为 null）。 */
  const selectCharset = useCallback((id: CharsetId): string | null => {
    charsetRef.current = id
    setCharsetState(id)
    if (id !== 'custom') return resolvePresetRamp(id)
    let ramp = customRampRef.current
    if (ramp === null) {
      const result = parseCustomRamp(customRampInputRef.current, isSingleCellGlyph)
      setCustomRampResult(result)
      ramp = result.ramp
      customRampRef.current = ramp
    }
    return ramp
  }, [])

  const setCharset = useCallback(
    (id: CharsetId) => {
      const ramp = selectCharset(id)
      if (ramp) applyRamp(ramp)
    },
    [applyRamp, selectCharset],
  )

  /** 输入自定义字符梯度：立即校验；有效时（且当前选中自定义字符集）立即生效，无效时保留上一次的有效梯度。 */
  const setCustomRampInput = useCallback(
    (input: string) => {
      customRampInputRef.current = input
      setCustomRampInputState(input)
      const result = parseCustomRamp(input, isSingleCellGlyph)
      setCustomRampResult(result)
      if (result.ramp) {
        customRampRef.current = result.ramp
        if (charsetRef.current === 'custom') applyRamp(result.ramp)
      }
    },
    [applyRamp],
  )

  // ---------------------------------------------------------------------------
  // 调色板

  const writePalette = useCallback(
    (id: PaletteId) => {
      paletteIdRef.current = id
      setPaletteIdState(id)
      rendererRef.current?.setPalette(currentPaletteColors())
    },
    [currentPaletteColors],
  )

  /** 选择内置调色板或自定义调色板。 */
  const selectPalette = useCallback(
    (id: PaletteId) => {
      writePalette(id)
      requestRedraw()
    },
    [requestRedraw, writePalette],
  )

  /**
   * 修改某个颜色节点。当前是内置调色板时，先把它复制为自定义调色板再修改（内置默认值不会被改动），
   * 并记住它来自哪个内置调色板，以便“恢复默认”。
   */
  const setPaletteColor = useCallback(
    (stop: keyof PaletteColors, value: string) => {
      if (!isHexColor(value)) return
      const id = paletteIdRef.current
      const base = id === 'custom' ? customPaletteRef.current : getBuiltinPalette(id).colors
      const next: PaletteColors = { ...base, [stop]: value.toLowerCase() }
      if (id !== 'custom') setCustomPaletteBase(id)
      customPaletteRef.current = next
      setCustomPaletteState(next)
      writePalette('custom')
      requestRedraw()
    },
    [requestRedraw, writePalette],
  )

  /** 恢复自定义调色板来源的内置调色板默认值（切回该内置调色板）。 */
  const resetPalette = useCallback(
    (base: BuiltinPaletteId) => {
      const defaults = { ...getBuiltinPalette(base).colors }
      customPaletteRef.current = defaults
      setCustomPaletteState(defaults)
      selectPalette(base)
    },
    [selectPalette],
  )

  // ---------------------------------------------------------------------------
  // 效果预设：一次性写入完整视觉配置，只重新布局一次；不影响摄像头、镜像、对比、冻结、全屏、录制。

  const applyPreset = useCallback(
    (id: LookPresetId) => {
      const preset = getLookPreset(id).config
      modeRef.current = preset.mode
      rendererRef.current?.setMode(preset.mode)
      setModeState(preset.mode)
      if (preset.palette) writePalette(preset.palette)
      brightnessRef.current = preset.brightness
      rendererRef.current?.setBrightness(preset.brightness)
      setBrightnessState(preset.brightness)
      contrastRef.current = preset.contrast
      rendererRef.current?.setContrast(preset.contrast)
      setContrastState(preset.contrast)
      const ramp = selectCharset(preset.charset)
      const rampChanged = ramp ? writeRamp(ramp) : false
      const columnsChanged = writeColumns(preset.columns)
      if (rampChanged || columnsChanged) relayout()
      requestRedraw()
    },
    [relayout, requestRedraw, selectCharset, writeColumns, writePalette, writeRamp],
  )

  // ---------------------------------------------------------------------------
  // 原画对比

  const setCompare = useCallback(
    (enabled: boolean) => {
      compareRef.current = enabled
      rendererRef.current?.setCompare(enabled, splitRef.current)
      setCompareState(enabled)
      requestRedraw()
    },
    [requestRedraw],
  )

  /** 分割位置在拖动时高频变化：只写入 ref 和渲染器，不触发 React 渲染（滑杆组件自己维护显示位置）。 */
  const setSplit = useCallback(
    (value: number) => {
      splitRef.current = clamp(value, 0, 1)
      rendererRef.current?.setCompare(compareRef.current, splitRef.current)
      requestRedraw()
    },
    [requestRedraw],
  )

  /** 拖动结束后记录最终位置（用于重新显示滑杆时恢复位置）。 */
  const commitSplit = useCallback(
    (value: number) => {
      setSplit(value)
      setSplitState(splitRef.current)
    },
    [setSplit],
  )

  // ---------------------------------------------------------------------------
  // 挂载：创建渲染器并播放演示动画；页面离开 / 卸载时释放全部资源

  useEffect(() => {
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    if (!canvas || !viewport) return
    let renderer: AsciiRenderer
    try {
      renderer = new AsciiRenderer(canvas, rampRef.current)
    } catch (error) {
      updateState((prev) => ({
        ...prev,
        error: error instanceof RendererUnsupportedError ? UNSUPPORTED_CANVAS_ERROR : renderError(error),
      }))
      return
    }
    rendererRef.current = renderer
    applySettings(renderer)

    // 容器尺寸变化（窗口、全屏、窄屏布局）或视频分辨率变化时重新布局
    const resizeObserver = new ResizeObserver(relayout)
    resizeObserver.observe(viewport)
    const video = videoRef.current
    video?.addEventListener('resize', relayout)

    showDemo()

    const onPageHide = () => {
      sessionRef.current += 1
      releaseCamera()
      updateState((prev) => ({ ...prev, status: 'idle', error: null }))
      showDemo()
    }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      resizeObserver.disconnect()
      video?.removeEventListener('resize', relayout)
      sessionRef.current += 1
      releaseCamera()
      loopRef.current?.stop()
      loopRef.current = null
      renderer.dispose()
      rendererRef.current = null
      sourceRef.current = demoFrames
      demo.release()
    }
  }, [applySettings, demo, demoFrames, relayout, releaseCamera, showDemo, updateState])

  const look = { mode, charset, palette: paletteId, columns, brightness, contrast }
  const activePreset = charset === 'custom' ? null : matchLookPreset(look)

  return {
    videoRef,
    canvasRef,
    viewportRef,
    demoFrames,
    status: state.status,
    error: state.error,
    source: state.source,
    grid: state.grid,
    displaySize: state.displaySize,
    frozen: state.frozen,
    notice,
    start,
    stop,
    freeze,
    resume,
    devices,
    activeDeviceId,
    preferredDeviceId,
    switching,
    selectDevice,
    setSwitchLocked,
    mirror,
    setMirror,
    mode,
    setMode,
    columns,
    setColumns,
    brightness,
    setBrightness,
    contrast,
    setContrast,
    charset,
    setCharset,
    customRampInput,
    customRampResult,
    setCustomRampInput,
    paletteId,
    selectPalette,
    customPalette,
    customPaletteBase,
    setPaletteColor,
    resetPalette,
    builtinPalettes: BUILTIN_PALETTES,
    activePreset,
    applyPreset,
    compare,
    setCompare,
    split,
    setSplit,
    commitSplit,
  }
}
