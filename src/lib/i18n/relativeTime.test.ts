import { describe, expect, it } from 'vitest'
import { formatUploadedAt } from './relativeTime'

const now = Date.UTC(2026, 4, 21, 12, 0, 0) // 2026-05-21T12:00Z

describe('formatUploadedAt', () => {
  it('seconds', () => expect(formatUploadedAt(now - 5_000, now, 'en')).toBe('5 seconds ago'))
  it('minutes', () => expect(formatUploadedAt(now - 3 * 60_000, now, 'en')).toBe('3 minutes ago'))
  it('hours', () => expect(formatUploadedAt(now - 2 * 3_600_000, now, 'en')).toBe('2 hours ago'))
  it('yesterday (numeric auto)', () => expect(formatUploadedAt(now - 26 * 3_600_000, now, 'en')).toBe('yesterday'))
  it('days', () => expect(formatUploadedAt(now - 3 * 86_400_000, now, 'en')).toBe('3 days ago'))
  it('absolute beyond a week', () => expect(formatUploadedAt(now - 30 * 86_400_000, now, 'en')).toBe('Apr 21, 2026'))
})
