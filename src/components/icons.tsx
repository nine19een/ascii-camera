import type { ReactNode } from 'react'

/** 线性图标：统一 1.6 描边、currentColor，尺寸由调用处决定。全部 aria-hidden，按钮的可读名称由文字提供。 */
interface IconProps {
  size?: number
}

function Svg({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5.5" width="11" height="9" rx="2" />
    <path d="M13.5 9.2l4-2.4v6.4l-4-2.4" />
  </Svg>
)

export const CameraOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 5.5h5.5a2 2 0 0 1 2 2v5M13.5 14.5H4.5a2 2 0 0 1-2-2v-5a2 2 0 0 1 1.2-1.8" />
    <path d="M13.5 9.2l4-2.4v6.4l-4-2.4" />
    <path d="M2.5 2.5l15 15" />
  </Svg>
)

export const FreezeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 5v10M12.5 5v10" />
  </Svg>
)

export const CompareIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="15" height="12" rx="1.5" />
    <path d="M10 2.5v15" />
  </Svg>
)

export const AdjustIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h14M3 10h14M3 14h14" />
    <circle cx="7" cy="6" r="1.8" fill="var(--icon-knob, #1e1e20)" />
    <circle cx="13" cy="10" r="1.8" fill="var(--icon-knob, #1e1e20)" />
    <circle cx="9" cy="14" r="1.8" fill="var(--icon-knob, #1e1e20)" />
  </Svg>
)

export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" />
  </Svg>
)

export const ExitFullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 3.5v4h-4M16.5 7.5h-4v-4M12.5 16.5v-4h4M3.5 12.5h4v4" />
  </Svg>
)

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v5" />
    <circle cx="10" cy="6.3" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </Svg>
)

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4 16h12" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Svg>
)

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3l7.5 13.5h-15z" />
    <path d="M10 8.5v3.5" />
    <circle cx="10" cy="14.2" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
)
