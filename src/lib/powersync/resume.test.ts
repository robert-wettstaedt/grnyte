import { describe, expect, it } from 'vitest'
import { resumeState } from './resume'

const away = (hiddenFor: number, since: number, checkpoint = false, sinceConnected = since) =>
  resumeState({ checkpoint, hiddenFor, since, sinceConnected })

describe('resumeState', () => {
  it('ignores a moment away, which Safari did not freeze', () => {
    expect(away(2_900, 5_000)).toBe('idle')
    expect(away(3_100, 5_000)).toBe('catchingUp')
  })

  it('holds the bar back for a second, which a still-live page catches up in', () => {
    expect(away(60_000, 900)).toBe('pending')
    expect(away(60_000, 1_100)).toBe('catchingUp')
  })

  it('ends at the first checkpoint since the return, shown or not', () => {
    expect(away(60_000, 900, true)).toBe('idle')
    expect(away(60_000, 5_000, true)).toBe('idle')
  })

  it('counts the 30 s from the last reconnect, so a long offline spell does not read as stuck', () => {
    expect(away(60_000, 300_000, false, 29_900)).toBe('catchingUp')
    expect(away(60_000, 300_000, false, 30_100)).toBe('stalled')
  })

  it('calls a catch-up stuck after 30 s', () => {
    expect(away(60_000, 29_900)).toBe('catchingUp')
    expect(away(60_000, 30_100)).toBe('stalled')
  })
})
