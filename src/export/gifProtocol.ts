/** 主线程与 GIF 编码 Worker 之间的消息格式。 */

export type GifWorkerRequest =
  | { type: 'init'; width: number; height: number }
  | { type: 'frame'; buffer: ArrayBuffer; delay: number }
  | { type: 'finish' }

export type GifWorkerResponse =
  | { type: 'progress'; encoded: number }
  | { type: 'done'; buffer: ArrayBuffer; frames: number }
  | { type: 'error'; message: string }
