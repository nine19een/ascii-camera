import { useCallback, useEffect, useState, type RefObject } from 'react'

/** 全屏失败的原因；文字由界面按当前语言生成。detail 为浏览器的原始信息。 */
export type FullscreenError = { kind: 'unsupported' } | { kind: 'denied'; detail?: string }

// Safari（含较旧版本）只提供带 webkit 前缀的 Fullscreen API。
interface WebkitDocument extends Document {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function getFullscreenElement(): Element | null {
  const doc = document as WebkitDocument
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as WebkitDocument
  return Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled)
}

/**
 * 以指定元素（字符画展示区域）为对象的全屏控制。
 *
 * - 浏览器支持元素全屏（桌面浏览器、iPad、安卓）时使用原生全屏。全屏状态以 fullscreenchange 为准，
 *   用户按 ESC 或浏览器因其他原因退出时，界面状态同步更新。
 * - iPhone 上的 Safari 等不支持元素全屏（只有 <video> 能全屏）时，改用页面内的沉浸式预览：
 *   展示区域铺满整个页面（CSS 固定定位，data-immersive），隐藏其余界面；按 ESC、点退出按钮或
 *   浏览器返回都会退出。地址栏与系统状态栏仍由浏览器控制，无法隐藏。
 *
 * mode：'native' 原生全屏，'immersive' 页面内沉浸式，null 未全屏。
 */
export function useFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [nativeSupported] = useState(isFullscreenSupported)
  const [nativeActive, setNativeActive] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [error, setError] = useState<FullscreenError | null>(null)

  useEffect(() => {
    const sync = () => {
      const target = targetRef.current
      setNativeActive(target !== null && getFullscreenElement() === target)
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [targetRef])

  // 沉浸式：给展示区域打标记；ESC 与浏览器“返回”退出
  useEffect(() => {
    const target = targetRef.current
    if (!immersive || !target) return
    target.dataset.immersive = 'true'
    document.documentElement.dataset.immersive = 'true'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImmersive(false)
    }
    // 压入一条历史记录，让手机的返回手势先退出沉浸式而不是离开页面
    let pushed = false
    try {
      history.pushState({ asciiImmersive: true }, '')
      pushed = true
    } catch {
      // 某些嵌入环境不允许修改历史记录
    }
    const onPop = () => {
      pushed = false
      setImmersive(false)
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('popstate', onPop)
    return () => {
      delete target.dataset.immersive
      delete document.documentElement.dataset.immersive
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
      if (pushed && (history.state as { asciiImmersive?: boolean } | null)?.asciiImmersive) history.back()
    }
  }, [immersive, targetRef])

  const enter = useCallback(async () => {
    const target = targetRef.current as WebkitElement | null
    if (!target) return
    setError(null)
    if (!nativeSupported) {
      setImmersive(true)
      return
    }
    try {
      if (typeof target.requestFullscreen === 'function') await target.requestFullscreen()
      else await target.webkitRequestFullscreen?.()
    } catch (err) {
      setError({ kind: 'denied', detail: err instanceof Error && err.message ? err.message : undefined })
    }
  }, [nativeSupported, targetRef])

  const exit = useCallback(async () => {
    setImmersive(false)
    if (!getFullscreenElement()) return
    const doc = document as WebkitDocument
    try {
      if (typeof doc.exitFullscreen === 'function') await doc.exitFullscreen()
      else await doc.webkitExitFullscreen?.()
    } catch {
      // 已经不在全屏状态（例如用户同时按了 ESC），无需处理。
    }
  }, [])

  const active = nativeActive || immersive

  const toggle = useCallback(() => {
    if (active) void exit()
    else void enter()
  }, [active, enter, exit])

  // 卸载时如果仍处于全屏，主动退出，避免留下没有内容的全屏页面。
  useEffect(() => {
    const target = targetRef.current
    return () => {
      if (target && getFullscreenElement() === target) void exit()
    }
  }, [exit, targetRef])

  return {
    /** 全屏按钮总是可用：不支持原生全屏时使用页面内沉浸式预览 */
    supported: true,
    nativeSupported,
    mode: nativeActive ? ('native' as const) : immersive ? ('immersive' as const) : null,
    active,
    error,
    toggle,
    exit,
  }
}
