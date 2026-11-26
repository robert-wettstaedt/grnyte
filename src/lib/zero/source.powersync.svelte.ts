import { isOnline } from '$lib/state/online.svelte'
import { leaveIfSessionEnded } from '$lib/state/toast/sessionEnded'
import type { TTL } from '@rocicorp/zero'
import { addContextToQuery, asQueryInternals } from '@rocicorp/zero/bindings'
import { createSubscriber } from 'svelte/reactivity'
import type { Checked } from './checkSession'
import { readQuery } from './read.remote'
import type { QuerySource } from './resource.svelte'

type Request = Parameters<QuerySource['createQuery']>[0]

/** How long after a failed read that still shows carried rows the server is asked again. */
const RETRY_MS = 5000

/** A request on a dead connection may never end, and nothing else is asked while one runs. */
const ASK_LIMIT_MS = 15_000

/** Arguments that only move the window over one list: the rows of the old window still belong to it. */
const WINDOW = new Set(['limit', 'upTo'])

// A switch of account reloads the document, so nothing here is keyed on it.
let userId: string | undefined
/** The device leaves once, however many reads are refused for it. */
let leaving = false
let checkStored: () => Promise<Checked> = async () => 'unreadable'

/** One server read, shared by every resource that asks the same. */
class ServerRead {
  data = $state.raw<unknown>()
  readonly key: string
  /** What the request asks apart from its window. */
  readonly list: string
  type = $state<'complete' | 'error' | 'unknown'>('unknown')
  /** The latch in `Resource` is kept per view, so this object is one per request and never shared by two. */
  readonly view: { ensureSubscribed(): void }
  get details() {
    return { type: this.type }
  }
  #again = false
  #asking = false
  #asks = 0
  #proxy: ReturnType<typeof readQuery> | undefined
  #read: () => ReturnType<typeof readQuery>
  #retry: ReturnType<typeof setTimeout> | undefined

  constructor(request: Request, enabled: boolean) {
    const { args, name } = named(request)
    const windowless = Object.entries(args ?? {}).filter(([arg]) => !WINDOW.has(arg))
    this.key = JSON.stringify([name, args])
    this.list = JSON.stringify([name, windowless])
    this.#read = () => readQuery({ args, as: userId ?? '', name })
    this.data = emptyOf(request)
    const ensureSubscribed = createSubscriber(() => {
      if (!enabled) return
      watchOnline()
      live.add(this)
      // Off this call: it runs inside a derived, where Kit's query may not write its own state.
      queueMicrotask(() => live.has(this) && this.refresh())
      return () => {
        live.delete(this)
        clearTimeout(this.#retry)
      }
    })
    this.view = { ensureSubscribed }
  }

  /** An error is only said online; off the network the read is unanswered. */
  leftNetwork(): void {
    if (this.type === 'error') this.type = 'unknown'
  }

  /** One request at a time: Kit resolves every overlapping refresh with the first answer, which may be the older. */
  async refresh(): Promise<void> {
    if (this.#asking) {
      this.#again = true
      return
    }
    this.#asking = true
    try {
      do {
        this.#again = false
        await this.#ask()
      } while (this.#again && live.has(this))
    } finally {
      this.#asking = false
    }
  }

  async #ask(): Promise<void> {
    clearTimeout(this.#retry)
    if (!isOnline() || userId == null) return
    this.#proxy ??= this.#read()
    const proxy = this.#proxy
    const mine = ++this.#asks
    const request = proxy.refresh().then(() => {
      // Past the limit too, unless a newer request is out.
      if (mine === this.#asks) this.#take(proxy)
    })
    try {
      await withinLimit(request)
    } catch (cause) {
      await this.#failed(cause)
    }
  }

  async #failed(cause: unknown): Promise<void> {
    if ((await signedOut(cause)) || !this.#mayFail()) return
    const status = (cause as undefined | { status?: number })?.status
    if (!hasRows(this.data)) {
      this.type = 'error'
      return
    }
    // The server said no: only the next refresh asks again.
    if (status != null && status < 500) return
    this.#retry = setTimeout(() => void this.refresh(), RETRY_MS)
  }

  /** An error is put before everything else a screen could show, so it is only for a read that has nothing. */
  #mayFail(): boolean {
    return this.type !== 'complete' && !this.#again && isOnline() && live.has(this)
  }

  // shortcut: an answer past the limit may settle a newer request in Kit first; when reads outlive 15 s, abort them.
  #take(proxy: ReturnType<typeof readQuery>): void {
    // Kit resolves a refresh the server refused, and keeps the refusal here.
    if (proxy.error != null) throw proxy.error
    // Kit answers a redirect (the auth hook's, for a request with no session) with nothing; a list is never nothing.
    // shortcut: a single-item read cannot tell it from none; wrap the answer when one moves to the server.
    if (proxy.current === undefined && Array.isArray(this.data))
      throw Object.assign(new Error('redirected'), { status: 401 })
    this.data = proxy.current
    this.type = 'complete'
  }
}

/** The account every read of this document is made as, and what tells a refused one whether it is still signed in. */
export function setReadUser(id: string | undefined, check: () => Promise<Checked>): void {
  checkStored = check
  userId = id
}

/** Whether a refusal says this device is signed out, which leaves instead of showing it. */
async function signedOut(cause: unknown): Promise<boolean> {
  leaving ||= leaveIfSessionEnded(cause)
  if (leaving) return true
  return (cause as undefined | { status?: number })?.status === 401 && (await checkStored()) === 'signedOut'
}

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- nothing reads it reactively
const live = new Set<ServerRead>()

/** Every server read on screen, asked again: after an own write, on return to the app, and back online. */
export function refreshReads(): void {
  for (const read of live) void read.refresh()
}

/** The PowerSync build's source for a resource without a PowerSync twin: its query, run by the app server. */
export const defaultSource: QuerySource = {
  createQuery(request, enabled) {
    const read = new ServerRead(request, enabled)
    if (!enabled) return read
    const reads = [...live].reverse()
    const same = reads.find(({ key }) => key === read.key)
    if (same != null) return same
    const window = reads.find(({ data, list }) => list === read.list && hasRows(data))
    // Another window over the same list: its rows, unconfirmed.
    if (window != null) read.data = window.data
    return read
  },
}

/** A time-to-live is Zero's; a fetch has none. */
export const ttlSource = (_ttl: TTL): QuerySource => defaultSource

async function withinLimit(asked: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('no answer')), ASK_LIMIT_MS)
  })
  await Promise.race([asked, limit]).finally(() => clearTimeout(timer))
}

const hasRows = (data: unknown) => (Array.isArray(data) ? data.length > 0 : data != null)

/** The value before any answer, from the definition's own format, as Zero's views have it. */
const emptyOf = (request: Request): unknown =>
  asQueryInternals(addContextToQuery(request, { authUserId: userId })).format.singular ? undefined : []

/** A registered query's name and arguments. A composite's local read has none, and only Zero modules build one. */
function named(request: Request): { args: Record<string, unknown> | undefined; name: string } {
  if (typeof request === 'object' && 'query' in request) {
    return { args: request.args as Record<string, unknown> | undefined, name: request.query.queryName }
  }
  throw new Error('a server read needs a registered query')
}

let watching = false

/** One watch for the document, started with the first read. */
function watchOnline(): void {
  if (watching) return
  watching = true
  let online = isOnline()
  $effect.root(() => {
    $effect(() => {
      const was = online
      online = isOnline()
      if (online && !was) refreshReads()
      if (!online) for (const read of live) read.leftNetwork()
    })
  })
}
