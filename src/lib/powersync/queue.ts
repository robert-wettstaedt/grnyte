// The offline write queue: plain TypeScript, no Svelte, SvelteKit or browser global, so a native app can take it.
import { randomId } from '$lib/forms/randomId'
import { formError } from '$lib/forms/schemas'
import type { AbstractPowerSyncDatabase, Transaction } from '@powersync/web'

/** How a mutator joins the queue. */
export interface QueueEntry<Args> {
  /** The optimistic local write, in the same transaction as the intent, as the signed-in `account` (auth id). */
  apply(tx: Transaction, args: Args, account: string): Promise<void>
  /** The form a refusal reopens, or nothing when its subject is no longer on the device. */
  reopen(args: Args, db: AbstractPowerSyncDatabase): Promise<string | undefined>
}

const now = () => new Date().toISOString()
/** Answers a later send can change: a rate limit, a token that may be renewed. */
const HOLD = new Set([401, 429])
/** Without a cap one failing write holds every later one and, with no checkpoint while any is queued, every read. */
const MAX_FAILURES = 3

export type Outcome = {
  data?: null | string
  field?: null | string
  message?: null | string
  status: 'applied' | 'refused'
}

/** A queued write the server refused after its form had finished, until dismissed. */
export interface Refusal {
  args: string
  /** The form to reopen with these values, while its subject is still on the device. */
  href?: string
  id: string
  message: null | string
  name: string
}

/** An answer of the write route; `undefined` when none arrived. */
export type Sender = (
  body: string,
) => Promise<
  undefined | { json?: { data?: unknown; field?: null | string; message?: string }; ok: boolean; status: number }
>

/** What the server answered write `id`, once it arrives within `ms`; `undefined` past that. Any tab may upload, so
 *  the answer is read from the table, not from the uploader. */
export async function answerOf(db: AbstractPowerSyncDatabase, id: string, ms: number): Promise<Outcome | undefined> {
  const read = () =>
    db.getOptional<Outcome>('select status, data, message, field from write_outcomes where id = ?', [id])
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), ms)
  let changed = () => {}
  stop.signal.addEventListener('abort', () => changed())
  // Listening before the first read, so an answer kept while it runs is not missed.
  db.onChange({ onChange: () => changed() }, { signal: stop.signal, tables: ['write_outcomes'] })
  try {
    while (!stop.signal.aborted) {
      const next = new Promise<void>((resolve) => (changed = resolve))
      const found = await read()
      if (found != null) return found
      await next
    }
    return undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
    stop.abort()
  }
}

/** The connector's `uploadData`: sends each queued intent in order and keeps what the server answered. */
export function createUploader({ applied, send }: { applied?: () => void; send: Sender }) {
  /** Uploads in a row an intent ended on a 500: the handler failing, which a resend repeats. In memory: a reload
   *  costs three more sends. */
  const failures = new Map<string, number>()

  /** Sends one intent and keeps the answer; throws while the answer may still change. */
  const deliver = async (db: AbstractPowerSyncDatabase, id: string, name: string, args: string) => {
    const answer = await send(JSON.stringify({ args: JSON.parse(args), id, name }))
    const failed = answer?.status === 500 ? (failures.get(id) ?? 0) + 1 : 0
    failures.set(id, failed)
    // Thrown, PowerSync sends this transaction again after a while, and everything behind it waits.
    if (held(answer, failed)) throw new Error(`[queue] ${name} not delivered`)
    failures.delete(id)
    await keep(db, { args, id, name, ...outcomeOf(answer, failed > 0) })
    return answer.ok
  }

  return async (db: AbstractPowerSyncDatabase): Promise<void> => {
    for (let tx = await db.getNextCrudTransaction(); tx != null; tx = await db.getNextCrudTransaction()) {
      // The transaction's table writes are the optimistic rows: the mutator, not the row, is what the server runs.
      const intent = tx.crud.find((op) => op.table === 'mutations')
      const { args, name } = (intent?.opData ?? {}) as { args: string; name: string }
      const ok = intent == null ? false : await deliver(db, intent.id, name, args)
      await tx.complete()
      if (ok) applied?.()
    }
  }
}

/** Forgets the answer to write `id`: read by the form that waited for it, or dismissed from the notice. */
export async function settle(db: AbstractPowerSyncDatabase, id: string): Promise<void> {
  await db.execute('delete from write_outcomes where id = ?', [id])
}

/** Whether an answer may still change on a later send: none, a gateway, a limit, a token, or a 500 not yet capped. */
function held(answer: Awaited<ReturnType<Sender>>, failed: number): answer is undefined {
  if (answer == null || HOLD.has(answer.status)) return true
  return answer.status >= 500 && failed < MAX_FAILURES
}

/** Stores the final answer to an intent, for the form waiting on it or the refusal notice. */
async function keep(db: AbstractPowerSyncDatabase, kept: Outcome & { args: string; id: string; name: string }) {
  // An applied answer no form read within a minute never will be: a form waits seconds, not minutes.
  await db.execute(`delete from write_outcomes where status = 'applied' and created_at < ?`, [
    new Date(Date.now() - 60_000).toISOString(),
  ])
  await db.execute(
    `insert or replace into write_outcomes (id, name, args, status, data, message, field, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [kept.id, kept.name, kept.args, kept.status, kept.data ?? null, kept.message ?? null, kept.field ?? null, now()],
  )
}

/** What to keep of a final answer: the data, or the refusal in our words (a handler that kept failing has none). */
function outcomeOf(answer: NonNullable<Awaited<ReturnType<Sender>>>, failing: boolean): Outcome {
  if (answer.ok) return { data: JSON.stringify(answer.json?.data ?? null), status: 'applied' }
  if (failing) return { message: formError('error_server_title'), status: 'refused' }
  return { field: answer.json?.field, message: answer.json?.message, status: 'refused' }
}

/** Where each account's count of queued writes is mirrored, readable where its database is not open. */
export const queuedKey = (account: string) => `grnyte-queued-${account}`

/** Queues a mutator call with its optimistic write; answers the write id it will be sent under. */
export async function enqueue<Args>(
  db: AbstractPowerSyncDatabase,
  name: string,
  entry: QueueEntry<Args>,
  args: Args,
  account: string,
): Promise<string> {
  const id = randomId()
  await db.writeTransaction(async (tx) => {
    await entry.apply(tx, args, account)
    await tx.execute('insert into mutations (id, name, args, created_at) values (?, ?, ?, ?)', [
      id,
      name,
      JSON.stringify(args),
      now(),
    ])
  })
  return id
}

/** Queued writes of every account on this device, as last mirrored: a sign-out deletes every account's file. */
export function queuedOnDevice(storage: Pick<Storage, 'getItem' | 'key' | 'length'>): number {
  let count = 0
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(queuedKey(''))) count += Number(storage.getItem(key)) || 0
  }
  return count
}

/** Writes not sent yet: one intent each, though a write puts its optimistic rows in the upload queue too. */
export async function queuedWrites(db: AbstractPowerSyncDatabase): Promise<number> {
  const row = await db.get<{ n: number }>(`select count(*) as n from ps_crud where data ->> '$.type' = 'mutations'`)
  return row.n
}
