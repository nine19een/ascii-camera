import { memo, useEffect, useRef } from 'react'
import { LOOK_PRESETS, type LookPresetId } from '../ascii/presets'
import { useI18n } from '../i18n/context'
import type { DemoFrameSource } from '../media/frameSource'
import { PresetPreviewManager } from '../presets/PresetPreviewManager'

interface PresetGalleryProps {
  demoFrames: DemoFrameSource
  mirror: boolean
  activePreset: LookPresetId | null
  onApply: (id: LookPresetId) => void
}

/**
 * 效果预设卡片：每张卡片显示用该预设完整参数实时渲染的同一段演示动画。
 * 预览由 PresetPreviewManager 在 React 之外驱动，组件本身不随预览帧重新渲染。
 */
export const PresetGallery = memo(function PresetGallery({ demoFrames, mirror, activePreset, onApply }: PresetGalleryProps) {
  const { m } = useI18n()
  const managerRef = useRef<PresetPreviewManager | null>(null)
  const slotsRef = useRef(new Map<LookPresetId, { container: HTMLElement; canvas: HTMLCanvasElement }>())
  const mirrorRef = useRef(mirror)

  useEffect(() => {
    const manager = new PresetPreviewManager(demoFrames)
    manager.setMirror(mirrorRef.current)
    managerRef.current = manager
    for (const [id, slot] of slotsRef.current) manager.register(id, slot.canvas, slot.container)
    return () => {
      manager.dispose()
      managerRef.current = null
    }
  }, [demoFrames])

  useEffect(() => {
    mirrorRef.current = mirror
    managerRef.current?.setMirror(mirror)
  }, [mirror])

  const bindSlot = (id: LookPresetId) => (container: HTMLSpanElement | null) => {
    if (!container) {
      slotsRef.current.delete(id)
      return
    }
    const canvas = container.querySelector('canvas')
    if (canvas) slotsRef.current.set(id, { container, canvas })
  }

  return (
    <div className="ribbon" role="group" aria-label={m.panel.presets}>
      <div className="ribbon-track">
        {LOOK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={preset.id === activePreset ? 'preset-card is-selected' : 'preset-card'}
            aria-pressed={preset.id === activePreset}
            data-preset={preset.id}
            onClick={() => onApply(preset.id)}
          >
            <span className="preset-preview" ref={bindSlot(preset.id)}>
              <canvas className="preset-canvas" data-preset={preset.id} aria-hidden="true" />
            </span>
            <span className="preset-name">{m.presets.names[preset.id]}</span>
          </button>
        ))}
        {!activePreset && <p className="preset-status">{m.presets.modified}</p>}
      </div>
    </div>
  )
})
