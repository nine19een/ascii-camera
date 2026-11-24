/**
 * WebM 收尾封装：把 MediaRecorder 输出的"直播式" WebM 改写成完整的点播文件，只改容器、不重新编码。
 *
 * Chrome / Edge 的 MediaRecorder 写出的 WebM 里，Segment 和每个 Cluster 的长度都是"未知"（边录边写），
 * 文件头里也没有时长和 Cues（索引）。这样的文件在浏览器里能播，但很多播放器显示不出时长、无法拖动进度。
 *
 * 之前使用的 fix-webm-duration 会把第一个"未知长度"的 Cluster 改写成一直延伸到文件末尾的固定长度，
 * 后面所有 Cluster 都变成嵌套在它里面的非法子元素。浏览器和 FFmpeg 的解析器比较宽松能播完，
 * 但严格按规范解析的播放器（libmatroska / mkvinfo、Windows 播放器、手机相册等）只能读到第一个 Cluster，
 * 也就是开头约 3 秒。
 *
 * 这里按 Matroska 规范重新组织容器：
 *   EBML 头 | Segment(已知长度) { SeekHead | Info(含 Duration) | Tracks | Cluster(已知长度)… | Cues }
 * 每个 Cluster 的内容原样保留（字节不变），只补上真实长度；Cues 为每个以关键帧开头的 Cluster 建立索引，
 * 播放器据此显示时长并支持拖动。遇到无法识别的结构时返回 null，调用方保留原始文件。
 */

const ID_EBML = 0x1a45dfa3
const ID_SEGMENT = 0x18538067
const ID_SEEK_HEAD = 0x114d9b74
const ID_SEEK = 0x4dbb
const ID_SEEK_ID = 0x53ab
const ID_SEEK_POSITION = 0x53ac
const ID_INFO = 0x1549a966
const ID_TIMECODE_SCALE = 0x2ad7b1
const ID_DURATION = 0x4489
const ID_TRACKS = 0x1654ae6b
const ID_CLUSTER = 0x1f43b675
const ID_TIMECODE = 0xe7
const ID_SIMPLE_BLOCK = 0xa3
const ID_CUES = 0x1c53bb6b
const ID_CUE_POINT = 0xbb
const ID_CUE_TIME = 0xb3
const ID_CUE_TRACK_POSITIONS = 0xb7
const ID_CUE_TRACK = 0xf7
const ID_CUE_CLUSTER_POSITION = 0xf1
const ID_VOID = 0xec

/** Segment 的一级子元素：未知长度的 Cluster 遇到它们即结束。 */
const SEGMENT_CHILDREN = new Set([
  ID_SEEK_HEAD,
  ID_INFO,
  ID_TRACKS,
  ID_CLUSTER,
  ID_CUES,
  0x1254c367, // Tags
  0x1043a770, // Chapters
  0x1941a469, // Attachments
])

interface ElementHeader {
  id: number
  /** null 表示"未知长度" */
  size: number | null
  dataStart: number
}

interface ClusterInfo {
  payload: Uint8Array<ArrayBuffer>
  /** 以关键帧开头时的时间（TimecodeScale 单位），用于 Cues */
  cueTime: number | null
  cueTrack: number
}

function readHeader(u: Uint8Array, p: number): ElementHeader | null {
  if (p >= u.length) return null
  // ID：保留长度标记位
  const first = u[p]
  let idLength = 1
  for (let mask = 0x80; idLength <= 4 && !(first & mask); mask >>= 1) idLength++
  if (idLength > 4 || p + idLength > u.length) return null
  let id = 0
  for (let i = 0; i < idLength; i++) id = id * 256 + u[p + i]
  // 长度：去掉标记位，全 1 表示未知长度
  const q = p + idLength
  if (q >= u.length) return null
  const lead = u[q]
  let sizeLength = 1
  let mask = 0x80
  while (sizeLength <= 8 && !(lead & mask)) {
    sizeLength++
    mask >>= 1
  }
  if (sizeLength > 8 || q + sizeLength > u.length) return null
  let size = lead & (mask - 1)
  let allOnes = size === mask - 1
  for (let i = 1; i < sizeLength; i++) {
    const byte = u[q + i]
    size = size * 256 + byte
    if (byte !== 0xff) allOnes = false
  }
  return { id, size: allOnes ? null : size, dataStart: q + sizeLength }
}

function readUint(u: Uint8Array, start: number, length: number): number {
  let value = 0
  for (let i = 0; i < length; i++) value = value * 256 + u[start + i]
  return value
}

function idBytes(id: number): number[] {
  const out: number[] = []
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256)
  return out
}

/** 无符号整数的大端字节；width 指定时固定宽度。 */
function uintBytes(value: number, width?: number): number[] {
  // 防御：非有限值会让下面的循环永不结束（只可能来自损坏的输入，由调用方降级为原文件）
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`invalid EBML uint: ${value}`)
  const out: number[] = []
  for (let v = value; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256)
  if (out.length === 0) out.push(0)
  if (width !== undefined) while (out.length < width) out.unshift(0)
  return out
}

/** EBML 长度编码；width 指定时固定宽度（用 8 字节写 Segment / Cluster 长度，便于预先计算布局）。 */
function sizeBytes(size: number, width?: number): number[] {
  let length = width ?? 1
  if (width === undefined) while (size >= 2 ** (7 * length) - 1) length++
  const out = uintBytes(size, length)
  out[0] |= 0x80 >> (length - 1)
  return out
}

function element(id: number, body: number[] | Uint8Array): Uint8Array<ArrayBuffer> {
  const head = [...idBytes(id), ...sizeBytes(body.length)]
  const out = new Uint8Array(head.length + body.length)
  out.set(head, 0)
  out.set(body, head.length)
  return out
}

function uintElement(id: number, value: number, width?: number): Uint8Array<ArrayBuffer> {
  return element(id, uintBytes(value, width))
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * 解析 MediaRecorder 输出的 WebM 并重新封装，返回组成新文件的字节片段（Cluster 内容引用原数组，不复制）。
 * 结构不符合预期时返回 null。durationMs 为录制时长（毫秒）。
 */
export function finalizeWebmBytes(u: Uint8Array<ArrayBuffer>, durationMs: number): Uint8Array<ArrayBuffer>[] | null {
  if (!Number.isFinite(durationMs) || durationMs < 0) return null
  const ebml = readHeader(u, 0)
  if (!ebml || ebml.id !== ID_EBML || ebml.size === null) return null
  const ebmlEnd = ebml.dataStart + ebml.size
  const segment = readHeader(u, ebmlEnd)
  if (!segment || segment.id !== ID_SEGMENT) return null
  const segmentEnd = segment.size === null ? u.length : segment.dataStart + segment.size
  if (!Number.isSafeInteger(segmentEnd) || segmentEnd > u.length) return null

  let infoChildren: Uint8Array<ArrayBuffer>[] | null = null
  let timecodeScale = 1_000_000
  let tracks: Uint8Array<ArrayBuffer> | null = null
  const extras: Uint8Array<ArrayBuffer>[] = []
  const clusters: ClusterInfo[] = []
  let lastBlockTime = 0

  let p = segment.dataStart
  while (p < segmentEnd) {
    const h = readHeader(u, p)
    if (!h) return null
    if (h.id === ID_CLUSTER) {
      // 未知长度时，读到下一个 Segment 一级元素或文件末尾为止
      const limit = h.size === null ? segmentEnd : h.dataStart + h.size
      if (!Number.isSafeInteger(limit) || limit > segmentEnd) return null
      let clusterTime = 0
      let cueTime: number | null = null
      let cueTrack = 1
      let sawBlock = false
      let r = h.dataStart
      while (r < limit) {
        const c = readHeader(u, r)
        if (!c) return null
        if (SEGMENT_CHILDREN.has(c.id)) break
        if (c.size === null) return null
        const end = c.dataStart + c.size
        if (end > limit) return null
        if (c.id === ID_TIMECODE) {
          if (c.size > 8) return null // EBML 无符号整数最多 8 字节；更长说明文件已损坏
          clusterTime = readUint(u, c.dataStart, c.size)
          if (!Number.isSafeInteger(clusterTime)) return null
        } else if (c.id === ID_SIMPLE_BLOCK && c.size >= 4) {
          const track = u[c.dataStart] & 0x7f // 轨道号是 1 字节 vint（MediaRecorder 只有一条视频轨）
          const relative = ((u[c.dataStart + 1] << 8) | u[c.dataStart + 2]) << 16 >> 16
          const keyframe = (u[c.dataStart + 3] & 0x80) !== 0
          const time = clusterTime + relative
          if (!sawBlock && keyframe && u[c.dataStart] & 0x80) {
            cueTime = time
            cueTrack = track
          }
          sawBlock = true
          lastBlockTime = Math.max(lastBlockTime, time)
        }
        r = end
      }
      clusters.push({ payload: u.subarray(h.dataStart, r), cueTime, cueTrack })
      p = r
      continue
    }
    if (h.size === null) return null
    const end = h.dataStart + h.size
    if (end > segmentEnd) return null
    if (h.id === ID_INFO) {
      infoChildren = []
      let r = h.dataStart
      while (r < end) {
        const c = readHeader(u, r)
        if (!c || c.size === null || c.dataStart + c.size > end) return null
        const cEnd = c.dataStart + c.size
        if (c.id === ID_TIMECODE_SCALE) {
          if (c.size > 8) return null
          timecodeScale = readUint(u, c.dataStart, c.size)
          if (!Number.isSafeInteger(timecodeScale) || timecodeScale <= 0) return null
        }
        if (c.id !== ID_DURATION) infoChildren.push(u.subarray(r, cEnd))
        r = cEnd
      }
    } else if (h.id === ID_TRACKS) {
      tracks = u.subarray(p, end)
    } else if (h.id !== ID_SEEK_HEAD && h.id !== ID_CUES && h.id !== ID_VOID) {
      extras.push(u.subarray(p, end)) // 其他已知长度的一级元素（如 Tags）原样保留
    }
    p = end
  }
  if (!infoChildren || !tracks || clusters.length === 0) return null

  // Info：原有字段 + Duration（float64，TimecodeScale 单位）
  const durationTicks = Math.max((durationMs * 1_000_000) / timecodeScale, lastBlockTime)
  const durationBytes = new Uint8Array(8)
  new DataView(durationBytes.buffer).setFloat64(0, durationTicks)
  const info = element(ID_INFO, concat([...infoChildren, element(ID_DURATION, durationBytes)]))

  // Cluster：8 字节长度 + 原内容
  const clusterHeads = clusters.map((cluster) => new Uint8Array([...idBytes(ID_CLUSTER), ...sizeBytes(cluster.payload.length, 8)]))

  // 布局（位置相对 Segment 数据起点）。SeekHead 的位置字段固定 8 字节，因此它的长度与位置值无关。
  const seekEntry = (id: number, position: number) =>
    element(ID_SEEK, concat([element(ID_SEEK_ID, idBytes(id)), uintElement(ID_SEEK_POSITION, position, 8)]))
  const buildSeekHead = (infoPos: number, tracksPos: number, cuesPos: number) =>
    element(ID_SEEK_HEAD, concat([seekEntry(ID_INFO, infoPos), seekEntry(ID_TRACKS, tracksPos), seekEntry(ID_CUES, cuesPos)]))
  const seekHeadLength = buildSeekHead(0, 0, 0).length
  const infoPos = seekHeadLength
  const tracksPos = infoPos + info.length
  let offset = tracksPos + tracks.length + extras.reduce((n, part) => n + part.length, 0)
  const cuePoints: Uint8Array<ArrayBuffer>[] = []
  clusters.forEach((cluster, i) => {
    if (cluster.cueTime !== null) {
      cuePoints.push(
        element(
          ID_CUE_POINT,
          concat([
            uintElement(ID_CUE_TIME, cluster.cueTime),
            element(ID_CUE_TRACK_POSITIONS, concat([uintElement(ID_CUE_TRACK, cluster.cueTrack), uintElement(ID_CUE_CLUSTER_POSITION, offset)])),
          ]),
        ),
      )
    }
    offset += clusterHeads[i].length + cluster.payload.length
  })
  const cuesPos = offset
  const cues = element(ID_CUES, concat(cuePoints))
  const seekHead = buildSeekHead(infoPos, tracksPos, cuesPos)
  const segmentSize = cuesPos + cues.length
  const segmentHead = new Uint8Array([...idBytes(ID_SEGMENT), ...sizeBytes(segmentSize, 8)])

  const parts: Uint8Array<ArrayBuffer>[] = [u.subarray(0, ebmlEnd), segmentHead, seekHead, info, tracks, ...extras]
  clusters.forEach((cluster, i) => parts.push(clusterHeads[i], cluster.payload))
  parts.push(cues)
  return parts
}

/** 重新封装 WebM Blob；无法识别结构或出错时原样返回，fallback 为 true。 */
export async function finalizeWebm(blob: Blob, durationMs: number): Promise<{ blob: Blob; fallback: boolean }> {
  try {
    const parts = finalizeWebmBytes(new Uint8Array(await blob.arrayBuffer()), durationMs)
    return parts ? { blob: new Blob(parts, { type: blob.type }), fallback: false } : { blob, fallback: true }
  } catch {
    return { blob, fallback: true }
  }
}
