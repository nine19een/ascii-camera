/**
 * 渐变调色板：暗部（Shadow）→ 中间调（Midtone）→ 高光（Highlight）三节点渐变，加独立的背景色。
 *
 * 每个字符的颜色由它对应区域的色调（经过自动色阶、对比度、亮度之后的 0～255 值）决定：
 * 色调 0 = 暗部颜色，127.5 = 中间调颜色，255 = 高光颜色，节点之间平滑插值。
 *
 * 插值在 OKLCH（OKLab 的极坐标形式，感知均匀）中进行：明度、饱和度线性变化，色相沿较短的弧线旋转。
 * 这样明暗递进均匀，而且在色相差异很大的两种颜色之间（例如蓝 → 红）也不会经过发灰的中间色
 * （直接在 OKLab 或 RGB 中直线插值会经过低饱和区域）。接近灰色的节点没有明确色相，此时沿用另一端的色相。
 * 颜色空间转换只在调色板变化时执行一次，生成 256 级 RGB 查找表；逐帧只做查表。
 *
 * 本文件不依赖 DOM，便于在 Node 中单独测试。
 */

export interface PaletteColors {
  shadow: string
  midtone: string
  highlight: string
  background: string
}

export type PaletteStop = Exclude<keyof PaletteColors, 'background'>
export type BuiltinPaletteId = 'matrix' | 'purple' | 'amber' | 'cyan'
export type PaletteId = BuiltinPaletteId | 'custom'

export interface BuiltinPalette {
  id: BuiltinPaletteId
  colors: Readonly<PaletteColors>
}

/**
 * Matrix Green 由原“绿色终端”迁移而来：三个节点取自原绿色终端在色调 1 / 127.5 / 255 处的颜色
 * （原实现：G = 40 + 色调 × 215 / 255，R = 0.2G，B = 0.4G），因此暗部可见性与亮部递进与原效果一致
 * （与原线性公式在任一色调上的通道差见单元测试，不超过 3/255）。背景由纯黑改为接近纯黑的深绿色。
 */
export const BUILTIN_PALETTES: readonly BuiltinPalette[] = [
  {
    id: 'matrix',
    colors: { shadow: '#082810', midtone: '#1e943b', highlight: '#33ff66', background: '#010802' },
  },
  {
    id: 'purple',
    colors: { shadow: '#3a1266', midtone: '#9b4dff', highlight: '#ff9cf2', background: '#0b0614' },
  },
  {
    id: 'amber',
    colors: { shadow: '#4a2408', midtone: '#ff9a1a', highlight: '#ffe9a8', background: '#0d0802' },
  },
  {
    id: 'cyan',
    colors: { shadow: '#06345a', midtone: '#17c4e8', highlight: '#d2fbff', background: '#010913' },
  },
]

export const DEFAULT_PALETTE: BuiltinPaletteId = 'matrix'

export function getBuiltinPalette(id: BuiltinPaletteId): BuiltinPalette {
  return BUILTIN_PALETTES.find((palette) => palette.id === id) ?? BUILTIN_PALETTES[0]
}

export function isBuiltinPaletteId(id: string): id is BuiltinPaletteId {
  return BUILTIN_PALETTES.some((palette) => palette.id === id)
}

const HEX_RE = /^#[0-9a-f]{6}$/i

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function samePalette(a: PaletteColors, b: PaletteColors): boolean {
  return (
    a.shadow.toLowerCase() === b.shadow.toLowerCase() &&
    a.midtone.toLowerCase() === b.midtone.toLowerCase() &&
    a.highlight.toLowerCase() === b.highlight.toLowerCase() &&
    a.background.toLowerCase() === b.background.toLowerCase()
  )
}

// ---------------------------------------------------------------------------
// sRGB ↔ OKLab（Björn Ottosson, 2020）

type Vec3 = [number, number, number]

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  const c = value <= 0 ? 0 : value >= 1 ? 1 : value
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(encoded * 255)
}

function rgbToOklab([r8, g8, b8]: Vec3): Vec3 {
  const r = srgbToLinear(r8)
  const g = srgbToLinear(g8)
  const b = srgbToLinear(b8)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToRgb([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** 饱和度低于该值的颜色视为无色相（灰色）。 */
const ACHROMATIC = 0.02

function toLch([L, a, b]: Vec3): Vec3 {
  return [L, Math.hypot(a, b), Math.atan2(b, a)]
}

function mixLch(from: Vec3, to: Vec3, f: number): Vec3 {
  let h1 = from[2]
  let h2 = to[2]
  if (from[1] < ACHROMATIC) h1 = h2
  if (to[1] < ACHROMATIC) h2 = h1
  // 沿较短的弧线插值色相
  let dh = h2 - h1
  if (dh > Math.PI) dh -= 2 * Math.PI
  else if (dh < -Math.PI) dh += 2 * Math.PI
  const L = from[0] + (to[0] - from[0]) * f
  const C = from[1] + (to[1] - from[1]) * f
  const h = h1 + dh * f
  return [L, C * Math.cos(h), C * Math.sin(h)]
}

export interface PaletteLut {
  r: Uint8Array
  g: Uint8Array
  b: Uint8Array
}

/** 生成（或写入已有的）256 级渐变查找表。只在调色板变化时调用。 */
export function buildPaletteLut(colors: PaletteColors, target?: PaletteLut): PaletteLut {
  const lut = target ?? { r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256) }
  const shadow = toLch(rgbToOklab(hexToRgb(colors.shadow)))
  const midtone = toLch(rgbToOklab(hexToRgb(colors.midtone)))
  const highlight = toLch(rgbToOklab(hexToRgb(colors.highlight)))
  for (let tone = 0; tone < 256; tone++) {
    const u = tone / 255
    const [from, to, f] = u <= 0.5 ? [shadow, midtone, u * 2] : [midtone, highlight, (u - 0.5) * 2]
    const [r, g, b] = oklabToRgb(mixLch(from, to, f))
    lut.r[tone] = r
    lut.g[tone] = g
    lut.b[tone] = b
  }
  return lut
}
