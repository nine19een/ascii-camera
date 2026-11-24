/**
 * ITU-R BT.601 加权明度：Y = 0.299R + 0.587G + 0.114B。
 * 使用整数近似（权重 ×1024）避免每个像素做浮点乘法：
 * 306 / 1024 ≈ 0.299，601 / 1024 ≈ 0.587，117 / 1024 ≈ 0.114，合计 1024。
 */
export function luminance(r: number, g: number, b: number): number {
  return (r * 306 + g * 601 + b * 117) >> 10
}
