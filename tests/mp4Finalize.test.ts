/**
 * mp4Finalize：用 Chrome MediaRecorder 的真实分片 MP4（tests/fixtures/chrome-raw-avc1.mp4）检查改写后的普通 MP4。
 * 用一个独立于被测代码的盒子读取器校验结构、样本表与样本字节。
 *
 * 注意：这份 fixture 在写入本地项目时被文件传输通道自动插入了 C2PA 内容凭证（顶层 uuid 盒子），
 * 其余字节与 Chrome 的原始输出相同。改写时会丢弃这类未知的顶层盒子，因此它同时覆盖了"分片之间夹有其他盒子"的情况。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { finalizeMp4, remuxFragmentedMp4 } from '../src/export/mp4Finalize'

const RAW = new Uint8Array(readFileSync(new URL('./fixtures/chrome-raw-avc1.mp4', import.meta.url)))

interface B {
  type: string
  start: number
  body: number
  end: number
}

const u32 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset).getUint32(o)
const i32 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset).getInt32(o)

function boxes(d: Uint8Array, from: number, to: number): B[] {
  const out: B[] = []
  for (let p = from; p < to; ) {
    let size = u32(d, p)
    const type = String.fromCharCode(...d.subarray(p + 4, p + 8))
    let header = 8
    if (size === 1) {
      size = u32(d, p + 8) * 2 ** 32 + u32(d, p + 12)
      header = 16
    }
    if (size < header || p + size > to) throw new Error(`bad ${type} at ${p}`)
    out.push({ type, start: p, body: p + header, end: p + size })
    p += size
  }
  return out
}
const kids = (d: Uint8Array, b: B) => boxes(d, b.body, b.end)
const one = (list: B[], type: string) => {
  const found = list.filter((b) => b.type === type)
  if (found.length !== 1) throw new Error(`expected one ${type}, got ${found.length}`)
  return found[0]
}
const path = (d: Uint8Array, list: B[], ...types: string[]) =>
  types.reduce((b, type, i) => (i === 0 ? one(list, type) : one(kids(d, b), type)), null as unknown as B)

/** 从分片文件里按 trun 读出全部样本（偏移、大小、时长、是否关键帧）。只支持 fixture 用到的字段组合。 */
function fragmentedSamples(d: Uint8Array) {
  const samples: { offset: number; size: number; duration: number; sync: boolean }[] = []
  for (const moof of boxes(d, 0, d.length).filter((b) => b.type === 'moof')) {
    for (const traf of kids(d, moof).filter((b) => b.type === 'traf')) {
      const tfhd = one(kids(d, traf), 'tfhd')
      expect(u32(d, tfhd.body) & 0xffffff).toBe(0x020020) // default-base-is-moof + default-sample-flags
      const defaultFlags = u32(d, tfhd.body + 8)
      for (const trun of kids(d, traf).filter((b) => b.type === 'trun')) {
        const flags = u32(d, trun.body) & 0xffffff
        expect(flags).toBe(0x305) // data-offset, first-sample-flags, duration, size
        const count = u32(d, trun.body + 4)
        let cursor = moof.start + i32(d, trun.body + 8)
        const firstFlags = u32(d, trun.body + 12)
        let p = trun.body + 16
        for (let i = 0; i < count; i++) {
          const duration = u32(d, p)
          const size = u32(d, p + 4)
          p += 8
          const sampleFlags = i === 0 ? firstFlags : defaultFlags
          samples.push({ offset: cursor, size, duration, sync: !(sampleFlags & 0x10000) })
          cursor += size
        }
      }
    }
  }
  return samples
}

async function finalized(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const { blob, fallback } = await finalizeMp4(new Blob([bytes], { type: 'video/mp4' }))
  expect(fallback).toBe(false)
  return new Uint8Array(await blob.arrayBuffer())
}

describe('remuxFragmentedMp4（Chrome H.264 分片输出）', async () => {
  const input = fragmentedSamples(RAW)
  const out = await finalized(RAW)
  const top = boxes(out, 0, out.length)

  it('fixture 是分片结构：moov 带 mvex、时长为 0，后面是多个 moof / mdat', () => {
    const rawTop = boxes(RAW, 0, RAW.length)
    expect(rawTop.filter((b) => b.type === 'moof').length).toBeGreaterThan(1)
    expect(rawTop.filter((b) => !['ftyp', 'moov', 'moof', 'mdat', 'uuid'].includes(b.type))).toEqual([])
    expect(kids(RAW, one(rawTop, 'moov')).some((b) => b.type === 'mvex')).toBe(true)
    expect(input.length).toBeGreaterThan(30)
  })

  it('输出只有 ftyp | moov | mdat，长度恰好铺满文件，不再含分片盒子', () => {
    expect(top.map((b) => b.type)).toEqual(['ftyp', 'moov', 'mdat'])
    expect(top[top.length - 1].end).toBe(out.length)
    const moovKids = kids(out, top[1]).map((b) => b.type)
    expect(moovKids).toEqual(['mvhd', 'trak'])
    const brands = String.fromCharCode(...out.subarray(top[0].body, top[0].end))
    expect(brands).not.toMatch(/iso5|iso6|dash/)
  })

  it('样本表与原始样本逐一对应，样本字节完全不变', () => {
    const stbl = path(out, top, 'moov', 'trak', 'mdia', 'minf', 'stbl')
    const stblKids = kids(out, stbl)
    const stsz = one(stblKids, 'stsz')
    expect(u32(out, stsz.body + 4)).toBe(0) // 每个样本单独给出大小
    const count = u32(out, stsz.body + 8)
    expect(count).toBe(input.length)
    const sizes = Array.from({ length: count }, (_, i) => u32(out, stsz.body + 12 + i * 4))
    expect(sizes).toEqual(input.map((s) => s.size))

    // stsc + stco 还原每个样本在新文件中的位置
    const stsc = one(stblKids, 'stsc')
    const stco = one(stblKids, 'stco')
    const runs = Array.from({ length: u32(out, stsc.body + 4) }, (_, i) => ({
      first: u32(out, stsc.body + 8 + i * 12),
      per: u32(out, stsc.body + 12 + i * 12),
    }))
    const chunkOffsets = Array.from({ length: u32(out, stco.body + 4) }, (_, i) => u32(out, stco.body + 8 + i * 4))
    const mdat = top[2]
    let sample = 0
    chunkOffsets.forEach((offset, chunk) => {
      const run = runs.filter((r) => r.first <= chunk + 1).pop()!
      let cursor = offset
      for (let k = 0; k < run.per; k++, sample++) {
        expect(cursor).toBeGreaterThanOrEqual(mdat.body)
        expect(cursor + sizes[sample]).toBeLessThanOrEqual(mdat.end)
        const src = input[sample]
        expect(out.subarray(cursor, cursor + src.size)).toEqual(RAW.subarray(src.offset, src.offset + src.size))
        cursor += sizes[sample]
      }
    })
    expect(sample).toBe(count)
  })

  it('时长、时间表与关键帧索引正确', () => {
    const trak = path(out, top, 'moov', 'trak')
    const mdia = one(kids(out, trak), 'mdia')
    const mdhd = one(kids(out, mdia), 'mdhd')
    const timescale = u32(out, mdhd.body + 12)
    const mediaDuration = u32(out, mdhd.body + 16)
    const stblKids = kids(out, path(out, top, 'moov', 'trak', 'mdia', 'minf', 'stbl'))
    const stts = one(stblKids, 'stts')
    let total = 0
    let samples = 0
    for (let i = 0, n = u32(out, stts.body + 4); i < n; i++) {
      const c = u32(out, stts.body + 8 + i * 8)
      const delta = u32(out, stts.body + 12 + i * 8)
      expect(delta).toBeGreaterThan(0)
      total += c * delta
      samples += c
    }
    expect(samples).toBe(input.length)
    expect(total).toBe(mediaDuration)
    expect(mediaDuration / timescale).toBeGreaterThan(2)
    const mvhd = path(out, top, 'moov', 'mvhd')
    expect(u32(out, mvhd.body + 16)).toBe(Math.round((mediaDuration * u32(out, mvhd.body + 12)) / timescale))

    const stss = stblKids.find((b) => b.type === 'stss')
    const expectedSync = input.flatMap((s, i) => (s.sync ? [i + 1] : []))
    expect(expectedSync[0]).toBe(1)
    expect(expectedSync.length).toBeGreaterThan(1)
    expect(stss).toBeDefined()
    const sync = Array.from({ length: u32(out, stss!.body + 4) }, (_, i) => u32(out, stss!.body + 8 + i * 4))
    expect(sync).toEqual(expectedSync)
  })

  it('已经是普通 MP4 时不再改写（原样返回同一个 Blob，不算降级）', async () => {
    expect(await remuxFragmentedMp4(out.length, async (s, e) => out.slice(s, e))).toBeNull()
    const blob = new Blob([out], { type: 'video/mp4' })
    const result = await finalizeMp4(blob)
    expect(result.blob).toBe(blob)
    expect(result.fallback).toBe(false)
  })
})

describe('finalizeMp4 异常输入', () => {
  const firstMoof = one(boxes(RAW, 0, RAW.length).filter((b) => b.type === 'moof').slice(0, 1), 'moof')
  const firstTrun = path(RAW, kids(RAW, firstMoof), 'traf', 'trun')
  const mutate = (offset: number, value: number) => {
    const bytes = RAW.slice()
    new DataView(bytes.buffer).setUint32(offset, value)
    return bytes
  }

  it('样本偏移落在文件头、moof 或跨过 mdat 边界时必须保留原文件', async () => {
    const mdat = boxes(RAW, 0, RAW.length).find((b) => b.type === 'mdat')!
    for (const offset of [0, firstMoof.start, mdat.end - 1]) {
      const bytes = mutate(firstTrun.body + 8, offset - firstMoof.start)
      const blob = new Blob([bytes], { type: 'video/mp4' })
      const result = await finalizeMp4(blob)
      expect(result.fallback).toBe(true)
      expect(result.blob).toBe(blob)
    }
  })

  it('样本计数超过 trun 载荷时立即降级，不按损坏计数循环', async () => {
    const blob = new Blob([mutate(firstTrun.body + 4, 0xffff_ffff)])
    expect(await finalizeMp4(blob)).toEqual({ blob, fallback: true })
  })

  it('零长度样本与超出 32 位写出范围的总时长不会被报告为改写成功', async () => {
    for (const bytes of [mutate(firstTrun.body + 20, 0), mutate(firstTrun.body + 16, 0xffff_ffff)]) {
      const blob = new Blob([bytes])
      expect(await finalizeMp4(blob)).toEqual({ blob, fallback: true })
    }
  })

  it('不精确的 64 位盒长安全降级', async () => {
    const bytes = RAW.slice()
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 1)
    view.setUint32(8, 0x20_0000)
    view.setUint32(12, 1)
    const blob = new Blob([bytes])
    expect(await finalizeMp4(blob)).toEqual({ blob, fallback: true })
  })

  it('不是 MP4 或任意位置截断时，原样返回原 Blob（不抛异常）', async () => {
    for (const bytes of [new Uint8Array(0), new Uint8Array([1, 2, 3]), new Uint8Array(64)]) {
      const blob = new Blob([bytes])
      expect((await finalizeMp4(blob)).blob).toBe(blob)
    }
    for (let length = 1; length < RAW.length; length += 211) {
      const blob = new Blob([RAW.slice(0, length)], { type: 'video/mp4' })
      const result = await finalizeMp4(blob)
      // 降级时必须原样返回；改写成功时结构必须完整
      if (result.fallback) expect(result.blob).toBe(blob)
      else if (result.blob !== blob)
        expect(boxes(new Uint8Array(await result.blob.arrayBuffer()), 0, result.blob.size).map((b) => b.type)).toEqual(['ftyp', 'moov', 'mdat'])
    }
  })

  it('结构损坏（例如最后一段数据被截断）时标记为降级，交付原始文件', async () => {
    for (const bytes of [new Uint8Array([1, 2, 3]), RAW.slice(0, RAW.length - 100)]) {
      const blob = new Blob([bytes], { type: 'video/mp4' })
      const result = await finalizeMp4(blob)
      expect(result.fallback).toBe(true)
      expect(result.blob).toBe(blob)
    }
  })
})
