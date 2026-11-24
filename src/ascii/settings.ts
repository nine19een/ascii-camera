/** 视觉模式：黑白、原色、调色板（渐变调色板见 palettes.ts）。原“绿色终端”已迁移为调色板 Matrix Green。 */
export type RenderMode = 'mono' | 'color' | 'palette'

export const RENDER_MODES: readonly RenderMode[] = ['mono', 'color', 'palette']

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i

/** 只接受 #rrggbb，非法值回退到给定默认值。 */
export function normalizeHexColor(value: string, fallback: string): string {
  return HEX_COLOR_RE.test(value) ? value.toLowerCase() : fallback
}

/** 对比模式：分割线位置（左侧 ASCII 所占比例，0～1）。 */
export const DEFAULT_SPLIT = 0.5

export const DEFAULT_MODE: RenderMode = 'mono'

/** 字符密度（列数）。 */
export const COLUMNS_MIN = 60
export const COLUMNS_MAX = 180
export const COLUMNS_STEP = 10
export const DEFAULT_COLUMNS = 120

/** 亮度：-50 ～ +50，0 为不调整。 */
export const BRIGHTNESS_MIN = -50
export const BRIGHTNESS_MAX = 50
export const DEFAULT_BRIGHTNESS = 0

/** 对比度：50% ～ 150%，100% 为不调整。 */
export const CONTRAST_MIN = 50
export const CONTRAST_MAX = 150
export const DEFAULT_CONTRAST = 100

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** 把列数约束到允许范围并对齐步长。 */
export function normalizeColumns(columns: number): number {
  const snapped = Math.round(columns / COLUMNS_STEP) * COLUMNS_STEP
  return clamp(snapped, COLUMNS_MIN, COLUMNS_MAX)
}
