import type { QueryPhase } from '$lib/zero/resource.svelte'
import { describe, expect, it } from 'vitest'
import { resolveFallback, type FallbackWait } from './fallback'

const answered: QueryPhase = { empty: false, kind: 'answered' }
const wait = (phase: QueryPhase = answered, whole = false): FallbackWait => ({
  notFound: 'Route not found',
  phase,
  whole,
})

describe('resolveFallback', () => {
  it('opens once every query is answered', () => {
    expect(resolveFallback([wait(), wait()])).toEqual({ kind: 'open' })
  })

  it('opens on a whole wait once it is answered', () => {
    expect(resolveFallback([wait(answered, true)])).toEqual({ kind: 'open' })
  })

  it('opens with nothing to wait for', () => {
    expect(resolveFallback([])).toEqual({ kind: 'open' })
  })

  it('opens on rows still arriving when nothing needs them whole', () => {
    expect(resolveFallback([wait({ kind: 'arriving' })])).toEqual({ kind: 'open' })
  })

  it('shows one skeleton while any query loads', () => {
    expect(resolveFallback([wait(), wait({ kind: 'loading' })])).toEqual({ kind: 'loading' })
  })

  it('judges waits in order, so a query keyed off a loading one is not called missing', () => {
    const empty: QueryPhase = { empty: true, kind: 'answered' }
    expect(resolveFallback([wait({ kind: 'loading' }), { notFound: 'Block', phase: empty }])).toEqual({
      kind: 'loading',
    })
  })

  it('names the missing row by its own not-found title', () => {
    const empty: QueryPhase = { empty: true, kind: 'answered' }
    expect(resolveFallback([wait(), { notFound: 'Block not found', phase: empty }])).toEqual({
      kind: 'notFound',
      title: 'Block not found',
    })
  })

  it('leaves an empty answer untitled where the screen has no not-found title', () => {
    expect(resolveFallback([{ phase: { empty: true, kind: 'answered' } }])).toEqual({
      kind: 'notFound',
      title: undefined,
    })
  })

  it('reports an error over a skeleton that would never resolve', () => {
    expect(resolveFallback([wait({ kind: 'error' })])).toEqual({ kind: 'error' })
  })

  it('says offline when the row was never synced to this device', () => {
    expect(resolveFallback([wait({ excluded: false, kind: 'unavailable' })])).toEqual({
      excluded: false,
      kind: 'offline',
    })
  })

  it('says the data is not kept offline when the policy excludes it', () => {
    expect(resolveFallback([wait({ excluded: true, kind: 'unavailable' })])).toEqual({
      excluded: true,
      kind: 'offline',
    })
  })

  it('refuses a reader without permission once the row is known', () => {
    expect(resolveFallback([wait()], { denied: true })).toEqual({ kind: 'denied' })
  })

  it('refuses before a later query finishes loading, since the row it judged is here', () => {
    expect(resolveFallback([wait(), wait({ kind: 'loading' })], { denied: true })).toEqual({ kind: 'denied' })
  })

  it('refuses before waiting for the related rows, which permission does not need', () => {
    expect(resolveFallback([wait({ kind: 'arriving' }, true)], { denied: true })).toEqual({ kind: 'denied' })
  })

  it('keeps the skeleton until a whole wait is answered, so the seed reads every list', () => {
    expect(resolveFallback([wait({ kind: 'arriving' }, true)])).toEqual({ kind: 'loading' })
  })

  it('says offline rather than loading forever when the related rows are not coming', () => {
    expect(resolveFallback([wait({ kind: 'partial' }, true)])).toEqual({ excluded: false, kind: 'offline' })
  })
})
