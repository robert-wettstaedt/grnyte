import type { AscentStatus } from './types'

export interface StatusInfo {
  /** Accessible label, e.g. "Flashed". */
  label: string
  /** Accent colour (a `--st-*` token). */
  color: string
  /** SVG path for the status glyph (24×24 viewBox). */
  path: string
  /** Whether the glyph is filled (vs a stroked outline). */
  filled: boolean
  /** Optional dash pattern (e.g. the dotted "attempt" ring). */
  dash: string
}

const STATUS: Record<AscentStatus, StatusInfo> = {
  flash: { label: 'Flashed', color: 'var(--st-flash)', path: 'M11 2 4 13h5l-1 9 8-12h-6l1-8Z', filled: true, dash: '' },
  redpoint: { label: 'Redpoint', color: 'var(--st-sent)', path: 'M4 12.5l4.5 4.5L20 6', filled: false, dash: '' },
  attempt: {
    label: 'Tried',
    color: 'var(--st-proj)',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
    filled: false,
    dash: '3 3.2',
  },
  repeat: {
    label: 'Repeat',
    color: 'var(--st-repeat)',
    path: 'M20 8a8.5 8.5 0 0 0-15-2.3M4 16a8.5 8.5 0 0 0 15 2.3M5 4.2v3.5h3.5M19 19.8v-3.5h-3.5',
    filled: false,
    dash: '',
  },
}

export function statusInfo(status: AscentStatus | undefined): StatusInfo | null {
  return status ? STATUS[status] : null
}

/** "★★★" clamped to `n` stars (0–3). */
export function starString(n: number | undefined): string {
  return n && n > 0 ? '★★★'.slice(0, n) : ''
}

/** Avatar background gradient for a given oklch hue. */
export function avatarGradient(hue: number): string {
  return `linear-gradient(150deg, oklch(0.68 0.13 ${hue}), oklch(0.46 0.13 ${hue}))`
}
