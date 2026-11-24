import { useCallback, useEffect, useState } from 'react'

/**
 * 界面布局形态（与 index.css 的媒体查询一一对应）：
 * - desktop：宽度 ≥ 900，且不是矮横屏。舞台 + 底栏，调整面板停靠在右侧。
 * - compact：宽度 < 900 的竖屏（手机、平板竖屏）。底栏分三行，调整面板是底部面板。
 * - landscape：高度 ≤ 520 的横屏（手机横屏）。底栏移到右侧竖排，调整面板替换底栏的位置。
 */
export type LayoutMode = 'desktop' | 'compact' | 'landscape'

const LANDSCAPE_QUERY = '(max-height: 520px) and (orientation: landscape)'
const COMPACT_QUERY = '(max-width: 899px)'

function readLayout(): LayoutMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  if (window.matchMedia(LANDSCAPE_QUERY).matches) return 'landscape'
  if (window.matchMedia(COMPACT_QUERY).matches) return 'compact'
  return 'desktop'
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(readLayout)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const queries = [window.matchMedia(LANDSCAPE_QUERY), window.matchMedia(COMPACT_QUERY)]
    const update = () => setMode(readLayout())
    for (const query of queries) query.addEventListener('change', update)
    update()
    return () => {
      for (const query of queries) query.removeEventListener('change', update)
    }
  }, [])
  return mode
}

/** 读写 localStorage 中的一个字符串偏好；不可用时（隐私模式等）只在本次会话内生效。 */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return allowed.includes(stored as T) ? (stored as T) : fallback
    } catch {
      return fallback
    }
  })
  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // 无法保存时忽略
      }
    },
    [key],
  )
  return [value, update]
}
