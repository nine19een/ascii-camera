export type CameraErrorCode =
  | 'insecure-context'
  | 'unsupported-browser'
  | 'unsupported-environment'
  | 'permission-denied'
  | 'security-blocked'
  | 'not-found'
  | 'not-readable'
  | 'overconstrained'
  | 'disconnected'
  | 'playback-failed'
  | 'render-failed'
  | 'canvas-unsupported'
  | 'unknown'

export interface CameraError {
  /** 错误类别；面向用户的说明由界面按当前语言生成。 */
  code: CameraErrorCode
  /** 浏览器返回的原始错误名称与信息，便于排查。 */
  detail?: string
}

/**
 * 只请求视频，不请求麦克风。
 * 分辨率只是 ideal 偏好：网格最多 180 列，不需要高分辨率，但给浏览器留出选择余地，
 * 避免因为硬性约束导致 OverconstrainedError。
 */
function buildConstraints(device?: CameraDeviceRequest): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  }
  if (device?.deviceId) {
    // exact：用户明确切换到某个设备，失败就报错；ideal：启动时优先使用上次选择的设备，不可用时退回默认设备。
    video.deviceId = device.exact ? { exact: device.deviceId } : { ideal: device.deviceId }
  } else {
    video.facingMode = 'user'
  }
  return { audio: false, video }
}

export interface CameraDeviceRequest {
  deviceId: string
  exact: boolean
}

/** 在请求权限之前检查运行环境，返回 null 表示可以继续。 */
export function getCameraSupportError(): CameraError | null {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return {
      code: 'insecure-context',
    }
  }
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return {
      code: 'unsupported-browser',
    }
  }
  return null
}

export function requestCameraStream(device?: CameraDeviceRequest): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(buildConstraints(device))
}

/** 视频轨道实际使用的设备 ID（部分浏览器可能拿不到，返回空字符串）。 */
export function getStreamDeviceId(stream: MediaStream): string {
  const track = stream.getVideoTracks()[0]
  return track?.getSettings().deviceId ?? ''
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') return error.name
  return ''
}

function errorDetail(error: unknown): string | undefined {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name
  if (error === undefined || error === null) return undefined
  return String(error)
}

/** 把 getUserMedia 抛出的异常转换成可理解的提示。 */
export function describeCameraError(error: unknown): CameraError {
  const detail = errorDetail(error)
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        code: 'permission-denied',
        detail,
      }
    case 'SecurityError':
      return {
        code: 'security-blocked',
        detail,
      }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        code: 'not-found',
        detail,
      }
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        code: 'not-readable',
        detail,
      }
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        code: 'overconstrained',
        detail,
      }
    case 'TypeError':
      return {
        code: 'unsupported-environment',
        detail,
      }
    default:
      return {
        code: 'unknown',
        detail,
      }
  }
}

export const DISCONNECTED_ERROR: CameraError = {
  code: 'disconnected',
}

export function playbackError(error: unknown): CameraError {
  return {
    code: 'playback-failed',
    detail: errorDetail(error),
  }
}

export function renderError(error: unknown): CameraError {
  return {
    code: 'render-failed',
    detail: errorDetail(error),
  }
}

export const UNSUPPORTED_CANVAS_ERROR: CameraError = {
  code: 'canvas-unsupported',
}
