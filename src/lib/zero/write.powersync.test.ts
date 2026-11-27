import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authClient } from './authClient.test-helper'
import { checkSession } from './checkSession'
import { mutators } from './mutators'
import { forgetUnanswered, setWriteToken, write } from './write.powersync'

let online = true
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => online }))
// Kit's client runtime, which a unit test has no page for.
vi.mock('./read.remote', () => ({ readQuery: vi.fn() }))

type Sent = { body: { args: unknown; id: string; name: string }; init: RequestInit; url: string }
let sent: Sent[] = []
/** What the server does with each request, in order; the last one repeats. */
let answers: (() => Promise<Response>)[] = []

const reply =
  (status: number, body: unknown = {}) =>
  async () =>
    Response.json(body, { status })
const unreachable = async () => Promise.reject(new TypeError('Failed to fetch'))
const token = vi.fn<() => Promise<undefined | { token: string; userId: string }>>()

const general = JSON.stringify({ message: 'error_server_title' })
const offline = {
  body: { field: undefined, message: JSON.stringify({ message: 'error_offline_title' }) },
  offline: true,
}
/** Only the app server failed. No offline flag either: it hides a form until the device's state changes. */
const unreached = { body: { field: undefined, message: general } }
const favorite = { entityId: 7, entityType: 'area' as const, saved: true, userId: 1 }
const save = () => write(mutators.favorites.set(favorite))

beforeEach(() => {
  vi.useFakeTimers()
  sent = []
  answers = [reply(200, { data: null })]
  token.mockReset().mockResolvedValue({ token: 'token-a', userId: 'user-a' })
  setWriteToken(token, 'user-a', async () => 'unreadable')
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({ body: JSON.parse(String(init.body)), init, url })
    return (answers.length > 1 ? answers.shift()! : answers[0])()
  })
})

afterEach(() => {
  online = true
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('a write', () => {
  it('is one request naming the mutator, its arguments and an id, with the token and no cookies', async () => {
    await save()

    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('/api/sync/mutate')
    expect(sent[0].init).toMatchObject({ credentials: 'omit', method: 'POST' })
    expect(new Headers(sent[0].init.headers).get('authorization')).toBe('Bearer token-a')
    expect(sent[0].body).toEqual({ args: favorite, id: expect.stringMatching(/^.{16,64}$/), name: 'favorites.set' })
  })

  it('answers the server data and the destination, named or computed from the data', async () => {
    answers = [reply(200, { data: { id: 7 } })]

    expect(await write(mutators.favorites.set(favorite), { redirectTo: '/x' })).toEqual({
      data: { id: 7 },
      redirectTo: '/x',
    })
    expect(
      await write<{ id: number }>(mutators.favorites.set(favorite), { redirectTo: ({ id }) => `/areas/${id}` }),
    ).toEqual({ data: { id: 7 }, redirectTo: '/areas/7' })
  })

  it('carries a new id each time', async () => {
    await save()
    await save()

    expect(sent[0].body.id).not.toBe(sent[1].body.id)
  })

  it('still carries an id where crypto.randomUUID is missing', async () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto)
    vi.stubGlobal('crypto', { getRandomValues })
    await save()

    expect(sent[0].body.id).toMatch(/^[0-9a-f]{32}$/)
  })

  it("sends nothing with another account's token", async () => {
    token.mockResolvedValue({ token: 'token-b', userId: 'user-b' })

    await expect(save()).rejects.toEqual({ body: { field: undefined, message: general } })
    expect(sent).toHaveLength(0)
  })
})

describe('a write that cannot be made', () => {
  it('is refused before it is sent while offline', async () => {
    online = false

    await expect(save()).rejects.toEqual(offline)
    expect(sent).toHaveLength(0)
  })

  it('throws our message and its field', async () => {
    const message = JSON.stringify({ message: 'routes_nameExists' })
    answers = [reply(400, { field: 'name', message })]

    await expect(save()).rejects.toEqual({ body: { field: 'name', message } })
    expect(sent).toHaveLength(1)
  })

  it('throws the general message for text we did not write', async () => {
    answers = [reply(409, { message: 'Error: 409' })]

    await expect(save()).rejects.toEqual({ body: { field: undefined, message: general } })
  })

  it('throws the general message for an answer that is not JSON', async () => {
    answers = [async () => new Response('Too Many Requests', { status: 429 })]

    await expect(save()).rejects.toEqual({ body: { field: undefined, message: general } })
  })
})

describe('a send that fails', () => {
  it.each([
    ['on the network', unreachable],
    ['on the server', reply(503)],
  ])('%s goes again after 0.3 s and 1 s under the same id', async (_, failure) => {
    answers = [failure, failure, reply(200, { data: { id: 7 } })]
    const result = write(mutators.favorites.set(favorite))
    await vi.advanceTimersByTimeAsync(299)
    expect(sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sent).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(999)
    expect(sent).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)

    expect(await result).toEqual({ data: { id: 7 }, redirectTo: undefined })
    expect(new Set(sent.map(({ body }) => body.id)).size).toBe(1)
  })

  it('while the token cannot be read ends as a failure, and sends nothing', async () => {
    token.mockRejectedValue(new Error('Failed to fetch'))
    const result = expect(save()).rejects.toEqual(unreached)
    await vi.advanceTimersByTimeAsync(5000)
    await result

    expect(token).toHaveBeenCalledTimes(3)
    expect(sent).toHaveLength(0)
  })

  it('for want of an answer goes again as well', async () => {
    const timedOut = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timedOut.signal)
    answers = [
      () => new Promise((_, reject) => timedOut.signal.addEventListener('abort', () => reject(new DOMException('')))),
      reply(200, { data: { id: 7 } }),
    ]
    const result = write(mutators.favorites.set(favorite))
    await vi.advanceTimersByTimeAsync(0)
    expect(sent[0].init.signal).toBe(timedOut.signal)
    timedOut.abort()
    await vi.advanceTimersByTimeAsync(300)

    expect(await result).toMatchObject({ data: { id: 7 } })
    vi.restoreAllMocks()
  })

  it('and leaves the device offline says so', async () => {
    answers = [
      async () => {
        online = false
        throw new TypeError('Failed to fetch')
      },
    ]
    const result = expect(save()).rejects.toEqual(offline)
    await vi.advanceTimersByTimeAsync(5000)
    await result
  })

  it('three times is a general failure while the device is online', async () => {
    answers = [unreachable]
    const result = expect(save()).rejects.toEqual(unreached)
    await vi.advanceTimersByTimeAsync(5000)
    await result

    expect(sent).toHaveLength(3)
  })
})

describe('a refused token', () => {
  it('is asked for again once, and the write resent under the same id', async () => {
    token
      .mockResolvedValueOnce({ token: 'stale', userId: 'user-a' })
      .mockResolvedValue({ token: 'fresh', userId: 'user-a' })
    answers = [reply(401), reply(200, { data: null })]
    await save()

    expect(sent.map(({ init }) => new Headers(init.headers).get('authorization'))).toEqual([
      'Bearer stale',
      'Bearer fresh',
    ])
    expect(sent[1].body.id).toBe(sent[0].body.id)
  })

  it('is not replaced by the token of another account', async () => {
    token
      .mockResolvedValueOnce({ token: 'stale', userId: 'user-a' })
      .mockResolvedValue({ token: 'token-b', userId: 'user-b' })
    answers = [reply(401)]

    await expect(save()).rejects.toEqual({ body: { field: undefined, message: general } })
    expect(sent).toHaveLength(1)
  })

  it('twice is a general failure, not a resend', async () => {
    answers = [reply(401)]

    await expect(save()).rejects.toEqual({ body: { field: undefined, message: general } })
    expect(sent).toHaveLength(2)
  })
})

describe('a refused token, over the stored session', () => {
  const stored = { token: 'stale', userId: 'user-a' }
  const gone = { code: 'session_not_found' }
  const signedIn = (refresh: () => unknown) => {
    const client = authClient(stored, refresh)
    const read = async () => client.state.stored ?? undefined
    setWriteToken(read, 'user-a', (refused) => checkSession(client.auth, { refused, userId: 'user-a' }))
    return client.state
  }
  const tokens = () => sent.map(({ init }) => new Headers(init.headers).get('authorization'))

  it('is renewed, and the write resent with the new one under the same id', async () => {
    const state = signedIn(() => void (state.stored = { token: 'renewed', userId: 'user-a' }))
    answers = [reply(401), reply(200, { data: { id: 7 } })]

    expect(await write(mutators.favorites.set(favorite))).toMatchObject({ data: { id: 7 } })
    expect(tokens()).toEqual(['Bearer stale', 'Bearer renewed'])
    expect(sent[1].body.id).toBe(sent[0].body.id)
  })

  it('refused again is a failure, with one refresh in all', async () => {
    const state = signedIn(() => void (state.stored = { token: 'renewed', userId: 'user-a' }))
    answers = [reply(401)]

    await expect(save()).rejects.toEqual(unreached)
    expect([sent.length, state.refreshes]).toEqual([2, 1])
  })

  it('whose session is gone sends nothing more and is signed out', async () => {
    const state = signedIn(() => gone)
    answers = [reply(401), reply(200, { data: null })]

    await expect(save()).rejects.toEqual(unreached)
    expect([sent.length, state.stored]).toEqual([1, null])
  })

  it('stays signed in while the authentication service is down, and the write fails', async () => {
    const state = signedIn(() => ({ status: 500 }))
    answers = [reply(401)]

    await expect(save()).rejects.toEqual(unreached)
    expect(state.stored).toEqual(stored)
  })
})

describe('the same write made again after a failure', () => {
  const unsave = () => write(mutators.favorites.set({ ...favorite, saved: false }))
  /** Three sends with no answer, so the client reports a failure. */
  const unanswered = async (made: () => Promise<unknown>) => {
    answers = [unreachable]
    const result = expect(made()).rejects.toEqual(unreached)
    await vi.advanceTimersByTimeAsync(5000)
    await result
    answers = [reply(200, { data: null })]
  }
  const ids = () => sent.map(({ body }) => body.id)

  it('goes out under the failed write id, so a committed write is not applied twice', async () => {
    await unanswered(save)
    await save()

    expect(ids()).toHaveLength(4)
    expect(new Set(ids()).size).toBe(1)
  })

  it('gets a new id when another write began while it was still being resent', async () => {
    answers = [unreachable]
    const saving = expect(save()).rejects.toEqual(unreached)
    await vi.advanceTimersByTimeAsync(0)
    answers = [reply(200, { data: null })]
    await unsave()
    answers = [unreachable]
    await vi.advanceTimersByTimeAsync(5000)
    await saving
    answers = [reply(200, { data: null })]
    await save()

    const saves = sent.filter(({ body }) => (body.args as typeof favorite).saved)
    expect(saves.at(-1)!.body.id).not.toBe(saves[0].body.id)
  })

  it('gets a new id once a resend of it was answered', async () => {
    await unanswered(save)
    await save()
    await save()

    expect(ids()[4]).not.toBe(ids()[0])
  })

  it('gets a new id once a resend of it was refused', async () => {
    await unanswered(save)
    answers = [reply(403, { message: general })]
    await expect(save()).rejects.toBeTruthy()
    answers = [reply(200, { data: null })]
    await save()

    expect(ids()[4]).not.toBe(ids()[0])
  })

  it('gets a new id with other arguments', async () => {
    await unanswered(save)
    await unsave()

    expect(ids()[3]).not.toBe(ids()[0])
  })

  it('gets a new id when another write came in between', async () => {
    await unanswered(save)
    await unsave()
    await save()

    expect(ids()[4]).not.toBe(ids()[0])
  })

  it('never shares an id between two copies in flight at once', async () => {
    await Promise.all([save(), save()])

    expect(ids()[1]).not.toBe(ids()[0])
  })

  it('keeps its id through a refusal while offline', async () => {
    await unanswered(save)
    online = false
    await expect(save()).rejects.toEqual(offline)
    online = true
    await save()

    expect(ids()[3]).toBe(ids()[0])
  })

  it("does not keep the id of a write refused for another account's token", async () => {
    await unanswered(save)
    token.mockResolvedValueOnce({ token: 'token-b', userId: 'user-b' })
    await expect(save()).rejects.toBeTruthy()
    await save()

    expect(ids()[3]).not.toBe(ids()[0])
  })

  it('gives the waiting id to one of two copies in flight at once, never to both', async () => {
    await unanswered(save)
    await Promise.all([save(), save()])

    expect(ids()[3]).toBe(ids()[0])
    expect(ids()[4]).not.toBe(ids()[3])
  })

  it('gets a new id a minute after the failure', async () => {
    await unanswered(save)
    await vi.advanceTimersByTimeAsync(60_000)
    await save()

    expect(ids()[3]).not.toBe(ids()[0])
  })

  it('gets a new id once the row may have changed elsewhere', async () => {
    await unanswered(save)
    forgetUnanswered()
    await save()

    expect(ids()[3]).not.toBe(ids()[0])
  })

  it('gets a new id when the row changed elsewhere while the failed write was still being resent', async () => {
    answers = [unreachable]
    const saving = expect(save()).rejects.toEqual(unreached)
    await vi.advanceTimersByTimeAsync(0)
    forgetUnanswered()
    await vi.advanceTimersByTimeAsync(5000)
    await saving
    answers = [reply(200, { data: null })]
    await save()

    expect(ids()[3]).not.toBe(ids()[0])
  })
})
