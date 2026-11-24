/**
 * MP4 收尾封装：把 MediaRecorder 输出的分片 MP4（fMP4）改写成普通的点播 MP4，只改容器、不重新编码。
 *
 * Chrome / Edge 的 MediaRecorder 录 MP4 时写的是分片结构：
 *   ftyp | moov(时长 0，样本表为空，带 mvex) | moof mdat | moof mdat | …
 * 浏览器能播，但时长写的是 0，样本索引分散在各个 moof 里。手机相册、系统播放器对这种文件的支持参差不齐
 * （显示不出时长、不能拖动，或者干脆不认）。
 *
 * 这里按普通 MP4 的方式重新组织（与相机拍摄的文件结构相同，moov 在前，便于边下边播）：
 *   ftyp | moov { mvhd(时长) | trak { tkhd | [edts] | mdia { mdhd | hdlr | minf { vmhd | dinf | stbl } } } } | mdat
 * stbl 由各 moof 的样本信息汇总而成：stsd 原样保留，另生成 stts（时长）、ctts（显示时间偏移，如有）、
 * stss（关键帧，供拖动定位）、stsz（大小）、stsc / stco（数据位置）。
 * 样本数据不读进内存，直接引用原文件的对应片段组成新文件。
 *
 * 只处理单条视频轨道的分片文件；已经是普通 MP4（例如 Safari 的输出）或结构无法识别时返回 null，
 * 调用方保留原始文件。
 */

interface Box {
  type: string
  start: number
  headerSize: number
  size: number
}

interface TrackDefaults {
  trackId: number
  sampleDescriptionIndex: number
  duration: number
  size: number
  flags: number
}

interface Sample {
  offset: number
  size: number
  duration: number
  /** 显示时间偏移（ctts），可为负 */
  cto: number
  sync: boolean
}

interface Chunk {
  offset: number
  size: number
  samples: number
}

interface ParsedMovie {
  ftypBrands: string[]
  trackId: number
  timescale: number
  language: number
  width: number
  height: number
  hdlr: Uint8Array<ArrayBuffer>
  vmhd: Uint8Array<ArrayBuffer>
  dinf: Uint8Array<ArrayBuffer>
  stsd: Uint8Array<ArrayBuffer>
  sampleEntry: string
  defaults: TrackDefaults
}

type ReadFn = (start: number, end: number) => Promise<Uint8Array<ArrayBuffer>>

class Mp4FormatError extends Error {}

function fail(message: string): never {
  throw new Mp4FormatError(message)
}

// ---------------------------------------------------------------------------
// 读取

function u32(d: Uint8Array, o: number): number {
  return ((d[o] << 24) >>> 0) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3]
}

function i32(d: Uint8Array, o: number): number {
  return (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]
}

function u64(d: Uint8Array, o: number): number {
  return u32(d, o) * 0x1_0000_0000 + u32(d, o + 4)
}

function u16(d: Uint8Array, o: number): number {
  return (d[o] << 8) | d[o + 1]
}

function fourcc(d: Uint8Array, o: number): string {
  return String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3])
}

/** 解析 [start, end) 范围内一个盒子的头；end 是父容器的结束位置。 */
function parseHeader(d: Uint8Array, at: number, base: number, end: number): Box {
  if (at + 8 > d.length) fail('truncated box header')
  let size = u32(d, at)
  const type = fourcc(d, at + 4)
  let headerSize = 8
  if (size === 1) {
    if (at + 16 > d.length) fail('truncated largesize')
    size = u64(d, at + 8)
    headerSize = 16
  } else if (size === 0) {
    size = end - (base + at)
  }
  if (!Number.isSafeInteger(size) || size < headerSize || !Number.isSafeInteger(base + at + size) || base + at + size > end) fail(`bad size for ${type}`)
  return { type, start: base + at, headerSize, size }
}

/** 列出 d 中 [from, to) 的子盒子；d 的第 0 字节对应文件位置 base。 */
function children(d: Uint8Array, from: number, to: number, base = 0): Box[] {
  const out: Box[] = []
  let at = from
  while (at < to) {
    const box = parseHeader(d, at, base, base + to)
    out.push(box)
    at += box.size
  }
  return out
}

function find(boxes: Box[], type: string): Box {
  const found = boxes.find((b) => b.type === type)
  if (!found) fail(`missing ${type}`)
  return found
}

function body(box: Box, base = 0): [number, number] {
  return [box.start - base + box.headerSize, box.start - base + box.size]
}

/** 固定字段不得越过所属盒子；不猜测不支持的扩展头结构。 */
function requirePayload(box: Box, length: number): void {
  if (box.headerSize !== 8 || box.size < 8 + length) fail(`truncated or unsupported ${box.type}`)
}

function slice(d: Uint8Array<ArrayBuffer>, box: Box, base = 0): Uint8Array<ArrayBuffer> {
  return d.slice(box.start - base, box.start - base + box.size)
}

function parseMovie(moov: Uint8Array<ArrayBuffer>, moovStart: number, ftyp: Uint8Array | null): ParsedMovie {
  const base = moovStart
  const top = children(moov, 8, moov.length, base)
  const traks = top.filter((b) => b.type === 'trak')
  if (traks.length !== 1) fail('expected exactly one track')
  const trak = traks[0]
  const trakKids = children(moov, ...body(trak, base), base)
  const tkhd = find(trakKids, 'tkhd')
  requirePayload(tkhd, 4)
  const tk = tkhd.start - base
  const tkVersion = moov[tk + 8]
  if (tkVersion > 1) fail('unsupported tkhd version')
  requirePayload(tkhd, tkVersion === 1 ? 96 : 84)
  const trackId = u32(moov, tk + (tkVersion === 1 ? 28 : 20))
  const tkTail = tk + tkhd.size
  const width = u32(moov, tkTail - 8)
  const height = u32(moov, tkTail - 4)

  const mdia = find(trakKids, 'mdia')
  const mdiaKids = children(moov, ...body(mdia, base), base)
  const mdhd = find(mdiaKids, 'mdhd')
  requirePayload(mdhd, 4)
  const md = mdhd.start - base
  const mdVersion = moov[md + 8]
  if (mdVersion > 1) fail('unsupported mdhd version')
  requirePayload(mdhd, mdVersion === 1 ? 36 : 24)
  const timescale = u32(moov, md + (mdVersion === 1 ? 28 : 20))
  const language = u16(moov, md + (mdVersion === 1 ? 40 : 28))
  if (!timescale) fail('zero timescale')
  const hdlr = find(mdiaKids, 'hdlr')
  requirePayload(hdlr, 12)
  const handler = fourcc(moov, hdlr.start - base + 16)
  if (handler !== 'vide') fail('not a video track')
  const minf = find(mdiaKids, 'minf')
  const minfKids = children(moov, ...body(minf, base), base)
  const vmhd = find(minfKids, 'vmhd')
  const dinf = find(minfKids, 'dinf')
  const stbl = find(minfKids, 'stbl')
  const stblKids = children(moov, ...body(stbl, base), base)
  const stsd = find(stblKids, 'stsd')
  requirePayload(stsd, 16)
  if (u32(moov, stsd.start - base + 12) !== 1) fail('expected one sample description')
  const sampleEntry = fourcc(moov, stsd.start - base + 20)

  // 没有 mvex 说明不是分片文件；调用方看到没有 moof 时会原样返回
  const mvex = top.find((b) => b.type === 'mvex')
  const trex = (mvex ? children(moov, ...body(mvex, base), base) : []).find(
    (b) => b.type === 'trex' && u32(moov, b.start - base + 12) === trackId,
  )
  const t = trex ? trex.start - base : -1
  if (trex) requirePayload(trex, 24)
  const defaults: TrackDefaults = trex
    ? {
        trackId,
        sampleDescriptionIndex: u32(moov, t + 16),
        duration: u32(moov, t + 20),
        size: u32(moov, t + 24),
        flags: u32(moov, t + 28),
      }
    : { trackId, sampleDescriptionIndex: 1, duration: 0, size: 0, flags: 0 }

  const ftypBrands: string[] = []
  if (ftyp) for (let o = 16; o + 4 <= ftyp.length; o += 4) ftypBrands.push(fourcc(ftyp, o))

  return {
    ftypBrands,
    trackId,
    timescale,
    language,
    width,
    height,
    hdlr: slice(moov, hdlr, base),
    vmhd: slice(moov, vmhd, base),
    dinf: slice(moov, dinf, base),
    stsd: slice(moov, stsd, base),
    sampleEntry,
    defaults,
  }
}

const SAMPLE_NON_SYNC = 0x0001_0000

/** 解析一个 moof，追加样本；返回该片段的 baseMediaDecodeTime（没有 tfdt 时为 null）。 */
function parseFragment(moof: Uint8Array, moofStart: number, movie: ParsedMovie, samples: Sample[], fileSize: number): number | null {
  const base = moofStart
  let decodeTime: number | null = null
  for (const traf of children(moof, 8, moof.length, base).filter((b) => b.type === 'traf')) {
    const kids = children(moof, ...body(traf, base), base)
    const tfhd = find(kids, 'tfhd')
    requirePayload(tfhd, 8)
    let o = tfhd.start - base + 8
    const tfFlags = u32(moof, o) & 0xffffff
    requirePayload(tfhd, 8 + (tfFlags & 0x1 ? 8 : 0) + (tfFlags & 0x2 ? 4 : 0) +
      (tfFlags & 0x8 ? 4 : 0) + (tfFlags & 0x10 ? 4 : 0) + (tfFlags & 0x20 ? 4 : 0))
    o += 4
    const trackId = u32(moof, o)
    o += 4
    if (trackId !== movie.trackId) continue
    let baseOffset = moofStart
    if (tfFlags & 0x1) {
      baseOffset = u64(moof, o)
      o += 8
    }
    const description = tfFlags & 0x2 ? u32(moof, o) : movie.defaults.sampleDescriptionIndex
    if (description !== 1) fail('unsupported sample description')
    if (tfFlags & 0x2) o += 4
    let defDuration = movie.defaults.duration
    let defSize = movie.defaults.size
    let defFlags = movie.defaults.flags
    if (tfFlags & 0x8) {
      defDuration = u32(moof, o)
      o += 4
    }
    if (tfFlags & 0x10) {
      defSize = u32(moof, o)
      o += 4
    }
    if (tfFlags & 0x20) {
      defFlags = u32(moof, o)
      o += 4
    }

    const tfdt = kids.find((b) => b.type === 'tfdt')
    if (tfdt) {
      requirePayload(tfdt, 4)
      const p = tfdt.start - base + 8
      if (moof[p] > 1) fail('unsupported tfdt version')
      requirePayload(tfdt, moof[p] === 1 ? 12 : 8)
      decodeTime = moof[p] === 1 ? u64(moof, p + 4) : u32(moof, p + 4)
    }

    let dataCursor = baseOffset
    for (const trun of kids.filter((b) => b.type === 'trun')) {
      requirePayload(trun, 8)
      let p = trun.start - base + 8
      const version = moof[p]
      const flags = u32(moof, p) & 0xffffff
      p += 4
      const count = u32(moof, p)
      p += 4
      if (version > 1) fail('unsupported trun version')
      const entryBytes = ((flags & 0x100 ? 1 : 0) + (flags & 0x200 ? 1 : 0) +
        (flags & 0x400 ? 1 : 0) + (flags & 0x800 ? 1 : 0)) * 4
      requirePayload(trun, 8 + (flags & 0x1 ? 4 : 0) + (flags & 0x4 ? 4 : 0) + count * entryBytes)
      // 无逐样本字段时也限制计数：非空样本不能比整个文件的字节数还多。
      if (count > fileSize) fail('excessive sample count')
      if (flags & 0x1) {
        dataCursor = baseOffset + i32(moof, p)
        p += 4
      }
      let firstFlags: number | null = null
      if (flags & 0x4) {
        firstFlags = u32(moof, p)
        p += 4
      }
      for (let i = 0; i < count; i++) {
        let duration = defDuration
        let size = defSize
        let sampleFlags = i === 0 && firstFlags !== null ? firstFlags : defFlags
        let cto = 0
        if (flags & 0x100) {
          duration = u32(moof, p)
          p += 4
        }
        if (flags & 0x200) {
          size = u32(moof, p)
          p += 4
        }
        if (flags & 0x400) {
          const f = u32(moof, p)
          p += 4
          if (!(i === 0 && firstFlags !== null)) sampleFlags = f
        }
        if (flags & 0x800) {
          cto = version === 0 ? u32(moof, p) : i32(moof, p)
          p += 4
        }
        if (p > trun.start - base + trun.size) fail('trun overrun')
        samples.push({ offset: dataCursor, size, duration, cto, sync: !(sampleFlags & SAMPLE_NON_SYNC) })
        dataCursor += size
      }
    }
  }
  return decodeTime
}

// ---------------------------------------------------------------------------
// 写出

class Writer {
  private parts: number[] = []

  u8(v: number) {
    this.parts.push(v & 0xff)
    return this
  }
  u16(v: number) {
    return this.u8(v >>> 8).u8(v)
  }
  u32(v: number) {
    return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v)
  }
  i32(v: number) {
    return this.u32(v >>> 0)
  }
  u64(v: number) {
    return this.u32(Math.floor(v / 0x1_0000_0000)).u32(v >>> 0)
  }
  str(s: string) {
    for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i))
    return this
  }
  bytes(b: Uint8Array) {
    for (const v of b) this.parts.push(v)
    return this
  }
  zeros(n: number) {
    for (let i = 0; i < n; i++) this.parts.push(0)
    return this
  }
  done(): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(this.parts)
  }
}

function box(type: string, ...content: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const size = 8 + content.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(size)
  const w = new Writer().u32(size).str(type).done()
  out.set(w, 0)
  let at = 8
  for (const c of content) {
    out.set(c, at)
    at += c.length
  }
  return out
}

function fullBox(type: string, version: number, flags: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = new Writer().u8(version).u8(flags >>> 16).u8(flags >>> 8).u8(flags).done()
  return box(type, head, payload)
}

const MATRIX = [0x0001_0000, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000]

function writeMatrix(w: Writer) {
  for (const v of MATRIX) w.u32(v)
}

function buildMoov(movie: ParsedMovie, samples: Sample[], chunks: Chunk[], chunkOffsets: number[], use64: boolean) {
  const mediaDuration = samples.reduce((n, s) => n + s.duration, 0)
  const movieTimescale = 1000
  const movieDuration = Math.round((mediaDuration * movieTimescale) / movie.timescale)
  // 当前写出 version 0 时长字段；超出范围时保留原始文件，避免截断为错误时长。
  if (!Number.isSafeInteger(mediaDuration) || mediaDuration <= 0 || mediaDuration > 0xffff_ffff || movieDuration > 0xffff_ffff) {
    fail('duration outside version 0 range')
  }

  const mvhd = new Writer().u32(0).u32(0).u32(movieTimescale).u32(movieDuration).u32(0x0001_0000).u16(0x0100).zeros(10)
  writeMatrix(mvhd)
  mvhd.zeros(24).u32(movie.trackId + 1)

  const tkhd = new Writer().u32(0).u32(0).u32(movie.trackId).u32(0).u32(movieDuration).zeros(8).u16(0).u16(0).u16(0).u16(0)
  writeMatrix(tkhd)
  tkhd.u32(movie.width).u32(movie.height)

  // 显示时间偏移：最小偏移不为 0 时用编辑列表让第一帧从 0 开始显示
  const minCto = samples.reduce((n, s) => Math.min(n, s.cto), Infinity)
  const hasCto = samples.some((s) => s.cto !== 0)
  const edts =
    hasCto && minCto > 0
      ? box('edts', fullBox('elst', 0, 0, new Writer().u32(1).u32(movieDuration).i32(minCto).u16(1).u16(0).done()))
      : null

  const mdhd = new Writer().u32(0).u32(0).u32(movie.timescale).u32(mediaDuration).u16(movie.language).u16(0)

  // stts：连续相同时长合并
  const stts: [number, number][] = []
  for (const s of samples) {
    const last = stts[stts.length - 1]
    if (last && last[1] === s.duration) last[0]++
    else stts.push([1, s.duration])
  }
  const sttsW = new Writer().u32(stts.length)
  for (const [count, delta] of stts) sttsW.u32(count).u32(delta)

  let ctts: Uint8Array<ArrayBuffer> | null = null
  if (hasCto) {
    const runs: [number, number][] = []
    for (const s of samples) {
      const last = runs[runs.length - 1]
      if (last && last[1] === s.cto) last[0]++
      else runs.push([1, s.cto])
    }
    const negative = minCto < 0
    const w = new Writer().u32(runs.length)
    for (const [count, off] of runs) w.u32(count).i32(off)
    ctts = fullBox('ctts', negative ? 1 : 0, 0, w.done())
  }

  // stss：全部是关键帧时省略（规范含义即"全部可定位"）
  let stss: Uint8Array<ArrayBuffer> | null = null
  if (samples.some((s) => !s.sync)) {
    const sync = samples.flatMap((s, i) => (s.sync ? [i + 1] : []))
    const w = new Writer().u32(sync.length)
    for (const n of sync) w.u32(n)
    stss = fullBox('stss', 0, 0, w.done())
  }

  const stszW = new Writer().u32(0).u32(samples.length)
  for (const s of samples) stszW.u32(s.size)

  const stsc: [number, number][] = []
  chunks.forEach((c, i) => {
    const last = stsc[stsc.length - 1]
    if (!last || last[1] !== c.samples) stsc.push([i + 1, c.samples])
  })
  const stscW = new Writer().u32(stsc.length)
  for (const [first, per] of stsc) stscW.u32(first).u32(per).u32(1)

  const stcoW = new Writer().u32(chunkOffsets.length)
  for (const off of chunkOffsets) {
    if (use64) stcoW.u64(off)
    else stcoW.u32(off)
  }

  const stbl = box(
    'stbl',
    movie.stsd,
    fullBox('stts', 0, 0, sttsW.done()),
    ...(ctts ? [ctts] : []),
    ...(stss ? [stss] : []),
    fullBox('stsz', 0, 0, stszW.done()),
    fullBox('stsc', 0, 0, stscW.done()),
    fullBox(use64 ? 'co64' : 'stco', 0, 0, stcoW.done()),
  )
  const minf = box('minf', movie.vmhd, movie.dinf, stbl)
  const mdia = box('mdia', fullBox('mdhd', 0, 0, mdhd.done()), movie.hdlr, minf)
  const trak = box('trak', fullBox('tkhd', 0, 0x3, tkhd.done()), ...(edts ? [edts] : []), mdia)
  return { moov: box('moov', fullBox('mvhd', 0, 0, mvhd.done()), trak), mediaDuration }
}

function buildFtyp(movie: ParsedMovie): Uint8Array<ArrayBuffer> {
  // 普通（非分片）MP4 的品牌：去掉 iso5/iso6/dash 等分片专用品牌
  const brands = ['isom', 'iso2', movie.sampleEntry === 'avc1' || movie.sampleEntry === 'avc3' ? 'avc1' : '', 'mp41']
    .filter(Boolean)
  const w = new Writer().str('isom').u32(0x200)
  for (const b of brands) w.str(b)
  return box('ftyp', w.done())
}

// ---------------------------------------------------------------------------

/**
 * 用 read(start, end) 读取原文件，返回新文件的组成部分（字节块 + 原文件中的样本数据区间）。
 * 不是分片 MP4 时返回 null。
 */
export async function remuxFragmentedMp4(
  fileSize: number,
  read: ReadFn,
): Promise<{ head: Uint8Array<ArrayBuffer>; ranges: [number, number][]; samples: number; durationSec: number } | null> {
  let ftyp: Uint8Array<ArrayBuffer> | null = null
  let movie: ParsedMovie | null = null
  const samples: Sample[] = []
  let fragments = 0
  let decodeCursor: number | null = null
  const mediaRanges: [number, number][] = []
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) fail('invalid file size')

  let at = 0
  while (at < fileSize) {
    const head = await read(at, Math.min(fileSize, at + 16))
    const hdr = parseHeader(head, 0, at, fileSize)
    if (hdr.type === 'ftyp') ftyp = await read(at, at + hdr.size)
    else if (hdr.type === 'moov') movie = parseMovie(await read(at, at + hdr.size), at, ftyp)
    else if (hdr.type === 'moof') {
      if (!movie) fail('moof before moov')
      const before = samples.length
      const tfdt = parseFragment(await read(at, at + hdr.size), at, movie, samples, fileSize)
      if (tfdt !== null && !Number.isSafeInteger(tfdt)) fail('invalid decode time')
      // 片段的解码时间与累计时长不一致（中间有空档或重叠）时，修正上一片段最后一帧的时长
      if (tfdt !== null && decodeCursor !== null && before > 0 && tfdt !== decodeCursor) {
        const prev = samples[before - 1]
        const fixed = prev.duration + (tfdt - decodeCursor)
        if (fixed > 0) prev.duration = fixed
      }
      decodeCursor = (tfdt ?? decodeCursor ?? 0) + samples.slice(before).reduce((n, s) => n + s.duration, 0)
      fragments++
    } else if (hdr.type === 'mdat') mediaRanges.push([at + hdr.headerSize, at + hdr.size])
    at += hdr.size
  }
  if (!movie || fragments === 0) return null
  const m = movie
  if (samples.length === 0) fail('no samples')
  for (const s of samples) {
    if (!Number.isSafeInteger(s.offset) || !Number.isSafeInteger(s.size) || s.size <= 0 ||
      !Number.isSafeInteger(s.duration) || s.duration < 0 || !Number.isSafeInteger(s.cto) ||
      !mediaRanges.some(([start, end]) => s.offset >= start && s.offset + s.size <= end)) {
      fail('invalid sample or sample outside mdat')
    }
  }
  // 最后一帧时长为 0 时沿用前一帧的时长
  const last = samples[samples.length - 1]
  if (last.duration === 0 && samples.length > 1) last.duration = samples[samples.length - 2].duration
  if (samples.some((s) => s.duration <= 0)) fail('non-positive sample duration')

  // 连续存放的样本合并成一个 chunk
  const chunks: Chunk[] = []
  for (const s of samples) {
    const c = chunks[chunks.length - 1]
    if (c && c.offset + c.size === s.offset) {
      c.size += s.size
      c.samples++
    } else chunks.push({ offset: s.offset, size: s.size, samples: 1 })
  }
  const payload = chunks.reduce((n, c) => n + c.size, 0)

  const ftypOut = buildFtyp(m)
  const mdatLarge = payload + 8 > 0xffff_ffff
  const mdatHeaderSize = mdatLarge ? 16 : 8
  // 先按 32 位偏移试算 moov 大小，再确定 chunk 在新文件中的位置
  const layout = (use64: boolean) => {
    const placeholder = buildMoov(m, samples, chunks, chunks.map(() => 0), use64).moov
    const dataStart = ftypOut.length + placeholder.length + mdatHeaderSize
    let cursor = dataStart
    const offsets = chunks.map((c) => {
      const o = cursor
      cursor += c.size
      return o
    })
    return { offsets, end: cursor }
  }
  let use64 = false
  let { offsets, end } = layout(false)
  if (end > 0xffff_ffff) {
    use64 = true
    ;({ offsets, end } = layout(true))
  }
  const { moov, mediaDuration } = buildMoov(m, samples, chunks, offsets, use64)
  const mdatHead = new Writer()
  if (mdatLarge) mdatHead.u32(1).str('mdat').u64(payload + 16)
  else mdatHead.u32(payload + 8).str('mdat')

  const headParts = [ftypOut, moov, mdatHead.done()]
  const headBytes = new Uint8Array(headParts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of headParts) {
    headBytes.set(p, o)
    o += p.length
  }
  void end
  return {
    head: headBytes,
    ranges: chunks.map((c) => [c.offset, c.offset + c.size]),
    samples: samples.length,
    durationSec: mediaDuration / m.timescale,
  }
}

/**
 * 浏览器入口：把分片 MP4 Blob 改写为普通 MP4。
 * 不需要改写（已是普通 MP4）时原样返回，fallback 为 false；结构无法识别时原样返回，fallback 为 true。
 */
export async function finalizeMp4(blob: Blob): Promise<{ blob: Blob; fallback: boolean }> {
  const read: ReadFn = async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer())
  try {
    const result = await remuxFragmentedMp4(blob.size, read)
    if (!result) return { blob, fallback: false }
    return {
      blob: new Blob([result.head, ...result.ranges.map(([s, e]) => blob.slice(s, e))], { type: 'video/mp4' }),
      fallback: false,
    }
  } catch (error) {
    if (error instanceof Mp4FormatError) return { blob, fallback: true }
    throw error
  }
}
