import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queries } from './queries'
import { createResource, type QuerySource } from './resource.svelte'

const env = vi.hoisted(() => ({ fieldDevice: false, guidebookSynced: false, online: true, referenceSynced: false }))

vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => env.online }))
vi.mock('$lib/state/device.svelte', () => ({ isFieldDevice: () => env.fieldDevice }))
vi.mock('$lib/state/sync.svelte', () => ({
  lastSyncedAt: (stamp: string) =>
    (stamp === 'guidebook' ? env.guidebookSynced : stamp === 'reference' && env.referenceSynced) ? 1 : null,
  localStoreLoaded: () => true,
}))

/** A Zero client reduced to one query whose rows and result type a test sets by hand. */
function fakeSource() {
  const result = $state<{ data: unknown; details: { type: 'complete' | 'error' | 'unknown' } }>({
    data: [],
    details: { type: 'unknown' },
  })
  // One view for the life of the test, as `ViewStore` keeps one per request.
  const view = { ensureSubscribed: vi.fn() }
  const source: QuerySource = {
    createQuery: () => ({
      get data() {
        return result.data
      },
      get details() {
        return result.details
      },
      view,
    }),
  }
  return { result, source, view }
}

describe('a resource built on a fake client', () => {
  let cleanup: () => void
  let fake: ReturnType<typeof fakeSource>
  let resource: ReturnType<typeof createResource<'grades', undefined, undefined, unknown, unknown, unknown>>

  beforeEach(() => {
    env.online = true
    env.fieldDevice = false
    env.guidebookSynced = false
    env.referenceSynced = false
    cleanup = $effect.root(() => {
      fake = fakeSource()
      resource = createResource(
        () => queries.listGrades(),
        (rows) => rows,
        { offline: 'field', source: fake.source },
      ) as typeof resource
    })
  })

  afterEach(() => cleanup())

  const phase = () => {
    flushSync()
    return resource.phase
  }

  it('is loading with nothing on hand', () => {
    expect(phase()).toEqual({ kind: 'loading' })
  })

  it('is arriving once rows land before the server confirms them', () => {
    fake.result.data = [{ id: 1 }]
    expect(phase()).toEqual({ kind: 'arriving' })
  })

  it('is answered once the server confirms, with the rows mapped', () => {
    fake.result.data = [{ id: 1 }]
    fake.result.details = { type: 'complete' }
    expect(phase()).toEqual({ empty: false, kind: 'answered' })
    expect(resource.data).toEqual([{ id: 1 }])
  })

  it('answers empty for a single-row query confirmed to have no row', () => {
    fake.result.data = undefined
    fake.result.details = { type: 'complete' }
    expect(phase()).toEqual({ empty: true, kind: 'answered' })
  })

  it('subscribes its view, or nothing would ever materialise it', () => {
    phase()
    expect(fake.view.ensureSubscribed).toHaveBeenCalled()
  })

  it('stays answered when the socket parks and the result type drops back', () => {
    fake.result.data = [{ id: 1 }]
    fake.result.details = { type: 'complete' }
    expect(phase().kind).toBe('answered')

    fake.result.details = { type: 'unknown' }
    expect(phase()).toEqual({ empty: false, kind: 'answered' })
  })

  it('is unavailable offline when this device never got the data', () => {
    env.online = false
    expect(phase()).toEqual({ excluded: false, kind: 'unavailable' })
  })

  it('answers offline from a field device that finished the guidebook', () => {
    env.online = false
    env.fieldDevice = true
    env.guidebookSynced = true
    fake.result.data = [{ id: 1 }]
    expect(phase()).toEqual({ empty: false, kind: 'answered' })
  })

  it('stays answered when the connection returns after an offline kept answer', () => {
    env.online = false
    env.fieldDevice = true
    env.guidebookSynced = true
    fake.result.data = [{ id: 1 }]
    expect(phase().kind).toBe('answered')

    env.online = true
    // `env` is not reactive: a new result type is what wakes the latch, as a reconnect would.
    fake.result.details = { type: 'unknown' }
    expect(phase()).toEqual({ empty: false, kind: 'answered' })
  })

  it('follows a policy that depends on its arguments as they change', () => {
    cleanup()
    env.online = false
    env.fieldDevice = true
    env.guidebookSynced = true
    let policy = $state<'excluded' | 'field'>('excluded')
    cleanup = $effect.root(() => {
      fake = fakeSource()
      resource = createResource(
        () => queries.listGrades(),
        (rows) => rows,
        { offline: () => policy, source: fake.source },
      ) as typeof resource
    })
    fake.result.data = [{ id: 1 }]
    expect(phase()).toEqual({ excluded: true, kind: 'unavailable' })

    policy = 'field'
    expect(phase()).toEqual({ empty: false, kind: 'answered' })
  })

  it('reports a failed query as an error', () => {
    fake.result.details = { type: 'error' }
    expect(phase()).toEqual({ kind: 'error' })
  })

  it('answers offline for reference data once the reference preload finished', () => {
    cleanup()
    env.online = false
    env.referenceSynced = true
    cleanup = $effect.root(() => {
      fake = fakeSource()
      resource = createResource(
        () => queries.listGrades(),
        (rows) => rows,
        { offline: 'always', source: fake.source },
      ) as typeof resource
    })
    expect(phase()).toEqual({ empty: true, kind: 'answered' })
  })
})
