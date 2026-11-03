export type FlowView = 'overview' | 'preview' | 'record' | 'review' | 'submitted'
export type RecordingState = 'idle' | 'recording' | 'paused'
export type ReportTab = 'overview' | 'sounds' | 'intonation' | 'stress'

export const BRAND_MARK = '/assets/vitone-mark.png'
export const PASSAGE_ART = '/assets/new-apartment.png'
export const SCROLL_THUMB_HEIGHT = 32

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
