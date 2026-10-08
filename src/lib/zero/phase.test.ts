import { describe, expect, it } from 'vitest'
import { expectingMore, resolvePhase } from './resource.svelte'

/** Online, rows on hand, confirmed. Each test bends one thing. */
const base = { availability: 'ready', online: true, rawEmpty: false, settled: true, status: 'ready' } as const

describe('resolvePhase', () => {
  it('answers a confirmed query with rows', () => {
    expect(resolvePhase(base)).toEqual({ empty: false, kind: 'answered' })
  })

  it('answers a confirmed query with none as empty, which only an answer may claim', () => {
    expect(resolvePhase({ ...base, rawEmpty: true })).toEqual({ empty: true, kind: 'answered' })
  })

  it('is arriving while rows are on screen online and more may come', () => {
    expect(resolvePhase({ ...base, settled: false })).toEqual({ kind: 'arriving' })
  })

  it('is loading while nothing is on hand online', () => {
    expect(
      resolvePhase({ ...base, availability: 'loading', rawEmpty: true, settled: false, status: 'loading' }),
    ).toEqual({
      kind: 'loading',
    })
  })

  it('is partial offline with rows never confirmed: shown, but neither arriving nor answered', () => {
    expect(resolvePhase({ ...base, online: false, settled: false })).toEqual({ kind: 'partial' })
  })

  it('stays answered when the socket parks after the answer', () => {
    expect(resolvePhase({ ...base, online: false })).toEqual({ empty: false, kind: 'answered' })
  })

  it('answers empty offline once the preload that keeps it finished', () => {
    const kept = { ...base, online: false, rawEmpty: true, settled: false, status: 'loading' } as const
    expect(resolvePhase(kept)).toEqual({ empty: true, kind: 'answered' })
  })

  it('is unavailable offline when never synced, not loading forever', () => {
    const gone = { availability: 'unsynced', online: false, rawEmpty: true, settled: false, status: 'loading' } as const
    expect(resolvePhase(gone)).toEqual({ excluded: false, kind: 'unavailable' })
  })

  it('is unavailable as excluded for data never kept, even with a fragment on hand', () => {
    const fragment = { ...base, availability: 'excluded', online: false, settled: false } as const
    expect(resolvePhase(fragment)).toEqual({ excluded: true, kind: 'unavailable' })
  })

  it('reports an error over anything else', () => {
    expect(resolvePhase({ ...base, availability: 'error', status: 'error' })).toEqual({ kind: 'error' })
  })
})

describe('expectingMore', () => {
  it('is true while loading or arriving, so a held space stays', () => {
    expect(expectingMore({ kind: 'loading' })).toBe(true)
    expect(expectingMore({ kind: 'arriving' })).toBe(true)
  })

  it('is false once answered, offline, partial or failed', () => {
    for (const phase of [
      { empty: false, kind: 'answered' },
      { excluded: false, kind: 'unavailable' },
      { kind: 'partial' },
      { kind: 'error' },
    ] as const) {
      expect(expectingMore(phase)).toBe(false)
    }
  })
})
