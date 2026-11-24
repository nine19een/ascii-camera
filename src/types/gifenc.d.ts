// gifenc 1.0.3 没有自带类型声明，这里只声明本项目用到的部分。
declare module 'gifenc' {
  export type Palette = number[][]
  export type PixelFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export interface WriteFrameOptions {
    palette?: Palette
    delay?: number
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    dispose?: number
  }

  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    reset(): void
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: PixelFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean },
  ): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: PixelFormat): Uint8Array
}
