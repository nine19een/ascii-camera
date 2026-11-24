/**
 * webmFinalize：用 Chrome MediaRecorder 的真实原始输出（tests/fixtures/chrome-raw-vp9.webm）检查重新封装后的结构。
 * 这里用一个独立于被测代码的 EBML 读取器逐层校验，不依赖被测模块自己的解析结果。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { finalizeWebm, finalizeWebmBytes } from '../src/export/webmFinalize'

const RAW = new Uint8Array(readFileSync(new URL('./fixtures/chrome-raw-vp9.webm', import.meta.url)))
/** 录制 fixture 时提交的帧数（每帧一个 SimpleBlock）。 */
const FIXTURE_FRAMES = 65

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueClusterPosition: 0xf1,
} as const
const MASTERS = new Set<number>([ID.Segment, ID.SeekHead, ID.Seek, ID.Info, ID.Tracks, ID.Cluster, ID.Cues, ID.CuePoint, ID.CueTrackPositions])

interface El {
  id: number
  start: number
  dataStart: number
  /** null = 未知长度 */
  size: number | null
}

function vint(u: Uint8Array, p: number, keepMarker: boolean): [number, number, boolean] {
  const first = u[p]
  let len = 1
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++
  if (len > 8 || p + len > u.length) throw new Error(`bad vint at ${p}`)
  let value = keepMarker ? first : first & ((0x80 >> (len - 1)) - 1)
  let allOnes = value === (0x80 >> (len - 1)) - 1
  for (let i = 1; i < len; i++) {
    value = value * 256 + u[p + i]
    if (u[p + i] !== 0xff) allOnes = false
  }
  return [value, len, allOnes]
}

function header(u: Uint8Array, p: number): El {
  const [id, idLen] = vint(u, p, true)
  const [size, sizeLen, unknown] = vint(u, p + idLen, false)
  return { id, start: p, dataStart: p + idLen + sizeLen, size: unknown ? null : size }
}

/** 列出 [from, to) 中的子元素；要求每个子元素长度已知且不越界。 */
function kids(u: Uint8Array, from: number, to: number): El[] {
  const out: El[] = []
  for (let p = from; p < to; ) {
    const el = header(u, p)
    if (el.size === null) throw new Error(`unknown size 0x${el.id.toString(16)} at ${p}`)
    const end = el.dataStart + el.size
    if (end > to) throw new Error(`0x${el.id.toString(16)} at ${p} overruns parent (${end} > ${to})`)
    out.push(el)
    p = end
  }
  return out
}

/** 递归检查所有主元素（含 Cluster）长度已知、不越界、恰好铺满父元素。 */
function walk(u: Uint8Array, el: El): void {
  if (!MASTERS.has(el.id) || el.size === null) return
  for (const child of kids(u, el.dataStart, el.dataStart + el.size)) walk(u, child)
}

const uint = (u: Uint8Array, el: El) => {
  let v = 0
  for (let i = 0; i < (el.size ?? 0); i++) v = v * 256 + u[el.dataStart + i]
  return v
}
const end = (el: El) => el.dataStart + (el.size ?? 0)
const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** 按出现顺序取出全部 SimpleBlock 的原始字节（输入可以是未知长度的直播式文件）。 */
function simpleBlocks(u: Uint8Array): Uint8Array[] {
  const blocks: Uint8Array[] = []
  const ebml = header(u, 0)
  const seg = header(u, end(ebml))
  let p = seg.dataStart
  while (p < u.length) {
    const el = header(u, p)
    if (el.id === ID.Cluster) {
      p = el.dataStart // 进入 Cluster（长度可能未知）
      continue
    }
    if (el.size === null) throw new Error('unexpected unknown size')
    if (el.id === ID.SimpleBlock) blocks.push(u.slice(el.dataStart, end(el)))
    p = end(el)
  }
  return blocks
}

describe('finalizeWebmBytes（Chrome VP9 原始输出）', () => {
  it('fixture 是直播式结构：Segment 与 Cluster 长度未知、没有 Duration 和 Cues', () => {
    const seg = header(RAW, end(header(RAW, 0)))
    expect(seg.id).toBe(ID.Segment)
    expect(seg.size).toBeNull()
    expect(simpleBlocks(RAW)).toHaveLength(FIXTURE_FRAMES)
  })

  const parts = finalizeWebmBytes(RAW, 2200)
  const out = parts ? join(parts) : new Uint8Array(0)

  it('输出为完整的点播结构，所有长度已知并且恰好铺满文件', () => {
    expect(parts).not.toBeNull()
    const ebml = header(out, 0)
    expect(ebml.id).toBe(ID.EBML)
    expect(out.subarray(0, end(ebml))).toEqual(RAW.subarray(0, end(ebml))) // EBML 头原样保留
    const seg = header(out, end(ebml))
    expect(seg.id).toBe(ID.Segment)
    expect(seg.size).not.toBeNull()
    expect(end(seg)).toBe(out.length)
    walk(out, seg)

    const top = kids(out, seg.dataStart, end(seg)).map((el) => el.id)
    expect(top.slice(0, 3)).toEqual([ID.SeekHead, ID.Info, ID.Tracks])
    expect(top[top.length - 1]).toBe(ID.Cues)
    expect(top.filter((id) => id === ID.Cluster).length).toBeGreaterThan(1)
  })

  it('SimpleBlock 的字节与数量完全不变（只改容器，不改数据）', () => {
    const before = simpleBlocks(RAW)
    const after = simpleBlocks(out)
    expect(after).toHaveLength(before.length)
    expect(join(after)).toEqual(join(before))
  })

  it('Duration 写入 Info，SeekHead 指向 Info / Tracks / Cues', () => {
    const seg = header(out, end(header(out, 0)))
    const top = kids(out, seg.dataStart, end(seg))
    const info = top.find((el) => el.id === ID.Info)!
    const infoKids = kids(out, info.dataStart, end(info))
    const scale = uint(out, infoKids.find((el) => el.id === ID.TimecodeScale)!)
    const durationEl = infoKids.filter((el) => el.id === ID.Duration)
    expect(durationEl).toHaveLength(1)
    const duration = new DataView(out.buffer, durationEl[0].dataStart, 8).getFloat64(0)
    expect((duration * scale) / 1e6).toBeCloseTo(2200, 0)

    const seekHead = top.find((el) => el.id === ID.SeekHead)!
    const targets = kids(out, seekHead.dataStart, end(seekHead)).map((seek) => {
      const [idEl, posEl] = kids(out, seek.dataStart, end(seek))
      expect(idEl.id).toBe(ID.SeekID)
      expect(posEl.id).toBe(ID.SeekPosition)
      const target = header(out, seg.dataStart + uint(out, posEl))
      return [uint(out, idEl), target.id]
    })
    expect(targets).toEqual([
      [ID.Info, ID.Info],
      [ID.Tracks, ID.Tracks],
      [ID.Cues, ID.Cues],
    ])
  })

  it('每个以关键帧开头的 Cluster 都有 Cue，位置与时间正确', () => {
    const seg = header(out, end(header(out, 0)))
    const top = kids(out, seg.dataStart, end(seg))
    const clusters = top.filter((el) => el.id === ID.Cluster)
    const expected = clusters.flatMap((cluster) => {
      const children = kids(out, cluster.dataStart, end(cluster))
      const time = uint(out, children.find((el) => el.id === ID.Timecode)!)
      const block = children.find((el) => el.id === ID.SimpleBlock)!
      const relative = (out[block.dataStart + 1] << 8) | out[block.dataStart + 2]
      const keyframe = (out[block.dataStart + 3] & 0x80) !== 0
      return keyframe ? [{ time: time + ((relative << 16) >> 16), position: cluster.start - seg.dataStart }] : []
    })
    expect(expected.length).toBeGreaterThan(1)
    const cues = top.find((el) => el.id === ID.Cues)!
    const actual = kids(out, cues.dataStart, end(cues)).map((point) => {
      const [timeEl, positions] = kids(out, point.dataStart, end(point))
      expect(timeEl.id).toBe(ID.CueTime)
      const pos = kids(out, positions.dataStart, end(positions)).find((el) => el.id === ID.CueClusterPosition)!
      return { time: uint(out, timeEl), position: uint(out, pos) }
    })
    expect(actual).toEqual(expected)
  })

  it('重复收尾（输入已经是点播结构）结果稳定', () => {
    const again = finalizeWebmBytes(out, 2200)
    expect(again).not.toBeNull()
    expect(join(again!)).toEqual(out)
  })
})

describe('finalizeWebm 异常输入', () => {
  it('已知 Segment 或 Cluster 声明长度超过文件时不截短后假报成功', async () => {
    const seg = header(RAW, end(header(RAW, 0)))
    let cluster: El | undefined
    for (let p = seg.dataStart; p < RAW.length;) {
      const el = header(RAW, p)
      if (el.id === ID.Cluster) { cluster = el; break }
      p = end(el)
    }
    expect(cluster).toBeDefined()
    for (const el of [seg, cluster!]) {
      const bytes = RAW.slice()
      // fixture 的长度字段为 8 字节；写入有限但超出文件的长度。
      bytes.set([0x01, 0, 0, 0, 0, 0x10, 0, 0], el.start + 4)
      expect(finalizeWebmBytes(bytes, 2200)).toBeNull()
      const blob = new Blob([bytes])
      expect(await finalizeWebm(blob, 2200)).toEqual({ blob, fallback: true })
    }
  })

  it('非有限值与负录制时长不写入 Duration', async () => {
    for (const duration of [NaN, Infinity, -1]) {
      expect(finalizeWebmBytes(RAW, duration)).toBeNull()
      const blob = new Blob([RAW])
      expect(await finalizeWebm(blob, duration)).toEqual({ blob, fallback: true })
    }
  })

  it('不是 WebM 时返回 null / 原 Blob，并标记为降级', async () => {
    expect(finalizeWebmBytes(new Uint8Array([1, 2, 3, 4]), 1000)).toBeNull()
    expect(finalizeWebmBytes(new Uint8Array(0), 1000)).toBeNull()
    const blob = new Blob([new Uint8Array([0, 0, 0, 0])], { type: 'video/webm' })
    const result = await finalizeWebm(blob, 1000)
    expect(result.blob).toBe(blob)
    expect(result.fallback).toBe(true)
  })

  it('正常文件改写成功，不标记降级', async () => {
    const result = await finalizeWebm(new Blob([RAW], { type: 'video/webm' }), 2200)
    expect(result.fallback).toBe(false)
    expect(result.blob.type).toBe('video/webm')
    expect(result.blob.size).toBeGreaterThan(RAW.length)
  })

  it('任意位置截断：不抛异常，要么返回 null，要么返回结构完整的文件', () => {
    for (let length = 0; length < RAW.length; length += 97) {
      const parts = finalizeWebmBytes(RAW.slice(0, length), 2200)
      if (parts === null) continue
      const out = join(parts)
      const seg = header(out, end(header(out, 0)))
      expect(end(seg)).toBe(out.length)
      walk(out, seg)
    }
  })

  it('随机损坏字节：不抛异常、不挂起', () => {
    let seed = 42
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (let trial = 0; trial < 400; trial++) {
      const bad = RAW.slice()
      for (let k = 0; k < 4; k++) bad[Math.floor(random() * 2000)] = Math.floor(random() * 256)
      expect(() => finalizeWebmBytes(bad, 2200)).not.toThrow()
    }
  })

  it('时间戳元素长度异常（超过 8 字节）时放弃改写而不是挂起', { timeout: 3000 }, () => {
    // 构造：EBML 头 + Segment(未知长度) + Info + Tracks + Cluster{ Timecode(长度 16, 全 0xff) SimpleBlock }
    const ebmlHead = RAW.subarray(0, end(header(RAW, 0)))
    const bytes = join([
      ebmlHead,
      new Uint8Array([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x15, 0x49, 0xa9, 0x66, 0x80]), // Info（空）
      new Uint8Array([0x16, 0x54, 0xae, 0x6b, 0x80]), // Tracks（空）
      new Uint8Array([0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0xe7, 0x40, 0xc8, ...new Array(200).fill(0xff)]), // 200 字节：数值溢出为 Infinity
      new Uint8Array([0xa3, 0x85, 0x81, 0x00, 0x00, 0x80, 0x00]),
    ])
    expect(finalizeWebmBytes(bytes, 1000)).toBeNull()
  })
})
