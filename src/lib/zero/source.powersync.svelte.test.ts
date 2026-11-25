import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mutators } from './mutators'
import { queries } from './queries'
import { createResource } from './resource.svelte'
import { defaultSource, refreshReads, setReadUser, ttlSource } from './source.powersync.svelte'
import { setWriteToken, write } from './write.powersync'

const network = vi.hoisted(() => ({ online: undefined as unknown as { value: boolean } }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => network.online.value }))

// One object for the whole file: the source watches it once.
const online = $state({ value: true })
network.online = online

type Asked = { args: Record<string, unknown>; as: string; name: string }
let asked: Asked[] = []
/** What the server does with each read, in order; the last one repeats. */
let answers: (() => Promise<unknown>)[] = []

// The edge: Kit's query proxy, whose `refresh` is one request and whose `current` is its last answer.
vi.mock('./read.remote', () => ({
  readQuery: (arg: Asked) => {
    const proxy = {
      current: undefined as unknown,
      error: undefined as unknown,
      refresh: async () => {
        asked.push(arg)
        try {
          proxy.current = await (answers.length > 1 ? answers.shift()! : answers[0])()
          proxy.error = undefined
        } catch (cause) {
          // Kit puts a query's own refusal on `error` and resolves; only a request that fails rejects.
          if (cause instanceof TypeError) throw cause
          proxy.error = cause
        }
      },
    }
    return proxy
  },
}))

const rows =
  (...ids: number[]) =>
  async () =>
    ids.map((id) => ({ id }))
const refused = (status: number) => async () => Promise.reject(Object.assign(new Error('refused'), { status }))
const unreachable = async () => Promise.reject(new TypeError('Failed to fetch'))
const pending = () => new Promise<never>(() => {})

type Args = NonNullable<Parameters<typeof queries.listEvents>[0]>
const stops: (() => void)[] = []

/** A resource on screen: read by an effect, as a component reads it. */
function shown(args: () => Args, opts: Parameters<typeof createResource>[2] = {}) {
  let resource!: ReturnType<typeof build>
  const build = () =>
    createResource(
      () => queries.listEvents(args()),
      (events) => (events as unknown as { id: number }[]).map((event) => event.id),
      { source: defaultSource, ...opts },
    )
  const stop = $effect.root(() => {
    resource = build()
    $effect(() => void [resource.data, resource.phase])
  })
  stops.push(stop)
  flushSync()
  return { resource, stop }
}

const settle = async () => {
  await vi.advanceTimersByTimeAsync(0)
  flushSync()
}

beforeEach(() => {
  vi.useFakeTimers()
  network.online.value = true
  asked = []
  answers = [rows(1, 2)]
  setReadUser('user-a')
})

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  flushSync()
  vi.useRealTimers()
})

describe('a server read', () => {
  it('is loading until the server answers, then answered with the mapped rows', async () => {
    const { resource } = shown(() => ({ limit: 5 }))
    expect(resource.phase).toEqual({ kind: 'loading' })

    await settle()

    expect(asked).toEqual([{ args: { limit: 5 }, as: 'user-a', name: 'listEvents' }])
    expect(resource.data).toEqual([1, 2])
    expect(resource.phase).toEqual({ empty: false, kind: 'answered' })
  })

  it('is answered and empty when the answer is', async () => {
    answers = [rows()]
    const { resource } = shown(() => ({}))
    await settle()

    expect(resource.phase).toEqual({ empty: true, kind: 'answered' })
  })

  it('is one request for two resources that ask the same', async () => {
    const one = shown(() => ({ limit: 5 }))
    const two = shown(() => ({ limit: 5 }))
    await settle()

    expect(asked).toHaveLength(1)
    expect([one.resource.data, two.resource.data]).toEqual([
      [1, 2],
      [1, 2],
    ])
  })

  it('is an error when the first read fails', async () => {
    answers = [refused(500)]
    const { resource } = shown(() => ({}))
    await settle()

    expect(resource.phase).toEqual({ kind: 'error' })
  })

  it('asks nothing and shows nothing while disabled, also beside an enabled one that asks the same', async () => {
    shown(() => ({ limit: 5 }))
    await settle()
    const { resource } = shown(() => ({ limit: 5 }), { enabled: () => false })
    await settle()

    expect(asked).toHaveLength(1)
    expect(resource.data).toEqual([])
  })

  it('answers a time-to-live request the same way', async () => {
    const { resource } = shown(() => ({}), { source: ttlSource('none') })
    await settle()

    expect(resource.data).toEqual([1, 2])
  })
})

describe('a request that changes', () => {
  it('starts over when a filter does, never answered and empty by the old request', async () => {
    let category = $state<'ascent' | 'update'>('ascent')
    answers = [rows(1), pending]
    const { resource } = shown(() => ({ category }))
    await settle()
    category = 'update'
    flushSync()

    expect(resource.data).toEqual([])
    expect(resource.phase).toEqual({ kind: 'loading' })
  })

  it.each([
    ['limit', { limit: 1 }, { limit: 2 }],
    ['upTo', { upTo: { createdAt: 1, id: 1 } }, { upTo: { createdAt: 2, id: 2 } }],
  ])('keeps its rows and is arriving when only %s does', async (_, before: Args, after: Args) => {
    let args = $state.raw<Args>(before)
    answers = [rows(1), pending]
    const { resource } = shown(() => args)
    await settle()
    args = after
    flushSync()

    expect(resource.data).toEqual([1])
    expect(resource.phase).toEqual({ kind: 'arriving' })
    expect(resource.data).toEqual([1])
  })

  it('is answered by the new rows once they come', async () => {
    let limit = $state(1)
    answers = [rows(1), rows(1, 2)]
    const { resource } = shown(() => ({ limit }))
    await settle()
    limit = 2
    flushSync()
    await settle()

    expect(resource.data).toEqual([1, 2])
    expect(resource.phase).toEqual({ empty: false, kind: 'answered' })
  })

  it.each([
    ['on the network', unreachable],
    ['on the server', refused(503)],
  ])('stays arriving with its rows when the new answer fails %s, and is asked again after 5 s', async (_, failure) => {
    let limit = $state(1)
    answers = [rows(1), failure, rows(1, 2)]
    const { resource } = shown(() => ({ limit }))
    await settle()
    limit = 2
    flushSync()
    await settle()
    expect(resource.data).toEqual([1])
    expect(resource.phase).toEqual({ kind: 'arriving' })

    await vi.advanceTimersByTimeAsync(4999)
    expect(asked).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    await settle()

    expect(asked).toHaveLength(3)
    expect(resource.data).toEqual([1, 2])
  })

  it.each([409, 429])(
    'keeps its rows when the new answer is refused with %s, and the clock asks no more',
    async (status) => {
      let limit = $state(1)
      answers = [rows(1), refused(status)]
      const { resource } = shown(() => ({ limit }))
      await settle()
      limit = 2
      flushSync()
      await settle()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(resource.data).toEqual([1])
      expect(resource.phase).toEqual({ kind: 'arriving' })
      expect(asked).toHaveLength(2)
    },
  )
})

describe('a server read off the network', () => {
  it('is not an error when it fails there', async () => {
    let fail!: (cause: unknown) => void
    answers = [() => new Promise((_, reject) => (fail = reject))]
    const { resource } = shown(() => ({}))
    await settle()
    network.online.value = false
    fail(new TypeError('Failed to fetch'))
    await settle()

    expect(resource.phase.kind).toBe('unavailable')
  })

  it('stops being an error when the device goes offline', async () => {
    answers = [refused(500)]
    const { resource } = shown(() => ({}))
    await settle()
    network.online.value = false
    flushSync()

    expect(resource.phase.kind).toBe('unavailable')
  })

  it('asks nothing while no account is known', async () => {
    setReadUser(undefined)
    shown(() => ({}))
    await settle()

    expect(asked).toHaveLength(0)
  })

  it('is unavailable before any answer', async () => {
    network.online.value = false
    const { resource } = shown(() => ({}), { offline: 'excluded' })
    await settle()

    expect(resource.phase).toEqual({ excluded: true, kind: 'unavailable' })
  })
})

describe('fetching again', () => {
  it('asks every read on screen again, and shows the new rows', async () => {
    answers = [rows(1), rows(1, 2)]
    const { resource } = shown(() => ({}))
    await settle()
    refreshReads()
    await settle()

    expect(asked).toHaveLength(2)
    expect(resource.data).toEqual([1, 2])
  })

  it('happens when the device comes back online, and not while it is offline', async () => {
    shown(() => ({}))
    await settle()
    network.online.value = false
    flushSync()
    refreshReads()
    await settle()
    expect(asked).toHaveLength(1)

    network.online.value = true
    flushSync()
    await settle()
    expect(asked).toHaveLength(2)
  })

  it('ends on the newest answer when a refresh overtakes the read before it', async () => {
    let first!: (rows: unknown) => void
    answers = [() => new Promise((resolve) => (first = resolve)), rows(1, 2)]
    const { resource } = shown(() => ({}))
    await settle()
    refreshReads()
    await settle()
    first([{ id: 1 }])
    await settle()

    expect(asked).toHaveLength(2)
    expect(resource.data).toEqual([1, 2])
  })

  it('is not held up for good by a read that never ends', async () => {
    answers = [pending, rows(1)]
    const { resource } = shown(() => ({}))
    await settle()
    refreshReads()
    await vi.advanceTimersByTimeAsync(15_000)
    await settle()

    expect(resource.data).toEqual([1])
  })

  it('still shows an answer that comes after the limit', async () => {
    let late!: (rows: unknown) => void
    answers = [() => new Promise((resolve) => (late = resolve))]
    const { resource } = shown(() => ({}))
    await vi.advanceTimersByTimeAsync(15_000)
    flushSync()
    expect(resource.phase).toEqual({ kind: 'error' })
    late([{ id: 1 }])
    await settle()

    expect(resource.data).toEqual([1])
    expect(resource.phase).toEqual({ empty: false, kind: 'answered' })
  })

  it('is no error while it is about to be asked again', async () => {
    answers = [pending, pending]
    const { resource } = shown(() => ({}))
    await settle()
    refreshReads()
    await vi.advanceTimersByTimeAsync(15_000)
    flushSync()

    expect(asked).toHaveLength(2)
    expect(resource.phase).toEqual({ kind: 'loading' })
  })

  it('keeps the rows and stays answered when it fails', async () => {
    answers = [rows(1), refused(500)]
    const { resource } = shown(() => ({}))
    await settle()
    refreshReads()
    await settle()

    expect(resource.data).toEqual([1])
    expect(resource.phase).toEqual({ empty: false, kind: 'answered' })
  })

  it('asks again after a write succeeded, and not after a refused one', async () => {
    setWriteToken(async () => ({ token: 'token-a', userId: 'user-a' }), 'user-a')
    const save = () => write(mutators.favorites.set({ entityId: 1, entityType: 'area', saved: true, userId: 1 }))
    shown(() => ({}))
    await settle()
    vi.stubGlobal('fetch', async () => Response.json({}, { status: 400 }))
    await save().catch(() => {})
    await settle()
    expect(asked).toHaveLength(1)

    vi.stubGlobal('fetch', async () => Response.json({ data: null }))
    await save()
    await settle()
    expect(asked).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('recovers a read that failed', async () => {
    answers = [refused(500), rows(1)]
    const { resource } = shown(() => ({}))
    await settle()
    refreshReads()
    await settle()

    expect(resource.phase).toEqual({ empty: false, kind: 'answered' })
  })

  it('leaves a read no resource uses any more alone', async () => {
    const { stop } = shown(() => ({}))
    await settle()
    stop()
    await settle()
    refreshReads()
    await settle()

    expect(asked).toHaveLength(1)
  })
})
