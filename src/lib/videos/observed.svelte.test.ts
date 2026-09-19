import { flushSync } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { isObservedReady, probeUntilReady } from './observed.svelte'

// Every assertion below reads through a `$derived`, like the components do. A direct
// `isObservedReady` read passes even against a plain Set, which holds the value but signals nothing.
const stub200 = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  )

/** The set is module-level and outlives a test, so each case needs its own guid. */
const freshGuid = () => `guid-${Math.random().toString(36).slice(2)}`

/** Everything a `$derived` read of the set saw. */
const watchDerived = (guid: string) => {
  const seen: boolean[] = []
  const cleanup = $effect.root(() => {
    const ready = $derived(isObservedReady(guid))
    $effect(() => void seen.push(ready))
  })
  flushSync()
  return { cleanup, seen }
}

describe('probeUntilReady', () => {
  it('invalidates a derived read when the playlist answers', async () => {
    stub200()
    const guid = freshGuid()
    const { cleanup, seen } = watchDerived(guid)
    expect(seen).toEqual([false])

    const stop = probeUntilReady(guid)
    await vi.waitFor(() => expect(isObservedReady(guid)).toBe(true))
    flushSync()
    stop()
    cleanup()

    // The assertion that fails against a plain Set: the value is there, but nothing was signalled.
    expect(seen).toContain(true)
  })

  it('leaves a derived read false when the playlist 404s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    )
    const guid = freshGuid()
    const { cleanup, seen } = watchDerived(guid)
    const stop = probeUntilReady(guid)
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    flushSync()
    stop()
    cleanup()

    expect(seen).not.toContain(true)
    expect(isObservedReady(guid)).toBe(false)
  })

  it('does not probe again for a guid already observed', async () => {
    stub200()
    const guid = freshGuid()
    // Tear down only after the first probe resolves. The teardown cancels an in-flight probe, so
    // stopping at once leaves the set empty and the test passes vacuously.
    const stop = probeUntilReady(guid)
    await vi.waitFor(() => expect(isObservedReady(guid)).toBe(true))
    stop()
    vi.mocked(fetch).mockClear()

    probeUntilReady(guid)()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
