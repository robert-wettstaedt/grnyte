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
    expect(remoteResource(fake<number[]>({ loading: true, ready: false })).status).toBe('loading')
  })

  it('stays ready while a refresh is in flight', () => {
    const resource = remoteResource(fake({ current: [1], loading: true, ready: true }))
    expect(resource.status).toBe('ready')
    expect(resource.data).toEqual([1])
  })

  it('reports an empty answer as empty rather than missing', () => {
    const resource = remoteResource(fake({ current: [], loading: false, ready: true }))
    expect(resource.status).toBe('ready')
    expect(resource.isEmpty).toBe(true)
  })

  it('prefers the error over a stale answer, as the screens did before', () => {
    expect(remoteResource(fake({ current: [1], error: new Error('nope'), loading: false, ready: true })).status).toBe(
      'error',
    )
  })

  it('calls a first load that cannot happen offline excluded, not an error', () => {
    online.value = false
    expect(remoteResource(fake({ error: new Error('fetch failed'), loading: false, ready: false })).availability).toBe(
      'excluded',
    )
  })

  it('keeps showing an answer already in hand when the connection drops', () => {
    online.value = false
    expect(remoteResource(fake({ current: [1], loading: false, ready: true })).availability).toBe('ready')
  })
})
