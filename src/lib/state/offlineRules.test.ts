import { describe, expect, it } from 'vitest'
import { shouldKeepOffline } from './device.svelte'
import { connectionVerdict } from './online.svelte'

/**
 * The two rules the offline behaviour turns on, neither of which was assertable before: each lived
 * inside a function that also owned a timer, module state, or four `matchMedia` reads.
 *
 * Most of the cases below are bugs that shipped, which is the argument for the file existing; the
 * rest pin the neighbouring branches so a fix to one cannot quietly move another. The adapter around
 * these two - the hold, the dedupe, the visibility gate - is covered in `onlineHold.test.ts`.
 */

describe('connectionVerdict', () => {
  it('takes a connection as proof the network works', () => {
    expect(connectionVerdict('connected')).toBe('reachable')
  })

  it('takes needs-auth as proof too, because only a server can produce it', () => {
    // A dead network cannot answer 401, and a captive portal cannot forge a Zero protocol frame.
    // Zero also will not retry out of this state unaided, so reading it as "no evidence" left the
    // app telling somebody on perfect wifi that they were offline until their token was refreshed.
    expect(connectionVerdict('needs-auth')).toBe('reachable')
  })

  it('reads no network evidence into a broken sync', () => {
    // These mean the sync is broken on a network that may be perfectly fine. They get their own red
    // bar and a reload button; calling them "offline" sends somebody looking for signal.
    expect(connectionVerdict('error')).toBe('no-evidence')
    expect(connectionVerdict('closed')).toBe('no-evidence')
  })

  it('treats connecting and disconnected as consistent with a dead network', () => {
    expect(connectionVerdict('connecting')).toBe('unreachable')
    expect(connectionVerdict('disconnected')).toBe('unreachable')
  })

  it('does not assume an unknown future state is harmless', () => {
    // Zero has six states today. A seventh should hold the app to its ten-second check rather than
    // be waved through as evidence of a working connection.
    expect(connectionVerdict('some-new-state')).toBe('unreachable')
  })
})

describe('shouldKeepOffline', () => {
  const desktop = { fine: true, hover: true, installed: false, override: null }

  it('skips only a device it is confident about', () => {
    expect(shouldKeepOffline(desktop)).toBe(false)
  })

  it('keeps data for anything ambiguous', () => {
    // The costs are not symmetric: a phone misread as a desktop loses offline access in a forest
    // where it cannot be fixed, a desktop misread as a phone costs a few megabytes of CVR. So a
    // touchscreen laptop, a tablet, and a browser with no matchMedia all fall on the keep side.
    expect(shouldKeepOffline({ ...desktop, hover: false })).toBe(true)
    expect(shouldKeepOffline({ ...desktop, fine: false })).toBe(true)
    expect(shouldKeepOffline({ fine: false, hover: false, installed: false, override: null })).toBe(true)
  })

  it('treats installing the app as asking for it', () => {
    expect(shouldKeepOffline({ ...desktop, installed: true })).toBe(true)
  })

  it('lets the stored override settle it either way', () => {
    // Both directions matter. Without the first, offline cannot be tested on a desktop at all, and
    // "it does not work here" looks the same whether the gate is behaving or something is broken.
    expect(shouldKeepOffline({ ...desktop, override: true })).toBe(true)
    expect(shouldKeepOffline({ fine: false, hover: false, installed: true, override: false })).toBe(false)
  })
})
