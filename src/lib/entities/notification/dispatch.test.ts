/**
 * The notifications cron's decision rules. Every one of them fails silently in production: a wrong
 * answer sends a push to the wrong person, opens the wrong page, or moves a watermark past events
 * nobody was told about. The job still reports success either way.
 */
import { describe, expect, it } from 'vitest'
import { categoryEnabled, directedWanted, inBatches, parentNameIn, pathnameFor, safeMark } from './dispatch'

const at = (ms: number) => ({ createdAt: new Date(ms) })

describe('safeMark', () => {
  it('takes the last row when the scan saw everything', () => {
    expect(safeMark([at(1), at(2), at(3)], false)).toEqual(new Date(3))
  })

  it('stops before a trailing tie group, so the cut siblings are re-read', () => {
    // The whole point: marking at 3 would put the other two 3s below the watermark forever.
    expect(safeMark([at(1), at(2), at(3), at(3), at(3)], true)).toEqual(new Date(2))
  })

  it('takes the tie whole when the window is one millisecond, preferring a repeat to a silence', () => {
    expect(safeMark([at(7), at(7), at(7)], true)).toEqual(new Date(7))
  })

  it('drops only the last row when a truncated scan has no tie', () => {
    expect(safeMark([at(1), at(2), at(3)], true)).toEqual(new Date(2))
  })
})

describe('categoryEnabled', () => {
  const settings = { notifyAscents: true, notifyCommunity: true, notifyGuidebookEdits: true }
  const event = { ascentFk: null, subjectFk: null, verb: 'create' } as const

  it('reads the ascent switch for an ascent', () => {
    expect(categoryEnabled({ ...event, ascentFk: 1 }, { ...settings, notifyAscents: false })).toBe(false)
    expect(categoryEnabled({ ...event, ascentFk: 1 }, { ...settings, notifyGuidebookEdits: false })).toBe(true)
  })

  it('treats a REMOVED ascent as a guidebook edit, because `isAscentEvent` excludes remove', () => {
    const removed = { ...event, ascentFk: 1, verb: 'remove' } as const

    expect(categoryEnabled(removed, { ...settings, notifyAscents: false })).toBe(true)
    expect(categoryEnabled(removed, { ...settings, notifyGuidebookEdits: false })).toBe(false)
  })

  it('reads the community switch when the row names a person', () => {
    expect(categoryEnabled({ ...event, subjectFk: 9 }, { ...settings, notifyCommunity: false })).toBe(false)
    expect(categoryEnabled({ ...event, subjectFk: 9 }, { ...settings, notifyGuidebookEdits: false })).toBe(true)
  })

  it('falls back to the guidebook switch', () => {
    expect(categoryEnabled(event, { ...settings, notifyGuidebookEdits: false })).toBe(false)
  })

  it('treats an unset switch as on, so a new setting does not silence anyone', () => {
    expect(categoryEnabled(event, { notifyAscents: null, notifyCommunity: null, notifyGuidebookEdits: null })).toBe(
      true,
    )
  })
})

describe('directedWanted', () => {
  const row = { notifyComments: true, notifyDirected: true, notifyReactions: true, sourceType: 'mention' }

  it('reads the reaction switch for a reaction', () => {
    expect(directedWanted({ ...row, notifyReactions: false, sourceType: 'reaction' })).toBe(false)
    expect(directedWanted({ ...row, notifyDirected: false, sourceType: 'reaction' })).toBe(true)
  })

  it('answers a reply to the comment switch, not a third one', () => {
    for (const sourceType of ['comment', 'comment_reply']) {
      expect(directedWanted({ ...row, notifyComments: false, sourceType })).toBe(false)
      expect(directedWanted({ ...row, notifyDirected: false, sourceType })).toBe(true)
    }
  })

  it('falls back to the directed switch', () => {
    expect(directedWanted({ ...row, notifyDirected: false })).toBe(false)
    expect(directedWanted({ ...row, notifyComments: false, notifyReactions: false })).toBe(true)
  })

  it('treats an unset switch as on', () => {
    expect(
      directedWanted({ notifyComments: null, notifyDirected: null, notifyReactions: null, sourceType: 'mention' }),
    ).toBe(true)
  })
})

describe('pathnameFor', () => {
  const row = { eventFk: null, fileFk: null, reactionFk: null, sourceType: 'mention' } as const

  it('sends the queue-only pair somewhere that can show them', () => {
    // Neither has an inbox row, so `/notifications` would be a dead end.
    expect(pathnameFor({ ...row, sourceType: 'invitation_received' })).toBe('/settings')
    expect(pathnameFor({ ...row, sourceType: 'membership_removed' })).toBe('/')
  })

  it('prefers the queue-only destination over a file the row also names', () => {
    expect(pathnameFor({ ...row, fileFk: 'abc', sourceType: 'invitation_received' })).toBe('/settings')
  })

  it('opens the card, and scrolls to the comment when there is one', () => {
    expect(pathnameFor({ ...row, eventFk: 12 })).toBe('/events/12')
    expect(pathnameFor({ ...row, eventFk: 12, reactionFk: 5 })).toBe('/events/12?comment=5')
  })

  it('prefers the bare file surface over the card', () => {
    expect(pathnameFor({ ...row, eventFk: 12, fileFk: 'abc' })).toBe('/f/abc')
  })

  it('falls back to the inbox for a row that names no card', () => {
    expect(pathnameFor(row)).toBe('/notifications')
  })
})

describe('parentNameIn', () => {
  it('has nothing to say without a parent', () => {
    expect(parentNameIn(undefined, 'en')).toBeUndefined()
  })

  it('returns the stored name whichever kind it is', () => {
    expect(parentNameIn({ kind: 'block', name: 'The Roof', order: 2, path: '/x' }, 'en')).toBe('The Roof')
    expect(parentNameIn({ kind: 'plain', name: 'North Forest', path: '/x' }, 'en')).toBe('North Forest')
  })

  it('gives a nameless block its position and a nameless plain parent the generic label', () => {
    // Both fallbacks pinned, because asserting only that they DIFFER let a mutant through that
    // sent every parent down the block branch: a plain one has no `order`, so it rendered
    // "Block NaN" and still differed from "Block 3".
    expect(parentNameIn({ kind: 'block', name: '', order: 2, path: '/x' }, 'en')).toBe('Block 3')
    expect(parentNameIn({ kind: 'plain', name: '', path: '/x' }, 'en')).toBe('Unnamed')
  })

  it('localises the fallback for the recipient', () => {
    expect(parentNameIn({ kind: 'plain', name: '', path: '/x' }, 'de')).toBe('Ohne Namen')
  })
})

describe('inBatches', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('keeps the order of the results', async () => {
    const out = await inBatches([1, 2, 3, 4, 5, 6, 7, 8, 9], async (n) => {
      await tick()
      return n * 2
    })

    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18])
  })

  it('never runs more than the batch width at once', async () => {
    // The job holds a pool connection per in-flight item, so the width is what stops it starving
    // the rest of the app for the length of a run.
    let live = 0
    let peak = 0

    await inBatches([...Array(9).keys()], async () => {
      live += 1
      peak = Math.max(peak, live)
      await tick()
      live -= 1
    })

    expect(peak).toBe(4)
  })
})
