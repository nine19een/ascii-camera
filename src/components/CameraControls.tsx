import type { CameraDevice } from '../hooks/useCameraDevices'
import { useI18n } from '../i18n/context'

interface CameraControlsProps {
  devices: readonly CameraDevice[]
  /** 当前（运行中）或下次开启时使用的设备 */
  deviceId: string | null
  running: boolean
  switching: boolean
  locked: boolean
  mirror: boolean
  onSelectDevice: (deviceId: string) => void
  onMirrorChange: (mirror: boolean) => void
}

/** 摄像头：设备选择与镜像。 */
export function CameraControls(props: CameraControlsProps) {
  const { m } = useI18n()
  const known = props.devices.some((device) => device.deviceId === props.deviceId)
  const hint = props.locked
    ? m.camera.lockedWhileRecording
    : props.switching
      ? m.camera.switching
      : !props.running
        ? m.camera.deviceHint
        : null

  return (
    <div className="control-stack">
      <label className="select-field">
        <span>{m.camera.device}</span>
        <select
          value={known ? (props.deviceId ?? '') : ''}
          onChange={(event) => props.onSelectDevice(event.target.value)}
          disabled={!props.running || props.switching || props.locked}
        >
          {!known && <option value="">{m.camera.defaultDevice}</option>}
          {props.devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || m.camera.unnamedDevice({ index: index + 1 })}
            </option>
          ))}
        </select>
      </label>
      {hint && <p className="hint">{hint}</p>}
      <label className="toggle">
        <span>{m.camera.mirror}</span>
        <input
          type="checkbox"
          role="switch"
          checked={props.mirror}
          onChange={(event) => props.onMirrorChange(event.target.checked)}
        />
        <span className="toggle-track" aria-hidden="true" />
      </label>
    </div>
  )
}
