/**
 * GIF 编码 Worker（使用 gifenc，MIT）。
 *
 * 帧在录制过程中逐帧传入并立即编码：每帧单独量化为 256 色调色板（局部调色板）后写入 GIF 数据流，
 * 编码完的帧不再保留未压缩像素，因此内存中只有压缩后的 GIF 数据。
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import type { GifWorkerRequest, GifWorkerResponse } from './gifProtocol'

// 应用的 tsconfig 使用 DOM 类型库（与 WebWorker 类型库不能同时启用），这里只声明用到的 Worker 全局成员。
interface WorkerScope {
  postMessage(message: GifWorkerResponse, transfer: Transferable[]): void
  onmessage: ((event: MessageEvent<GifWorkerRequest>) => void) | null
}

const scope = self as unknown as WorkerScope

let encoder: ReturnType<typeof GIFEncoder> | null = null
let width = 0
let height = 0
let encoded = 0

function post(message: GifWorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer)
}

scope.onmessage = (event: MessageEvent<GifWorkerRequest>) => {
  const message = event.data
  try {
    switch (message.type) {
      case 'init':
        encoder = GIFEncoder()
        width = message.width
        height = message.height
        encoded = 0
        break
      case 'frame': {
        if (!encoder) throw new Error('GIF encoder is not initialised')
        const rgba = new Uint8ClampedArray(message.buffer)
        if (rgba.length !== width * height * 4) throw new Error('Frame size does not match GIF size')
        const palette = quantize(rgba, 256)
        const index = applyPalette(rgba, palette)
        // repeat: 0 = 无限循环播放（只在第一帧写入循环信息）
        encoder.writeFrame(index, width, height, { palette, delay: message.delay, repeat: 0 })
        encoded += 1
        post({ type: 'progress', encoded })
        break
      }
      case 'finish': {
        if (!encoder) throw new Error('GIF encoder is not initialised')
        encoder.finish()
        const bytes = encoder.bytes()
        encoder = null
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        post({ type: 'done', buffer, frames: encoded }, [buffer])
        break
      }
    }
  } catch (error) {
    encoder = null
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
