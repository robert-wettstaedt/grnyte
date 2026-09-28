/**
 * The latch that decides whether a form may seed. Three surfaces used to answer this themselves and
 * had already diverged; the cases below are what each of their comments was protecting.
 */
import { describe, expect, it } from 'vitest'
import { resolveSettled } from './resource.svelte'

/** Same view, nothing latched yet, nothing complete. Each test bends one thing. */
const base = { complete: false, latched: false, sameView: true } as const

describe('resolveSettled', () => {
  it('is not settled before the rows are complete', () => {
    expect(resolveSettled(base)).toBe(false)
  })

  it('settles once the rows are complete', () => {
    expect(resolveSettled({ ...base, complete: true })).toBe(true)
  })

  it('stays settled when the socket parks, which is the whole reason it latches', () => {
    expect(resolveSettled({ ...base, complete: false, latched: true })).toBe(true)
  })

  it('starts over on a new view, so the next request does not inherit the last one’s proof', () => {
    expect(resolveSettled({ complete: false, latched: true, sameView: false })).toBe(false)
  })

  it('settles immediately on a new view that is already complete, which a shared view can be', () => {
    expect(resolveSettled({ complete: true, latched: false, sameView: false })).toBe(true)
  })

  it('does not hold a stale proof across a re-target that lands incomplete', () => {
    const settled = resolveSettled({ ...base, complete: true })
    expect(settled).toBe(true)

    // The request changed: a different view, still loading.
    expect(resolveSettled({ complete: false, latched: settled, sameView: false })).toBe(false)
  })
})
