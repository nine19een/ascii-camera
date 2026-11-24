import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { CameraErrorCode } from './camera/camera'
import { ADJUST_PANEL_ID, AdjustPanel, type PanelSection } from './components/AdjustPanel'
import { CameraControls } from './components/CameraControls'
import { CAPTURE_FORMATS, type CaptureFormat } from './components/capture'
import { CaptureControl } from './components/CaptureControl'
import { CharsetControls } from './components/CharsetControls'
import { CompareHandle } from './components/CompareHandle'
import { ExportControls } from './components/ExportControls'
import {
  AdjustIcon,
  AlertIcon,
  CameraIcon,
  CameraOffIcon,
  CompareIcon,
  ExitFullscreenIcon,
  FreezeIcon,
  FullscreenIcon,
} from './components/icons'
import { ImageControls } from './components/ImageControls'
import { PresetGallery } from './components/PresetGallery'
import { VisualStyleControls } from './components/StyleControls'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { VIDEO_CONTAINERS, supportedVideoContainers, type VideoContainer } from './export/canvasRecorder'
import { formatDuration } from './export/download'
import { GIF_MAX_DURATION_MS } from './export/gifRecorder'
import { useAsciiCamera } from './hooks/useAsciiCamera'
import { useExports } from './hooks/useExports'
import { useFullscreen } from './hooks/useFullscreen'
import { useLayoutMode, useStoredChoice } from './hooks/useLayout'
import { useI18n } from './i18n/context'
import { statusText } from './i18n/format'

const PANEL_STORAGE_KEY = 'ascii-camera:panel'
const FORMAT_STORAGE_KEY = 'ascii-camera:capture-format'
const PANEL_STATES = ['open', 'closed'] as const
const VIDEO_FORMAT_STORAGE_KEY = 'ascii-camera:video-format'

/** 这些错误与摄像头无关或重试无效，不提供“重试”。 */
const NO_RETRY: readonly CameraErrorCode[] = [
  'insecure-context',
  'unsupported-browser',
  'unsupported-environment',
  'render-failed',
  'canvas-unsupported',
]

function App() {
  const { m } = useI18n()
  const camera = useAsciiCamera()
  const { videoRef, canvasRef, viewportRef, status, error, grid, frozen, displaySize } = camera
  const fullscreen = useFullscreen(viewportRef)
  // 视频封装：默认 MP4（手机相册可播放）；浏览器录不了所选格式时自动用另一种
  const [videoChoice, setVideoChoice] = useStoredChoice<VideoContainer>(VIDEO_FORMAT_STORAGE_KEY, VIDEO_CONTAINERS, 'mp4')
  const [videoContainers] = useState(supportedVideoContainers)
  const videoContainer: VideoContainer =
    videoContainers[videoChoice] || !videoContainers[videoChoice === 'mp4' ? 'webm' : 'mp4']
      ? videoChoice
      : videoChoice === 'mp4'
        ? 'webm'
        : 'mp4'
  const exportsApi = useExports(canvasRef, videoContainer)
  const layout = useLayoutMode()
  const desktop = layout === 'desktop'

  const running = status === 'running'
  const active = status === 'starting' || running
  const isDemo = camera.source === 'demo'
  /** 主画面已有内容（演示动画或摄像头）：截图、录制、冻结都可用。 */
  const ready = grid !== null
  const { setSwitchLocked } = camera

  // 录制期间锁定摄像头切换：切换设备会中断画面来源
  useEffect(() => {
    setSwitchLocked(exportsApi.recording)
  }, [exportsApi.recording, setSwitchLocked])

  // 面板：桌面记住开合；手机每次加载都收起
  const [storedPanel, setStoredPanel] = useStoredChoice(PANEL_STORAGE_KEY, PANEL_STATES, 'closed')
  const [sheetOpen, setSheetOpen] = useState(false)
  const panelOpen = desktop ? storedPanel === 'open' : sheetOpen
  const setPanelOpen = useCallback(
    (open: boolean) => (desktop ? setStoredPanel(open ? 'open' : 'closed') : setSheetOpen(open)),
    [desktop, setStoredPanel],
  )
  const closePanel = useCallback(() => setPanelOpen(false), [setPanelOpen])
  const [format, setFormat] = useStoredChoice<CaptureFormat>(FORMAT_STORAGE_KEY, CAPTURE_FORMATS, 'photo')

  // 截图反馈：舞台闪一下
  const [flash, setFlash] = useState(0)
  const onSnapshot = useCallback(() => setFlash((value) => value + 1), [])

  const videoRecording = exportsApi.videoState === 'recording'
  const gifRecording = exportsApi.gifState === 'recording'
  const recording = videoRecording || gifRecording
  /** 手机上打开面板时底部操作区让位给面板，录制状态改在画面上显示。 */
  const dockHidden = !desktop && panelOpen

  const deviceValue = running ? camera.activeDeviceId : camera.preferredDeviceId

  // 面板内容只随设置变化重建；录制计时每 250ms 刷新 App 时不重渲染整个面板
  const {
    brightness,
    charset,
    columns,
    contrast,
    customPalette,
    customPaletteBase,
    customRampInput,
    customRampResult,
    devices,
    mirror,
    mode,
    paletteId,
    resetPalette,
    selectDevice,
    selectPalette,
    setBrightness,
    setCharset,
    setColumns,
    setContrast,
    setCustomRampInput,
    setMirror,
    setMode,
    setPaletteColor,
    switching,
  } = camera
  const sections = useMemo<PanelSection[]>(() => [
    {
      id: 'visual',
      tabLabel: m.panel.tabs.visual,
      title: m.panel.visualStyle,
      content: (
        <VisualStyleControls
          mode={mode}
          onModeChange={setMode}
          paletteId={paletteId}
          onPaletteChange={selectPalette}
          customPalette={customPalette}
          customPaletteBase={customPaletteBase}
          onPaletteColorChange={setPaletteColor}
          onPaletteReset={resetPalette}
        />
      ),
    },
    {
      id: 'charset',
      tabLabel: m.panel.tabs.charset,
      title: m.panel.charset,
      content: (
        <CharsetControls
          charset={charset}
          onCharsetChange={setCharset}
          customRampInput={customRampInput}
          customRampResult={customRampResult}
          onCustomRampInputChange={setCustomRampInput}
        />
      ),
    },
    {
      id: 'image',
      tabLabel: m.panel.tabs.image,
      title: m.panel.adjustments,
      content: (
        <ImageControls
          columns={columns}
          brightness={brightness}
          contrast={contrast}
          onColumnsChange={setColumns}
          onBrightnessChange={setBrightness}
          onContrastChange={setContrast}
        />
      ),
    },
    {
      id: 'camera',
      tabLabel: m.panel.tabs.camera,
      title: m.panel.camera,
      content: (
        <CameraControls
          devices={devices}
          deviceId={deviceValue}
          running={running}
          switching={switching}
          locked={exportsApi.recording}
          mirror={mirror}
          onSelectDevice={(id) => void selectDevice(id)}
          onMirrorChange={setMirror}
        />
      ),
    },
    {
      id: 'export',
      title: m.panel.export,
      tabLabel: m.panel.tabs.export,
      content: (
        <ExportControls
          container={videoContainer}
          supported={videoContainers}
          locked={exportsApi.videoState !== 'idle'}
          onChange={setVideoChoice}
        />
      ),
    },
  ], [
    m, mode, setMode, paletteId, selectPalette, customPalette, customPaletteBase, setPaletteColor,
    resetPalette, charset, setCharset, customRampInput, customRampResult, setCustomRampInput, columns,
    brightness, contrast, setColumns, setBrightness, setContrast, devices, deviceValue, running, switching,
    exportsApi.recording, mirror, selectDevice, setMirror, videoContainer, videoContainers, exportsApi.videoState,
    setVideoChoice,
  ])

  const appStyle = displaySize
    ? ({ '--canvas-aspect': (displaySize.height / Math.max(1, displaySize.width)).toFixed(4) } as CSSProperties)
    : undefined

  const fullscreenButton = (onStage: boolean) => (
    <button
      type="button"
      className={onStage ? 'icon-button stage-fullscreen' : 'tool-button'}
      onClick={fullscreen.toggle}
      disabled={!fullscreen.supported}
      title={fullscreen.supported ? m.toolbar.fullscreenHint : m.toolbar.fullscreenUnsupported}
    >
      {fullscreen.active ? <ExitFullscreenIcon /> : <FullscreenIcon />}
      <span className={onStage ? 'sr-only' : 'btn-label'}>
        {fullscreen.active ? m.toolbar.exitFullscreen : m.toolbar.fullscreen}
      </span>
    </button>
  )

  return (
    <div
      className="app"
      data-layout={layout}
      data-panel={panelOpen ? 'open' : 'closed'}
      data-recording={recording || undefined}
      style={appStyle}
    >
      <TopBar status={status} isDemo={isDemo} grid={grid} />

      <main className="stage" aria-label={m.stage.region}>
        <div className="viewport" ref={viewportRef}>
          <canvas ref={canvasRef} className="ascii-canvas" role="img" aria-label={m.stage.canvas} />
          {!ready && (
            <div className="viewport-placeholder" aria-hidden="true">
              {m.stage.loading}
            </div>
          )}
          {ready && displaySize && (
            <div
              className="canvas-frame"
              style={{ width: displaySize.width, height: displaySize.height }}
              data-recording={recording || undefined}
              aria-hidden="true"
            >
              {flash > 0 && <span key={flash} className="snapshot-flash" />}
              <span className="frame-chips">
                {recording && dockHidden && (
                  <span className="stage-chip stage-rec">
                    <span className="rec-dot" />
                    {videoRecording
                      ? formatDuration(exportsApi.videoElapsedMs)
                      : m.stage.gifBadge({
                          seconds: ((exportsApi.gifProgress?.elapsedMs ?? 0) / 1000).toFixed(1),
                        })}
                  </span>
                )}
                {frozen && (
                  <span className="stage-chip badge-frozen">
                    <FreezeIcon size={14} />
                    {m.stage.frozenBadge}
                  </span>
                )}
              </span>
            </div>
          )}
          {ready && camera.compare && displaySize && (
            <CompareHandle
              size={displaySize}
              split={camera.split}
              onChange={camera.setSplit}
              onCommit={camera.commitSplit}
            />
          )}
          {!desktop && !fullscreen.active && !panelOpen && displaySize && (
            <div className="canvas-anchor" style={{ width: displaySize.width, height: displaySize.height }}>
              {fullscreenButton(true)}
            </div>
          )}
          {fullscreen.active && (
            <button type="button" className="fullscreen-exit icon-button" onClick={() => void fullscreen.exit()}>
              <ExitFullscreenIcon />
              <span className="sr-only">{m.stage.exitFullscreen}</span>
            </button>
          )}
        </div>

        {status === 'starting' && (
          <p className="stage-banner stage-hint">
            <span className="spinner" aria-hidden="true" />
            {m.status.starting}
          </p>
        )}
        {error && (
          <div className="stage-banner error" role="alert">
            <AlertIcon size={18} />
            <div className="error-text">
              <p>{m.cameraErrors[error.code]}</p>
              {error.detail && <p className="error-detail">{error.detail}</p>}
            </div>
            {!NO_RETRY.includes(error.code) && (
              <button type="button" className="banner-action" onClick={camera.start}>
                {m.camera.retry}
              </button>
            )}
          </div>
        )}

        <Toasts
          result={exportsApi.result}
          message={exportsApi.message}
          cameraNotice={camera.notice}
          fullscreenError={fullscreen.error}
          onDismissResult={exportsApi.dismissResult}
          onDismissMessage={exportsApi.dismissMessage}
        >
          {videoRecording && (
            <p className="recording-line sr-only">
              {m.exports.recordingVideo({ time: formatDuration(exportsApi.videoElapsedMs) })}
            </p>
          )}
          {gifRecording && exportsApi.gifProgress && (
            <p className="recording-line sr-only">
              {m.exports.recordingGif({
                seconds: (exportsApi.gifProgress.elapsedMs / 1000).toFixed(1),
                max: GIF_MAX_DURATION_MS / 1000,
                frames: exportsApi.gifProgress.framesCaptured,
              })}
            </p>
          )}
          {exportsApi.gifState === 'encoding' && exportsApi.gifProgress && (
            <p className="recording-line sr-only">
              {m.exports.encodingGif({
                done: exportsApi.gifProgress.framesEncoded,
                total: exportsApi.gifProgress.framesCaptured,
              })}
            </p>
          )}
        </Toasts>

        <p className="status sr-only" role="status" aria-live="polite">
          {statusText(m, status, frozen, grid)}
        </p>
      </main>

      <div className="dock" hidden={dockHidden}>
        <PresetGallery
          demoFrames={camera.demoFrames}
          mirror={camera.mirror}
          activePreset={camera.activePreset}
          onApply={camera.applyPreset}
        />
        <div className="controls">
          <div className="ctl-group ctl-left">
            <button
              type="button"
              className={active ? 'tool-button' : 'tool-button is-primary'}
              onClick={active ? camera.stop : camera.start}
            >
              {active ? <CameraOffIcon /> : <CameraIcon />}
              <span className="btn-label">{active ? m.toolbar.stopCamera : m.toolbar.startCamera}</span>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={frozen ? camera.resume : camera.freeze}
              disabled={!ready}
              aria-pressed={frozen}
            >
              <FreezeIcon />
              <span className="btn-label">{m.toolbar.freeze}</span>
            </button>
            {desktop && (
              <button
                type="button"
                className="tool-button"
                onClick={() => camera.setCompare(!camera.compare)}
                aria-pressed={camera.compare}
                title={m.toolbar.compareHint}
              >
                <CompareIcon />
                <span className="btn-label">{m.toolbar.compare}</span>
              </button>
            )}
          </div>
          <CaptureControl
            exportsApi={exportsApi}
            ready={ready}
            format={format}
            videoContainer={videoContainer}
            onFormatChange={setFormat}
            onSnapshot={onSnapshot}
          />
          <div className="ctl-group ctl-right">
            {!desktop && (
              <button
                type="button"
                className="tool-button"
                onClick={() => camera.setCompare(!camera.compare)}
                aria-pressed={camera.compare}
                title={m.toolbar.compareHint}
              >
                <CompareIcon />
                <span className="btn-label">{m.toolbar.compare}</span>
              </button>
            )}
            <button
              type="button"
              className="tool-button"
              aria-expanded={panelOpen}
              aria-controls={ADJUST_PANEL_ID}
              onClick={() => setPanelOpen(!panelOpen)}
            >
              <AdjustIcon />
              <span className="btn-label">{m.panel.adjust}</span>
            </button>
            {desktop && fullscreenButton(false)}
          </div>
        </div>
      </div>

      <AdjustPanel
        variant={layout === 'compact' ? 'sheet' : 'dock'}
        open={panelOpen}
        sections={sections}
        onClose={closePanel}
      />

      {/* 视频元素作为渲染输入：必须保持播放，但对用户不可见。不使用 display:none，部分浏览器会因此停止解码。 */}
      <video ref={videoRef} className="source-video" muted playsInline aria-hidden="true" />
    </div>
  )
}

export default App
