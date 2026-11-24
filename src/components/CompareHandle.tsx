import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { DisplaySize } from '../hooks/useAsciiCamera'
import { useI18n } from '../i18n/context'

interface CompareHandleProps {
  size: DisplaySize
  split: number
  /** 拖动过程中的实时位置（高频，只更新渲染器）。 */
  onChange: (split: number) => void
  /** 拖动结束 / 键盘调整后的最终位置。 */
  onCommit: (split: number) => void
}

const KEY_STEP = 0.01
const KEY_STEP_LARGE = 0.1

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * 对比滑杆的交互层（拖动手柄、两侧标签）。它只属于网页界面，不会进入导出的作品；
 * 作品中的分割线由渲染器直接画在最终画布上。
 *
 * 覆盖层与字符画画布尺寸完全一致并居中，因此指针位置可以直接换算为分割比例。
 * 支持鼠标、触屏（Pointer Events + 指针捕获）和键盘（方向键 / Home / End）。
 */
export function CompareHandle({ size, split: initialSplit, onChange, onCommit }: CompareHandleProps) {
  const { m } = useI18n()
  const [split, setSplit] = useState(initialSplit)
  const overlayRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const splitRef = useRef(initialSplit)

  const apply = (value: number) => {
    const next = clamp01(value)
    splitRef.current = next
    setSplit(next)
    onChange(next)
  }

  const fromPointer = (clientX: number) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    apply((clientX - rect.left) / rect.width)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    fromPointer(event.clientX)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) fromPointer(event.clientX)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onCommit(splitRef.current)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    let next: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = splitRef.current - step
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = splitRef.current + step
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 1
    if (next === null) return
    event.preventDefault()
    apply(next)
    onCommit(clamp01(next))
  }

  const percent = Math.round(split * 100)

  return (
    <div
      ref={overlayRef}
      className="compare-overlay"
      style={{ width: size.width, height: size.height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="compare-tag compare-tag-left" aria-hidden="true">
        ASCII
      </span>
      <span className="compare-tag compare-tag-right" aria-hidden="true">
        {m.compare.original}
      </span>
      <div
        className="compare-handle"
        style={{ left: `${split * 100}%` }}
        role="slider"
        tabIndex={0}
        aria-label={m.compare.handle}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={m.compare.value({ ascii: percent, original: 100 - percent })}
        onKeyDown={onKeyDown}
      >
        <span className="compare-knob" aria-hidden="true">
          ◂▸
        </span>
      </div>
    </div>
  )
}
