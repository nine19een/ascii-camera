/** 导出文件名与 Blob URL 下载工具。所有文件都只在本地生成和下载，不会上传。 */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 例如 ascii-camera-20261123-013000.png（本地时间）。 */
export function exportFileName(extension: string, date: Date = new Date()): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `ascii-camera-${day}-${time}.${extension}`
}

/** 通过临时 <a download> 触发浏览器下载。 */
export function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * 统一管理本页面创建的 Blob URL：每个 URL 都会被释放——到期释放、被替换时释放，或页面卸载时全部释放。
 */
export class ObjectUrlStore {
  private readonly urls = new Map<string, number>()

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob)
    this.urls.set(url, 0)
    return url
  }

  /** 在 delayMs 后释放（给浏览器留出开始下载的时间）。 */
  revokeLater(url: string, delayMs: number): void {
    if (!this.urls.has(url)) return
    const timer = window.setTimeout(() => this.revoke(url), delayMs)
    this.urls.set(url, timer)
  }

  revoke(url: string): void {
    const timer = this.urls.get(url)
    if (timer === undefined) return
    if (timer) clearTimeout(timer)
    this.urls.delete(url)
    URL.revokeObjectURL(url)
  }

  revokeAll(): void {
    for (const url of Array.from(this.urls.keys())) this.revoke(url)
  }

  get size(): number {
    return this.urls.size
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}
