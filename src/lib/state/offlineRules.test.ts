import type { ConnectionName } from '$lib/zero/connection'
import { describe, expect, it } from 'vitest'
import { connectionVerdict } from './online.svelte'

/**
 * The connection rule the offline behaviour turns on. Most cases below are bugs that shipped; the
 * adapter around it (the hold, the dedupe, the visibility gate) is covered in `onlineHold.test.ts`.
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
    expect(connectionVerdict('some-new-state' as ConnectionName)).toBe('unreachable')
  })
})
