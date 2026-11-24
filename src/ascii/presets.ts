/**
 * Look Presets（效果预设）：一次性应用一套完整视觉配置的快捷方式。
 *
 * 预设不是视觉模式，也不是另一套独立参数：选择预设只是把下列参数一次性写入，
 * 之后用户仍然可以手动调整任何一项。
 *   视觉模式 · 字符集 · 调色板（调色板模式时）· 字符密度 · 亮度 · 对比度
 *
 * 预设不控制：摄像头设备、镜像、摄像头启停、演示动画、原画对比与分割线、冻结、全屏、录制。
 */
import type { CharsetId } from './charset'
import type { BuiltinPaletteId, PaletteId } from './palettes'
import type { RenderMode } from './settings'

export type LookPresetId = 'classic-mono' | 'matrix-green' | 'neon-purple' | 'retro-amber' | 'digital-cyan' | 'natural-color'

export interface LookConfig {
  mode: RenderMode
  charset: CharsetId
  /** 仅在调色板模式下有意义。 */
  palette: PaletteId
  columns: number
  brightness: number
  contrast: number
}

export interface LookPreset {
  id: LookPresetId
  config: Omit<LookConfig, 'palette'> & { palette: BuiltinPaletteId | null }
}

export const LOOK_PRESETS: readonly LookPreset[] = [
  {
    id: 'classic-mono',
    config: { mode: 'mono', charset: 'classic', palette: null, columns: 120, brightness: 0, contrast: 110 },
  },
  {
    id: 'matrix-green',
    config: { mode: 'palette', charset: 'matrix', palette: 'matrix', columns: 140, brightness: 5, contrast: 120 },
  },
  {
    id: 'neon-purple',
    config: { mode: 'palette', charset: 'classic', palette: 'purple', columns: 140, brightness: 0, contrast: 115 },
  },
  {
    id: 'retro-amber',
    config: { mode: 'palette', charset: 'blocks', palette: 'amber', columns: 130, brightness: 5, contrast: 110 },
  },
  {
    id: 'digital-cyan',
    config: { mode: 'palette', charset: 'binary', palette: 'cyan', columns: 150, brightness: 0, contrast: 120 },
  },
  {
    id: 'natural-color',
    config: { mode: 'color', charset: 'classic', palette: null, columns: 120, brightness: 0, contrast: 100 },
  },
]

/** 页面初始配置：Classic Mono。 */
export const DEFAULT_LOOK_PRESET: LookPresetId = 'classic-mono'

export function getLookPreset(id: LookPresetId): LookPreset {
  return LOOK_PRESETS.find((preset) => preset.id === id) ?? LOOK_PRESETS[0]
}

/**
 * 当前配置与哪个预设完全一致。调色板只在调色板模式下参与比较；
 * 自定义字符梯度、自定义（或修改过的）调色板不属于任何预设。
 */
export function matchLookPreset(config: LookConfig): LookPresetId | null {
  for (const preset of LOOK_PRESETS) {
    const p = preset.config
    if (
      p.mode === config.mode &&
      p.charset === config.charset &&
      p.columns === config.columns &&
      p.brightness === config.brightness &&
      p.contrast === config.contrast &&
      (p.mode !== 'palette' || p.palette === config.palette)
    ) {
      return preset.id
    }
  }
  return null
}
