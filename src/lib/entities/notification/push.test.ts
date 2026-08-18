import { describe, expect, it } from 'vitest'
import {
  DIGEST_MAX_WAIT_MS,
  DIGEST_QUIET_MS,
  DIGEST_TAG,
  digestFloor,
  DIRECTED_DEBOUNCE_MS,
  directedTag,
  isDigestDue,
  isDirectedDue,
  pushPayloadSchema,
} from './push'

const NOW = 1_700_000_000_000
const ago = (ms: number) => NOW - ms

describe('isDirectedDue', () => {
  it('holds a fresh row back', () => {
    expect(isDirectedDue(ago(DIRECTED_DEBOUNCE_MS - 1), NOW)).toBe(false)
  })

  it('releases one that has waited out the debounce', () => {
    expect(isDirectedDue(ago(DIRECTED_DEBOUNCE_MS), NOW)).toBe(true)
  })

  /** The whole reason the debounce exists: an edit and its immediate correction are one buzz. */
  it('is still holding a row while a typo fix is landing', () => {
    expect(isDirectedDue(ago(30_000), NOW)).toBe(false)
  })
})

describe('isDigestDue', () => {
  it('is never due with an empty queue', () => {
    expect(isDigestDue(undefined, undefined, NOW)).toBe(false)
  })

  /**
   * The rule that turns a forty-minute crag import into one buzz. Rows are still arriving, so the
   * oldest being well past the quiet period does not matter.
   */
  it('waits while events are still arriving', () => {
    expect(isDigestDue(ago(45 * 60_000), ago(60_000), NOW)).toBe(false)
  })

  it('sends once the region has gone quiet', () => {
    expect(isDigestDue(ago(45 * 60_000), ago(DIGEST_QUIET_MS), NOW)).toBe(true)
  })

  /**
   * The ceiling, and the reason it exists: a region that never goes quiet would otherwise never
   * push at all, which is a silent failure rather than a quiet one.
   */
  it('sends anyway once the oldest row is too old, however busy it still is', () => {
    expect(isDigestDue(ago(DIGEST_MAX_WAIT_MS), NOW, NOW)).toBe(true)
  })

  it('does not send a queue that is neither quiet nor old', () => {
    expect(isDigestDue(ago(60 * 60_000), ago(60_000), NOW)).toBe(false)
  })
})

describe('digestFloor', () => {
  /** Reading the feed silences the push for what was read, even though no push has gone out. */
  it('takes the reader s own progress when it is ahead', () => {
    expect(digestFloor(10, 42)).toBe(42)
  })

  /** And a push that went out is not repeated because the reader never opened the feed. */
  it('takes the push watermark when that is ahead', () => {
    expect(digestFloor(42, 10)).toBe(42)
  })

  // An account that has neither starts at the beginning, which is what watermark initialisation
  // on first subscribe exists to move off.
  it('treats a missing mark as the beginning', () => {
    expect(digestFloor(null, null)).toBe(0)
    expect(digestFloor(undefined, undefined)).toBe(0)
    expect(digestFloor(null, 7)).toBe(7)
    expect(digestFloor(7, null)).toBe(7)
  })
})

describe('tags', () => {
  /** A digest is a complete restatement, so a new one must REPLACE the last rather than stack,
   *  which is what one fixed tag across every send buys. */
  it('gives every digest the same tag', () => {
    expect(DIGEST_TAG).toBe('digest')
  })

  /** Directed events are each their own sentence, so they must not replace one another. */
  it('gives every directed row its own tag', () => {
    expect(directedTag(1)).not.toBe(directedTag(2))
    expect(directedTag(1)).not.toBe(DIGEST_TAG)
  })
})

describe('pushPayloadSchema', () => {
  // The contract the service worker parses. 1.0 shipped a worker reading a shape nothing
  // produced, and the failure was invisible: the push arrives and nothing appears.
  it('accepts what the sender produces', () => {
    expect(
      pushPayloadSchema.parse({
        badge: 3,
        body: 'and 4 more updates',
        pathname: '/feed',
        tag: 'digest',
        title: 'Anna',
      }),
    ).toEqual({ badge: 3, body: 'and 4 more updates', pathname: '/feed', tag: 'digest', title: 'Anna' })
  })

  it('requires a tag and a title, which are what replacement and the headline need', () => {
    expect(pushPayloadSchema.safeParse({ title: 'Anna' }).success).toBe(false)
    expect(pushPayloadSchema.safeParse({ tag: 'digest' }).success).toBe(false)
  })

  it('accepts a payload with nothing optional set', () => {
    expect(pushPayloadSchema.parse({ tag: 'digest', title: 'Anna' })).toEqual({ tag: 'digest', title: 'Anna' })
  })
})
