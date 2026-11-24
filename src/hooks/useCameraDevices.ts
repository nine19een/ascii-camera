import { useCallback, useEffect, useState } from 'react'

export interface CameraDevice {
  deviceId: string
  /** 浏览器提供的设备名称；拿不到时为空字符串（界面显示为“摄像头 N”）。 */
  label: string
}

/**
 * 可用视频输入设备列表。
 *
 * 浏览器只有在页面获得摄像头权限后才会返回设备名称（以及稳定的 deviceId），
 * 所以摄像头启动成功后需要调用 refresh() 再取一次。
 * 插拔设备时浏览器会触发 devicechange，此时自动刷新。
 */
async function listVideoInputs(): Promise<CameraDevice[] | null> {
  const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (typeof mediaDevices?.enumerateDevices !== 'function') return null
  try {
    const list = await mediaDevices.enumerateDevices()
    return list
      .filter((device) => device.kind === 'videoinput' && device.deviceId)
      .map((device) => ({ deviceId: device.deviceId, label: device.label }))
  } catch {
    // 枚举失败不影响摄像头本身的使用
    return null
  }
}

function sameDevices(a: CameraDevice[], b: CameraDevice[]): boolean {
  return a.length === b.length && a.every((item, i) => item.deviceId === b[i].deviceId && item.label === b[i].label)
}

export function useCameraDevices() {
  const [devices, setDevices] = useState<CameraDevice[]>([])

  const apply = useCallback((next: CameraDevice[] | null) => {
    if (next) setDevices((prev) => (sameDevices(prev, next) ? prev : next))
  }, [])

  const refresh = useCallback(() => listVideoInputs().then(apply), [apply])

  useEffect(() => {
    let disposed = false
    const load = () => {
      void listVideoInputs().then((next) => {
        if (!disposed) apply(next)
      })
    }
    load()
    const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    if (typeof mediaDevices?.addEventListener === 'function') mediaDevices.addEventListener('devicechange', load)
    return () => {
      disposed = true
      if (typeof mediaDevices?.removeEventListener === 'function') {
        mediaDevices.removeEventListener('devicechange', load)
      }
    }
  }, [apply])

  return { devices, refresh }
}
