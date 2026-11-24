import { CLASSIC_RAMP, getPreset, sortRampByInk, type CharsetId } from './charset'
import { measureInk } from './glyphMetrics'

/** 预设字符集按笔画面积排序的结果只需计算一次。 */
const presetRampCache = new Map<CharsetId, string>()

/** 预设字符集的实际字符梯度（Binary / Matrix 按当前字体的笔画面积排序）。 */
export function resolvePresetRamp(id: CharsetId): string {
  const preset = getPreset(id)
  if (!preset) return CLASSIC_RAMP
  if (!preset.sortByInk) return preset.chars
  let ramp = presetRampCache.get(id)
  if (!ramp) {
    ramp = sortRampByInk(preset.chars, measureInk)
    presetRampCache.set(id, ramp)
  }
  return ramp
}
