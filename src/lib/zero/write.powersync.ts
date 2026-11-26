import { randomId } from '$lib/forms/randomId'
import type { MutationResult } from '$lib/remote/mutation'
import { isOnline } from '$lib/state/online.svelte'
import type { Checked } from './checkSession'
import { refreshReads } from './source.powersync.svelte'
import { answered, offlineRejection, refusal, type WriteOptions, type WriteRejection } from './writeResult'
import type { getZ } from './z.svelte'

export { offlineRejection, type WriteRejection }

type CheckStored = (refused?: string) => Promise<Checked>
type Mutation = Parameters<ReturnType<typeof getZ>['mutate']>[0]
type ReadSession = () => Promise<undefined | { token: string; userId: string }>

/** After the first send and the second; the server applies one write id once, so a resend is safe. */
const RESEND_AFTER_MS = [300, 1000]

/** A half-open connection answers nothing: past this, the send counts as failed on the network. */
const SEND_LIMIT_MS = 15_000

let readSession: ReadSession = async () => undefined
let startedUserId: string | undefined
let checkStored: CheckStored = async () => 'unreadable'

type Answer = {
  json?: { data?: unknown; field?: null | string; message?: string }
  ok: boolean
  status: number
  /** What the request was sent with. */
  token: string
}

/** Where the access token comes from (rejects when it cannot be read now), the account every write of this document
 *  is made as, and what settles a refused token. */
export function setWriteToken(read: ReadSession, userId: string | undefined, check: CheckStored): void {
  checkStored = check
  readSession = read
  startedUserId = userId
}

/** The PowerSync build's `write`: one POST to the app server, resent under the same id when it fails on the way. */
export async function write<T = void>(mutation: Mutation, opts?: WriteOptions<T>): Promise<MutationResult<T>> {
  if (!isOnline()) {
    throw offlineRejection
  }

  // The registry's own request object, as Zero's client reads it; its type names neither field.
  const { args, mutator } = mutation as unknown as { args: unknown; mutator: { mutatorName: string } }
  const data = (await deliver(JSON.stringify({ args, id: randomId(), name: mutator.mutatorName }))) as T
  refreshReads()
  return answered(data, opts)
}

/** Sends until the server answers; a write that never arrives is refused. */
async function arrive(body: string): Promise<Answer> {
  for (const wait of [...RESEND_AFTER_MS, undefined]) {
    const answer = await send(body)
    if (answer != null && answer.status < 500) return answer
    if (wait != null) await new Promise((resolve) => setTimeout(resolve, wait))
  }
  // Online, only the app server failed: the offline flag would hide a form until the device's state changes.
  throw isOnline() ? refusal() : offlineRejection
}

async function deliver(body: string): Promise<unknown> {
  let answer = await arrive(body)
  // Renewed for real: reading an ended session again answers the same token until it expires.
  if (answer.status === 401) {
    await checkStored(answer.token)
    answer = await arrive(body)
  }
  if (answer.ok) return answer.json?.data
  throw refusal(answer.json?.message, answer.json?.field)
}

/** `undefined` when no whole answer arrived. The token is read for every send: one may have been renewed, and
 *  storage is every tab's, so it may be another account's. */
async function send(body: string): Promise<Answer | undefined> {
  const session = await readSession().catch(() => 'unread' as const)
  if (session === 'unread') return undefined
  if (session == null) await checkStored()
  if (session?.userId !== startedUserId || session == null) throw refusal()
  try {
    const response = await fetch('/api/sync/mutate', {
      body,
      credentials: 'omit',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(SEND_LIMIT_MS),
    })
    const { ok, status } = response
    // A refusal may come as text (the rate limit); a success that cannot be read did not arrive.
    const json = ok ? await response.json() : await response.json().catch(() => undefined)
    return { json, ok, status, token: session.token }
  } catch {
    return undefined
  }
}
