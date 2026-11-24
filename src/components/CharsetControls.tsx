import { CHARSET_PRESETS, type CharsetId, type RampParseResult } from '../ascii/charset'
import { resolvePresetRamp } from '../ascii/resolveRamp'
import { useI18n } from '../i18n/context'
import { describeChar } from '../i18n/format'

interface CharsetControlsProps {
  charset: CharsetId
  onCharsetChange: (charset: CharsetId) => void
  customRampInput: string
  customRampResult: RampParseResult | null
  onCustomRampInputChange: (input: string) => void
}

/** 忽略字符最多列出的个数。 */
const IGNORED_LIST_LIMIT = 6

/**
 * 字符集：每个选项行内直接显示它实际使用的字符梯度（与渲染器同一个函数解析），
 * 下方的标尺把当前梯度逐字排在暗 → 亮的色带上，空格画成虚线格。
 */
export function CharsetControls(props: CharsetControlsProps) {
  const { m } = useI18n()
  const { charset, customRampResult } = props
  const preset = CHARSET_PRESETS.find((item) => item.id === charset)
  const ramp = preset ? resolvePresetRamp(preset.id) : (customRampResult?.ramp ?? null)
  const removed = customRampResult?.removed ?? []

  return (
    <div className="control-stack">
      <fieldset className="charset-list">
        <legend className="sr-only">{m.panel.charset}</legend>
        {[...CHARSET_PRESETS.map((item) => item.id), 'custom' as const].map((id) => (
          <label key={id} className={id === charset ? 'charset-option is-selected' : 'charset-option'}>
            <input
              type="radio"
              name="charset"
              value={id}
              checked={id === charset}
              onChange={() => props.onCharsetChange(id)}
            />
            <span className="charset-name">{m.charsets.names[id]}</span>
            {id === 'custom' ? (
              <span className="charset-sample is-hint">{m.charsets.customHint}</span>
            ) : (
              <span className="charset-sample" aria-hidden="true">
                {resolvePresetRamp(id).trimStart()}
              </span>
            )}
          </label>
        ))}
      </fieldset>

      {charset === 'custom' && (
        <div className="custom-ramp">
          <label className="text-field">
            <span>{m.charsets.customField}</span>
            <input
              type="text"
              value={props.customRampInput}
              spellCheck={false}
              autoComplete="off"
              maxLength={256}
              onChange={(event) => props.onCustomRampInputChange(event.target.value)}
            />
          </label>
          {customRampResult?.error && <p className="field-error">{m.charsets.tooFew}</p>}
          {removed.length > 0 && (
            <p className="hint">
              {m.charsets.ignored}
              {removed
                .slice(0, IGNORED_LIST_LIMIT)
                .map((item) =>
                  m.charsets.ignoredItem({ char: describeChar(m, item.char), reason: m.charsets.reasons[item.reason] }),
                )
                .join(m.charsets.listSeparator)}
              {removed.length > IGNORED_LIST_LIMIT && m.charsets.ignoredMore({ count: removed.length - IGNORED_LIST_LIMIT })}
            </p>
          )}
        </div>
      )}

      {ramp && <ToneRuler ramp={ramp} unicode={preset?.unicode ?? false} />}
    </div>
  )
}

/** 亮度标尺：字符等距排在色带上方，位置即它负责的亮度区间。 */
function ToneRuler({ ramp, unicode }: { ramp: string; unicode: boolean }) {
  const { m } = useI18n()
  const chars = Array.from(ramp)
  const hasSpace = chars.includes(' ')
  return (
    <figure className="tone-ruler" aria-label={m.charsets.ramp} data-dense={chars.length > 16 || undefined}>
      <div className="ramp-chars" style={{ gridTemplateColumns: `repeat(${chars.length}, minmax(0, 1fr))` }}>
        {chars.map((char, index) => (
          <span key={index} className={char === ' ' ? 'ramp-cell is-space' : 'ramp-cell'}>
            {char}
          </span>
        ))}
      </div>
      <div className="ramp-band" aria-hidden="true" />
      <figcaption className="ramp-legend">
        <span>{m.charsets.dark}</span>
        <span className="ramp-note">
          {hasSpace && m.charsets.spaceKey}
          {hasSpace && unicode && m.charsets.listSeparator}
          {unicode && m.charsets.unicode}
        </span>
        <span>{m.charsets.light}</span>
      </figcaption>
    </figure>
  )
}
