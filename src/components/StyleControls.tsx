import {
  BUILTIN_PALETTES,
  getBuiltinPalette,
  type BuiltinPaletteId,
  type PaletteColors,
  type PaletteId,
} from '../ascii/palettes'
import { RENDER_MODES, type RenderMode } from '../ascii/settings'
import { useI18n } from '../i18n/context'

interface VisualStyleControlsProps {
  mode: RenderMode
  onModeChange: (mode: RenderMode) => void
  paletteId: PaletteId
  onPaletteChange: (id: PaletteId) => void
  customPalette: PaletteColors
  customPaletteBase: BuiltinPaletteId
  onPaletteColorChange: (stop: keyof PaletteColors, value: string) => void
  onPaletteReset: (base: BuiltinPaletteId) => void
}

const STOPS: Array<keyof PaletteColors> = ['shadow', 'midtone', 'highlight', 'background']

const gradient = (colors: PaletteColors) => `linear-gradient(90deg, ${colors.shadow}, ${colors.midtone}, ${colors.highlight})`

/** 视觉模式：黑白 / 原色 / 调色板；调色板模式下显示色带选择和四个颜色。 */
export function VisualStyleControls(props: VisualStyleControlsProps) {
  const { m } = useI18n()
  const { mode, paletteId, customPalette, customPaletteBase } = props
  const colors = paletteId === 'custom' ? customPalette : getBuiltinPalette(paletteId).colors

  return (
    <div className="control-stack">
      <fieldset className="segmented mode-switch">
        <legend className="sr-only">{m.panel.visualStyle}</legend>
        {RENDER_MODES.map((value) => (
          <label key={value} className={value === mode ? 'mode-option segment is-selected' : 'mode-option segment'}>
            <input
              type="radio"
              name="render-mode"
              value={value}
              checked={value === mode}
              onChange={() => props.onModeChange(value)}
            />
            {m.modes[value]}
          </label>
        ))}
      </fieldset>

      {mode === 'palette' && (
        <div className="palette-editor">
          <div className="palette-list" role="group" aria-label={m.palettes.group}>
            {BUILTIN_PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                className="palette-swatch"
                aria-pressed={palette.id === paletteId}
                data-palette={palette.id}
                title={m.palettes.names[palette.id]}
                style={{ background: gradient(palette.colors) }}
                onClick={() => props.onPaletteChange(palette.id)}
              >
                <span className="sr-only">{m.palettes.names[palette.id]}</span>
              </button>
            ))}
            <button
              type="button"
              className="palette-swatch palette-custom"
              aria-pressed={paletteId === 'custom'}
              data-palette="custom"
              onClick={() => props.onPaletteChange('custom')}
            >
              {m.palettes.custom}
            </button>
          </div>

          <div className="palette-current">
            <span className="palette-name">
              {paletteId === 'custom' ? m.palettes.custom : m.palettes.names[paletteId]}
            </span>
            <span className="palette-band" style={{ background: gradient(colors) }} aria-hidden="true" />
          </div>

          <div className="color-fields" role="group" aria-label={m.palettes.colors}>
            {STOPS.map((stop) => (
              <label key={stop} className="color-field">
                <input
                  type="color"
                  data-stop={stop}
                  value={colors[stop]}
                  onChange={(event) => props.onPaletteColorChange(stop, event.target.value)}
                />
                <span>{m.palettes.stops[stop]}</span>
              </label>
            ))}
          </div>

          {paletteId === 'custom' ? (
            <p className="hint">
              {m.palettes.customBasedOn({ base: m.palettes.names[customPaletteBase] })}{' '}
              <button type="button" className="link-button" onClick={() => props.onPaletteReset(customPaletteBase)}>
                {m.palettes.reset}
              </button>
            </p>
          ) : (
            <p className="hint">{m.palettes.editHint}</p>
          )}
        </div>
      )}
    </div>
  )
}
