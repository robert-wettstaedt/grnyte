import type { RemoteQuery } from '@sveltejs/kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { remoteResource } from './remoteResource'

const online = vi.hoisted(() => ({ value: true }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => online.value }))

/** Only the four fields the adapter reads, in the combinations Kit's `Query` can actually produce. */
const fake = <T>(query: { current?: T; error?: unknown; loading: boolean; ready: boolean }) =>
  query as unknown as RemoteQuery<T>

beforeEach(() => {
  online.value = true
})

describe('remoteResource', () => {
  it('is loading only before the first answer', () => {
    expect(remoteResource(fake<number[]>({ loading: true, ready: false })).phase).toEqual({ kind: 'loading' })
  })

  it('stays answered while a refresh is in flight', () => {
    const resource = remoteResource(fake({ current: [1], loading: true, ready: true }))
    expect(resource.phase).toEqual({ empty: false, kind: 'answered' })
    expect(resource.data).toEqual([1])
  })

  it('reports an empty answer as empty rather than missing', () => {
    expect(remoteResource(fake({ current: [], loading: false, ready: true })).phase).toEqual({
      empty: true,
      kind: 'answered',
    })
  })

  it('claims no absence before any answer, even when Kit is not reporting a load', () => {
    expect(remoteResource(fake<number[]>({ loading: false, ready: false })).phase).toEqual({ kind: 'loading' })
  })

  it('prefers the error over a stale answer, as the screens did before', () => {
    const resource = remoteResource(fake({ current: [1], error: new Error('nope'), loading: false, ready: true }))
    expect(resource.phase).toEqual({ kind: 'error' })
  })

  it('calls a first load that cannot happen offline unavailable, not an error', () => {
    online.value = false
    expect(remoteResource(fake({ error: new Error('fetch failed'), loading: false, ready: false })).phase).toEqual({
      excluded: true,
      kind: 'unavailable',
    })
  })

  it('keeps showing an answer already in hand when the connection drops', () => {
    online.value = false
    expect(remoteResource(fake({ current: [1], loading: false, ready: true })).phase).toEqual({
      empty: false,
      kind: 'answered',
    })
  })
})
