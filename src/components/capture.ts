export type CaptureFormat = 'photo' | 'video' | 'gif'
export const CAPTURE_FORMATS: readonly CaptureFormat[] = ['photo', 'video', 'gif']

/** 视频封装的显示名（格式名不翻译）。 */
export const VIDEO_FORMAT_LABELS = { mp4: 'MP4', webm: 'WebM' } as const
