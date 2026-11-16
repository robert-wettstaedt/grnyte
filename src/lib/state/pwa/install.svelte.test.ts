import { describe, expect, it } from 'vitest'
import { isBannerDue, resolveInstallMode } from './install.svelte'

const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-08-09T12:00:00Z')

describe('isBannerDue', () => {
  it('shows the banner to somebody who has never dismissed it', () => {
    expect(isBannerDue(null, 0, now)).toBe(true)
  })

  it('hides it for 30 days after a dismissal', () => {
    expect(isBannerDue(now - 29 * DAY, 1, now)).toBe(false)
    expect(isBannerDue(now - 30 * DAY, 1, now)).toBe(true)
  })

  it('retires it for good on the third dismissal, however old that one is', () => {
    expect(isBannerDue(now - 365 * DAY, 3, now)).toBe(false)
  })

  it('treats a timestamp from the future as due rather than hiding until the clock catches up', () => {
    expect(isBannerDue(now + 365 * DAY, 1, now)).toBe(true)
  })

  // The shared clock is a minute coarse, so a dismissal made a moment ago is routinely ahead of it.
  it('still snoozes a dismissal written since the shared clock last ticked', () => {
    expect(isBannerDue(now + 60_000, 1, now)).toBe(false)
  })
})

// installed, touch, hasPrompt, pushSupported, permanent
describe('resolveInstallMode', () => {
  it('promotes nothing once the app is installed, or on a device without a coarse pointer', () => {
    expect(resolveInstallMode(true, true, true, true, true)).toBe('none')
    expect(resolveInstallMode(false, false, true, true, true)).toBe('none')
  })

  it('fires the stashed prompt whenever there is one', () => {
    expect(resolveInstallMode(false, true, true, true, false)).toBe('prompt')
    expect(resolveInstallMode(false, true, true, false, false)).toBe('prompt')
  })

  it('instructs when no prompt exists and push needs the install', () => {
    expect(resolveInstallMode(false, true, false, false, false)).toBe('manual')
    expect(resolveInstallMode(false, true, false, false, true)).toBe('manual')
  })

  it('names the browser menu on a permanent surface, and stays quiet on a banner', () => {
    expect(resolveInstallMode(false, true, false, true, true)).toBe('menu')
    expect(resolveInstallMode(false, true, false, true, false)).toBe('none')
  })
})
