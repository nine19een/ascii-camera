/**
 * 字符集：预设、查找表和自定义字符梯度校验。
 *
 * 约定：所有字符梯度都按“从暗到亮”排列——第一个字符用于最暗的区域，最后一个用于最亮的区域。
 * 画面是深色背景、亮色字符，所以暗部用稀疏（或空白）字符，亮部用笔画最密集的字符。
 *
 * 注意：Classic 属于 ASCII 字符；Blocks 使用 Unicode 块元素字符（░▒▓█），并不属于 ASCII。
 *
 * 本文件不依赖 DOM，测量字形的函数由调用方传入，便于在 Node 中单独测试。
 */

export type CharsetId = 'classic' | 'blocks' | 'binary' | 'matrix' | 'custom'

export interface CharsetPreset {
  id: Exclude<CharsetId, 'custom'>
  /** 字符梯度（从暗到亮）。sortByInk 为 true 时，除首个空格外的字符会在运行时按实际笔画面积重新排序。 */
  chars: string
  /** 是否按字形笔画面积排序（数字等字符本身没有明确的明暗顺序）。 */
  sortByInk: boolean
  /** 是否包含 ASCII 以外的 Unicode 字符。 */
  unicode: boolean
}

/**
 * Binary 与 Matrix 在给定字符前加了一个空格作为最暗一级：
 * 数字之间的笔画面积差异很小，如果最暗处也填满字符，黑色背景会被字符铺满、人物轮廓难以辨认。
 * 这与 Classic、Blocks 一致（两者都以空格开头）。需要“满屏 0/1”的效果可以用自定义字符梯度输入 “01”。
 */
export const CHARSET_PRESETS: readonly CharsetPreset[] = [
  { id: 'classic', chars: ' .,:-=+*#%@', sortByInk: false, unicode: false },
  { id: 'blocks', chars: ' ░▒▓█', sortByInk: false, unicode: true },
  { id: 'binary', chars: ' 01', sortByInk: true, unicode: false },
  { id: 'matrix', chars: ' 0123456789', sortByInk: true, unicode: false },
]

export const DEFAULT_CHARSET: CharsetId = 'classic'
export const CLASSIC_RAMP = CHARSET_PRESETS[0].chars
/** 兼容第一阶段的名称。 */
export const ASCII_RAMP = CLASSIC_RAMP
export const DEFAULT_CUSTOM_RAMP = ' .-+*#%@'
export const CUSTOM_RAMP_MAX_LENGTH = 64

export function getPreset(id: CharsetId): CharsetPreset | undefined {
  return CHARSET_PRESETS.find((preset) => preset.id === id)
}

/**
 * 按笔画面积从少到多排序；开头的空格保持在第一位。排序是稳定的，面积相同的字符保持原顺序。
 */
export function sortRampByInk(chars: string, inkOf: (char: string) => number): string {
  const list = Array.from(chars)
  const leading = list[0] === ' ' ? [' '] : []
  const rest = list.slice(leading.length)
  const measured = rest.map((char, index) => ({ char, index, ink: inkOf(char) }))
  measured.sort((a, b) => a.ink - b.ink || a.index - b.index)
  return leading.concat(measured.map((item) => item.char)).join('')
}

/**
 * 预先计算 256 级色调 → 字符编码的查找表，避免每帧对每个格子做除法和取字符。
 * 字符梯度中的每个字符都保证是单个 UTF-16 编码单元（见 parseCustomRamp），所以可以直接用 charCode。
 */
export function buildRampLut(ramp: string = CLASSIC_RAMP): Uint16Array {
  const lut = new Uint16Array(256)
  const last = ramp.length - 1
  for (let v = 0; v < 256; v++) {
    const index = Math.min(last, Math.round((v / 255) * last))
    lut[v] = ramp.charCodeAt(index)
  }
  return lut
}

export type RemovedReason = 'control' | 'whitespace' | 'unsupported' | 'duplicate' | 'wide' | 'too-long'

export interface RemovedChar {
  char: string
  reason: RemovedReason
}

export interface RampParseResult {
  /** 有效的字符梯度；少于 2 个有效字符时为 null。 */
  ramp: string | null
  /** 被过滤掉的字符及原因（同一原因的同一字符只记录一次）。 */
  removed: RemovedChar[]
  /** 无法使用时的错误类别（目前只有有效字符不足 2 个）；文字由界面按当前语言生成。 */
  error: 'too-few' | null
}

const CONTROL_RE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u
const WHITESPACE_RE = /\s/u
const COMBINING_RE = /^\p{M}+$/u

function segmentGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), (part) => part.segment)
  }
  return Array.from(text)
}

/**
 * 校验并清理用户输入的字符梯度（从暗到亮）。
 *
 * 规则：
 * - 先做 NFC 规范化，再按“用户感知的字符”（字素）切分。
 * - 过滤换行、制表符等控制字符和格式字符；空格以外的空白字符也过滤。
 * - 只接受单个 UTF-16 编码单元的字符：组合字符序列、表情、扩展区字符会被过滤，保证每个字符正好占一格。
 * - 可选的 isSingleCell 用于过滤等宽字体中不是单个字符宽度的字形（例如中日韩文字）。
 * - 重复字符只保留第一次出现的位置，保持用户给定的顺序。
 * - 最多保留 CUSTOM_RAMP_MAX_LENGTH 个字符。
 * - 至少需要 2 个有效字符。
 */
export function parseCustomRamp(input: string, isSingleCell?: (char: string) => boolean): RampParseResult {
  const removed: RemovedChar[] = []
  const seenRemoved = new Set<string>()
  const remove = (char: string, reason: RemovedReason) => {
    const key = `${reason}:${char}`
    if (seenRemoved.has(key)) return
    seenRemoved.add(key)
    removed.push({ char, reason })
  }

  const accepted: string[] = []
  const seen = new Set<string>()
  for (const grapheme of segmentGraphemes(input.normalize('NFC'))) {
    if (CONTROL_RE.test(grapheme)) {
      remove(grapheme, 'control')
    } else if (grapheme !== ' ' && WHITESPACE_RE.test(grapheme)) {
      remove(grapheme, 'whitespace')
    } else if (grapheme.length !== 1 || COMBINING_RE.test(grapheme)) {
      remove(grapheme, 'unsupported')
    } else if (seen.has(grapheme)) {
      remove(grapheme, 'duplicate')
    } else if (isSingleCell && !isSingleCell(grapheme)) {
      remove(grapheme, 'wide')
    } else if (accepted.length >= CUSTOM_RAMP_MAX_LENGTH) {
      remove(grapheme, 'too-long')
    } else {
      seen.add(grapheme)
      accepted.push(grapheme)
    }
  }

  if (accepted.length < 2) {
    return { ramp: null, removed, error: 'too-few' }
  }
  return { ramp: accepted.join(''), removed, error: null }
}
