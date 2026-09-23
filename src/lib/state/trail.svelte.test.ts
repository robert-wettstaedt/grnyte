/**
 * The trail through its own interface, over a recording navigator. These assert what the browser
 * was ASKED to do, which is the half that used to be unreachable: the rules were pure and covered,
 * while `exit` read a module global and called `history.back()` on the window, so no test could see
 * which branch ran.
 */
import { describe, expect, it } from 'vitest'
import { createTrail, type TrailNavigator } from './trail.svelte'

type Call = { href?: string; invalidateAll?: boolean; type: 'back' | 'replace' }

/** A navigator that records instead of navigating, and the trail built over it. */
const harness = () => {
  const calls: Call[] = []
  const navigator: TrailNavigator = {
    back: () => {
      calls.push({ type: 'back' })
    },
    replace: (href, options) => {
      calls.push({ href, invalidateAll: options?.invalidateAll, type: 'replace' })
      return Promise.resolve()
    },
  }

  return { calls, trail: createTrail(navigator) }
}

/** The trail a reader leaves walking block -> route -> form, the shape the bug report describes. */
const intoAscentForm = () => {
  const { calls, trail } = harness()
  trail.record({ href: '/blocks/12', type: 'enter' })
  trail.record({ href: '/routes/5', type: 'push' })
  trail.record({ href: '/routes/5/ascents/add', type: 'push' })
  return { calls, trail }
}

describe('exit', () => {
  it('pops when the destination is what a back press would already reach', async () => {
    const { calls, trail } = intoAscentForm()

    await trail.exit('/routes/5')

    expect(calls).toEqual([{ type: 'back' }])
  })

  it('replaces when the destination is somewhere the reader has never been', async () => {
    const { calls, trail } = harness()
    trail.record({ href: '/blocks/12', type: 'enter' })
    trail.record({ href: '/blocks/12/routes/add', type: 'push' })

    await trail.exit('/routes/99')

    expect(calls).toEqual([{ href: '/routes/99', invalidateAll: true, type: 'replace' }])
  })

  it('replaces, never pops, when nothing of the app is behind the reader', async () => {
    const { calls, trail } = harness()
    trail.record({ href: '/routes/5/ascents/add', type: 'enter' })

    await trail.exit('/routes/5')

    expect(calls).toEqual([{ href: '/routes/5', invalidateAll: true, type: 'replace' }])
  })

  // The invariant that used to be only a comment. Invalidating on the pop re-runs the loads of the
  // page being LEFT, and the page a delete just left is the one whose load now 404s.
  it('carries invalidateAll on the replace and never on the pop', async () => {
    const { calls, trail } = intoAscentForm()

    await trail.exit('/routes/5')
    await trail.exit('/somewhere/else')

    expect(calls).toEqual([{ type: 'back' }, { href: '/somewhere/else', invalidateAll: true, type: 'replace' }])
  })

  it('asks for exactly one move, so a pop cannot fire twice', async () => {
    const { calls, trail } = intoAscentForm()

    await trail.exit('/routes/5')

    expect(calls).toHaveLength(1)
  })

  // Entries are keyed on the query too: this previous entry is the media viewer, and popping onto
  // it would reopen a lightbox the reader already closed.
  it('replaces when the entries differ only by their query', async () => {
    const { calls, trail } = harness()
    trail.record({ href: '/blocks/12', type: 'enter' })
    trail.record({ href: '/routes/5?media=7', type: 'push' })
    trail.record({ href: '/routes/5/ascents/add', type: 'push' })

    await trail.exit('/routes/5')

    expect(calls).toEqual([{ href: '/routes/5', invalidateAll: true, type: 'replace' }])
  })

  it('ignores the hash, which never identifies a different screen', async () => {
    const { calls, trail } = harness()
    trail.record({ href: '/blocks/12', type: 'enter' })
    trail.record({ href: '/routes/5#beta', type: 'push' })
    trail.record({ href: '/routes/5/ascents/add', type: 'push' })

    await trail.exit('/routes/5')

    expect(calls).toEqual([{ type: 'back' }])
  })
})

describe('back', () => {
  it('steps back when the app is behind the reader', () => {
    const { calls, trail } = intoAscentForm()

    trail.back('/blocks/12')

    expect(calls).toEqual([{ type: 'back' }])
  })

  it('goes up instead when the reader arrived directly, and does not invalidate', () => {
    const { calls, trail } = harness()
    trail.record({ href: '/routes/5', type: 'enter' })

    trail.back('/blocks/12')

    expect(calls).toEqual([{ href: '/blocks/12', invalidateAll: undefined, type: 'replace' }])
  })
})

describe('canGoBack', () => {
  it('is false on the entry the reader landed on', () => {
    const { trail } = harness()
    trail.record({ href: '/routes/5', type: 'enter' })

    expect(trail.canGoBack()).toBe(false)
  })

  it('is true once they have moved, and false again after walking back to the start', () => {
    const { trail } = intoAscentForm()

    expect(trail.canGoBack()).toBe(true)

    trail.record({ delta: -2, href: '/blocks/12', type: 'popstate' })

    expect(trail.canGoBack()).toBe(false)
  })
})

describe('record', () => {
  it('starts over on enter, because a fresh document knows nothing of what preceded it', async () => {
    const { calls, trail } = intoAscentForm()
    trail.record({ href: '/feed', type: 'enter' })

    expect(trail.canGoBack()).toBe(false)
    await trail.exit('/routes/5')

    expect(calls, 'nothing is behind a fresh document, so this can only replace').toEqual([
      { href: '/routes/5', invalidateAll: true, type: 'replace' },
    ])
  })

  it('swaps the current entry on a replace, leaving what is behind alone', async () => {
    const { calls, trail } = intoAscentForm()
    trail.record({ href: '/routes/5/ascents/add?step=2', type: 'replace' })

    await trail.exit('/routes/5')

    expect(calls, 'the entry behind is still the route').toEqual([{ type: 'back' }])
  })

  // The case that separates a trail from a counter: a push after going back drops what was ahead,
  // or the trail claims a future the browser has already discarded.
  it('discards forward entries on a push', async () => {
    const { calls, trail } = intoAscentForm()
    trail.record({ delta: -2, href: '/blocks/12', type: 'popstate' })
    trail.record({ href: '/feed', type: 'push' })

    // Asserted on what is BEHIND the push, not on what is gone: keeping the stale entries would
    // leave the form behind `/feed` instead of the block, and both spellings replace on a miss.
    await trail.exit('/blocks/12')

    expect(calls, 'the block is behind the push, because the stale entries were dropped').toEqual([{ type: 'back' }])
  })

  it('clamps a popstate that would run off either end', () => {
    const { trail } = intoAscentForm()

    trail.record({ delta: -99, href: '/blocks/12', type: 'popstate' })
    expect(trail.canGoBack(), 'clamped to the first entry, not past it').toBe(false)

    trail.record({ delta: 99, href: '/routes/5/ascents/add', type: 'popstate' })
    expect(trail.canGoBack(), 'clamped to the last entry').toBe(true)
  })

  // `canGoBack` alone cannot see an index clamped too far FORWARD: it is still greater than zero.
  // Only what sits behind that index says whether the clamp landed on the last entry.
  it('clamps forward onto the last entry, not past it', async () => {
    const { calls, trail } = intoAscentForm()
    trail.record({ delta: -2, href: '/blocks/12', type: 'popstate' })
    trail.record({ delta: 99, href: '/routes/5/ascents/add', type: 'popstate' })

    await trail.exit('/routes/5')

    expect(calls, 'the form is current again, so the route is behind it').toEqual([{ type: 'back' }])
  })

  it('records a replace before any navigation as the first entry', async () => {
    const { calls, trail } = harness()
    trail.record({ href: '/feed', type: 'replace' })
    trail.record({ href: '/routes/5', type: 'push' })

    await trail.exit('/feed')

    expect(calls, 'the replace seeded an entry, so the push has something behind it').toEqual([{ type: 'back' }])
  })

  it('swaps the entry a later back press reaches, not just the one on screen', async () => {
    const { calls, trail } = harness()
    trail.record({ href: '/blocks/12', type: 'enter' })
    trail.record({ href: '/routes/5', type: 'push' })
    trail.record({ href: '/routes/5?media=7', type: 'replace' })
    trail.record({ href: '/routes/5/ascents/add', type: 'push' })

    await trail.exit('/routes/5?media=7')

    expect(calls, 'the replaced value is what is behind, not the value it replaced').toEqual([{ type: 'back' }])
  })

  it('replaces the first entry of a longer trail without discarding what is ahead', () => {
    const { trail } = intoAscentForm()
    trail.record({ delta: -2, href: '/blocks/12', type: 'popstate' })
    trail.record({ href: '/blocks/12?filter=x', type: 'replace' })

    // Still three entries, so the reader can walk forward again.
    trail.record({ delta: 2, href: '/routes/5/ascents/add', type: 'popstate' })

    expect(trail.canGoBack()).toBe(true)
  })
})
