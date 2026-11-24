/** 字形测量：等宽字体的字宽比例、单格宽度判断、笔画面积。 */

export const FONT_FAMILY =
  'ui-monospace, "Cascadia Mono", Consolas, Menlo, Monaco, "DejaVu Sans Mono", "Courier New", monospace'

/** 测量等宽字形宽度失败时使用的典型值（字宽 / 字号）。 */
export const FALLBACK_ADVANCE_RATIO = 0.6

const PROBE_SIZE = 100
const INK_SIZE = 32

let probeCtx: CanvasRenderingContext2D | null = null
let inkCtx: CanvasRenderingContext2D | null = null

function getProbe(): CanvasRenderingContext2D | null {
  if (!probeCtx) {
    probeCtx = document.createElement('canvas').getContext('2d')
    if (probeCtx) probeCtx.font = `${PROBE_SIZE}px ${FONT_FAMILY}`
  }
  return probeCtx
}

/**
 * 字符梯度中各字符的平均水平步进 / 字号。
 * 换字符集后需要重新测量：例如块元素字符可能来自备用字体，步进与 ASCII 字符略有不同。
 */
export function measureAdvanceRatio(ramp: string): number {
  const ctx = getProbe()
  if (!ctx) return FALLBACK_ADVANCE_RATIO
  let total = 0
  let count = 0
  for (const char of ramp) {
    // 每个字符连写 10 次取平均，减少单个字形的取整误差
    total += ctx.measureText(char.repeat(10)).width / 10
    count++
  }
  const ratio = count ? total / count / PROBE_SIZE : 0
  return Number.isFinite(ratio) && ratio > 0.3 && ratio < 1 ? ratio : FALLBACK_ADVANCE_RATIO
}

/** 字形在等宽字体下是否正好占一个字符格（与 “M” 的宽度相差不超过 12%）。 */
export function isSingleCellGlyph(char: string): boolean {
  const ctx = getProbe()
  if (!ctx) return true
  const reference = ctx.measureText('M').width
  const width = ctx.measureText(char).width
  return reference > 0 && Math.abs(width - reference) / reference <= 0.12
}

/** 字形的笔画面积（覆盖的像素透明度之和），用于给没有明确明暗顺序的字符排序。 */
export function measureInk(char: string): number {
  if (!inkCtx) {
    const canvas = document.createElement('canvas')
    canvas.width = INK_SIZE
    canvas.height = INK_SIZE
    inkCtx = canvas.getContext('2d', { willReadFrequently: true })
    if (!inkCtx) return 0
  }
  const ctx = inkCtx
  ctx.clearRect(0, 0, INK_SIZE, INK_SIZE)
  ctx.font = `${INK_SIZE * 0.8}px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(char, INK_SIZE / 2, INK_SIZE / 2)
  const data = ctx.getImageData(0, 0, INK_SIZE, INK_SIZE).data
  let ink = 0
  for (let p = 3; p < data.length; p += 4) ink += data[p]
  return ink
}
