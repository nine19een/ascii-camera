import type { CSSProperties } from 'react'
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  COLUMNS_MAX,
  COLUMNS_MIN,
  COLUMNS_STEP,
  CONTRAST_MAX,
  CONTRAST_MIN,
} from '../ascii/settings'
import { useI18n } from '../i18n/context'

interface ImageControlsProps {
  columns: number
  brightness: number
  contrast: number
  onColumnsChange: (value: number) => void
  onBrightnessChange: (value: number) => void
  onContrastChange: (value: number) => void
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

/** 画面调整：字符密度、亮度、对比度。整条可拖动，键盘左右键微调。 */
export function ImageControls(props: ImageControlsProps) {
  const { m } = useI18n()
  return (
    <div className="control-stack bar-sliders">
      <BarSlider
        label={m.adjustments.density}
        value={props.columns}
        min={COLUMNS_MIN}
        max={COLUMNS_MAX}
        step={COLUMNS_STEP}
        display={m.adjustments.columns({ value: props.columns })}
        onChange={props.onColumnsChange}
      />
      <BarSlider
        label={m.adjustments.brightness}
        value={props.brightness}
        min={BRIGHTNESS_MIN}
        max={BRIGHTNESS_MAX}
        origin={0}
        display={formatSigned(props.brightness)}
        onChange={props.onBrightnessChange}
      />
      <BarSlider
        label={m.adjustments.contrast}
        value={props.contrast}
        min={CONTRAST_MIN}
        max={CONTRAST_MAX}
        origin={100}
        display={`${props.contrast}%`}
        onChange={props.onContrastChange}
      />
    </div>
  )
}

interface BarSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** 有中性值时从中性值向两侧填充（亮度 0、对比度 100%） */
  origin?: number
  display: string
  onChange: (value: number) => void
}

/** 条形滑杆：原生 range 覆盖整条，名称与数值写在条内。 */
function BarSlider({ label, value, min, max, step = 1, origin, display, onChange }: BarSliderProps) {
  const at = (v: number) => ((v - min) / (max - min)) * 100
  const from = origin === undefined ? 0 : at(origin)
  const to = at(value)
  const style = {
    '--fill-start': `${Math.min(from, to)}%`,
    '--fill-size': `${Math.abs(to - from)}%`,
    '--origin': origin === undefined ? undefined : `${from}%`,
  } as CSSProperties
  return (
    <label className="bar-slider" style={style} data-centered={origin !== undefined || undefined}>
      <span className="bar-fill" aria-hidden="true" />
      {origin !== undefined && <span className="bar-origin" aria-hidden="true" />}
      <span className="bar-label">{label}</span>
      <output className="bar-value">{display}</output>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
