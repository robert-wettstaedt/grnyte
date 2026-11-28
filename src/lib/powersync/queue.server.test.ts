import { ascentQueue } from '$lib/entities/ascent/queue'
import { PowerSyncDatabase } from '@powersync/node'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deviceSchema } from './localTables'
import { answerOf, createUploader, enqueue, queuedWrites, type Outcome, type QueueEntry, type Sender } from './queue'

// The queue on a real PowerSync file: `ps_crud`, insert-only and local-only tables behave as the device's do.
let dir: string
let db: PowerSyncDatabase

/** An entry that writes an optimistic ascent under the uuid its args carry. */
const ascentEntry: QueueEntry<{ notes: string; uuid: string }> = {
  apply: async (tx, { notes, uuid }) => {
    await tx.execute('insert into ascents (id, notes, pending) values (?, ?, 1)', [uuid, notes])
  },
  reopen: async () => undefined,
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'grnyte-queue-'))
  db = new PowerSyncDatabase({
    database: { dbFilename: 'queue.sqlite', dbLocation: dir, implementation: { type: 'node:sqlite' } },
    schema: deviceSchema,
  })
  await db.waitForReady()
})

afterEach(async () => {
  await db.close()
  rmSync(dir, { force: true, recursive: true })
})

describe('enqueue', () => {
  it('writes the optimistic row and one intent in one upload transaction', async () => {
    const uuid = crypto.randomUUID()
    const id = await enqueue(db, 'ascents.create', ascentEntry, { notes: 'sent', uuid }, 'account')

    const transaction = await db.getNextCrudTransaction()
    expect(transaction?.crud.map((op) => [op.table, op.id])).toEqual([
      ['ascents', uuid],
      ['mutations', id],
    ])
    expect(transaction?.crud[1].opData).toMatchObject({
      args: JSON.stringify({ notes: 'sent', uuid }),
      name: 'ascents.create',
    })
    expect(await db.getAll('select notes from ascents where id = ?', [uuid])).toEqual([{ notes: 'sent' }])
  })
})

type Answer = Awaited<ReturnType<Sender>>
let sent: { args: unknown; id: string; name: string }[] = []
/** What the server answers each send, in order; the last one repeats. */
let answers: Answer[] = []
const send: Sender = async (body) => {
  sent.push(JSON.parse(body))
  return answers.length > 1 ? answers.shift() : answers[0]
}
/** Queues an ascent with the test entry, under a fresh device id. */
const log = (notes: string) =>
  enqueue(db, 'ascents.create', ascentEntry, { notes, uuid: crypto.randomUUID() }, 'account')
const upload = () => createUploader({ send })(db)
const outcomes = (...ids: string[]) =>
  Promise.all(
    ids.map((id) =>
      db.getOptional<Outcome & { id: string }>(
        'select id, status, data, message, field from write_outcomes where id = ?',
        [id],
      ),
    ),
  )
const queued = async () => (await db.getAll('select 1 from ps_crud')).length

beforeEach(() => {
  sent = []
  answers = [{ json: { data: { id: 7 } }, ok: true, status: 200 }]
})

describe('the count of queued writes', () => {
  it('is one per write, not per upload operation, and none once sent', async () => {
    await log('a')
    expect(await queuedWrites(db)).toBe(1)

    await upload()
    expect(await queuedWrites(db)).toBe(0)
  })
})

describe('uploading', () => {
  it('sends only the intent, under its write id, and keeps the answer', async () => {
    const args = { notes: 'sent', uuid: crypto.randomUUID() }
    const id = await enqueue(db, 'ascents.create', ascentEntry, args, 'account')

    await upload()

    expect(sent).toEqual([{ args, id, name: 'ascents.create' }])
    expect(await outcomes(id)).toEqual([
      { data: JSON.stringify({ id: 7 }), field: null, id, message: null, status: 'applied' },
    ])
    expect(await queued()).toBe(0)
  })

  it.each([400, 403, 409])('keeps a %i refusal with its message and field, and goes on', async (status) => {
    answers = [
      { json: { field: 'name', message: '{"message":"routes_notFound"}' }, ok: false, status },
      { json: { data: { id: 8 } }, ok: true, status: 200 },
    ]
    const refused = await log('a')
    const next = await log('b')

    await upload()

    expect(sent.map((body) => body.id)).toEqual([refused, next])
    expect(await outcomes(refused, next)).toEqual([
      { data: null, field: 'name', id: refused, message: '{"message":"routes_notFound"}', status: 'refused' },
      { data: JSON.stringify({ id: 8 }), field: null, id: next, message: null, status: 'applied' },
    ])
    expect(await queued()).toBe(0)
  })

  it.each([
    ['no answer', undefined],
    ['a gateway error', { ok: false, status: 502 }],
    ['an unavailable server', { ok: false, status: 503 }],
    ['a gateway timeout', { ok: false, status: 504 }],
    ['a rate limit', { ok: false, status: 429 }],
    ['a token that could not be renewed', { ok: false, status: 401 }],
  ])('holds the queue on %s, and sends nothing behind it', async (_, answer) => {
    answers = [answer]
    const held = await log('a')
    const behind = await log('b')

    await expect(upload()).rejects.toThrow()

    expect(sent.map((body) => body.id)).toEqual([held])
    expect(await outcomes(held, behind)).toEqual([null, null])
    expect(await queued()).toBe(4)
  })

  it('takes a write the server failed on in three uploads in a row as refused, and goes on', async () => {
    const failed = { ok: false, status: 500 }
    answers = [failed, failed, failed, { json: { data: { id: 9 } }, ok: true, status: 200 }]
    const broken = await log('a')
    const next = await log('b')
    const uploader = createUploader({ send })

    await expect(uploader(db)).rejects.toThrow()
    await expect(uploader(db)).rejects.toThrow()
    await uploader(db)

    expect(sent.map((body) => body.id)).toEqual([broken, broken, broken, next])
    expect((await outcomes(broken, next)).map((row) => [row?.status, row?.message])).toEqual([
      ['refused', JSON.stringify({ message: 'error_server_title' })],
      ['applied', null],
    ])
  })
})

describe('waiting for an answer', () => {
  it('resolves once the upload kept one', async () => {
    const id = await log('a')
    const waiting = answerOf(db, id, 5000)

    await upload()

    expect(await waiting).toMatchObject({ data: JSON.stringify({ id: 7 }), status: 'applied' })
  })

  it('gives up after its time with nothing', async () => {
    const id = await log('a')

    expect(await answerOf(db, id, 50)).toBeUndefined()
  })
})

describe('after a write is applied', () => {
  it('calls back once per applied write, never for a refusal', async () => {
    answers = [
      { json: { data: null }, ok: true, status: 200 },
      { json: { message: 'x' }, ok: false, status: 400 },
    ]
    const applied = vi.fn()
    await log('a')
    await log('b')

    await createUploader({ applied, send })(db)

    expect(applied).toHaveBeenCalledTimes(1)
  })
})

describe('the ascent entry', () => {
  const AUTH = '11111111-1111-4111-8111-111111111111'
  const args = { dateTime: '2026-10-01', notes: 'sent it', routeId: '5', type: 'flash', uuid: crypto.randomUUID() }

  beforeEach(async () => {
    await db.execute('insert into users (id, nid, auth_user_fk) values (?, 3, ?)', ['3', AUTH])
    await db.execute('insert into routes (id, nid, region_fk) values (?, 5, 2)', ['5'])
  })

  it('writes a marked ascent under its device id, by the signed-in member, in the route region', async () => {
    await enqueue(db, 'ascents.create', ascentQueue as QueueEntry<typeof args>, args, AUTH)

    const [row] = await db.getAll<Record<string, unknown>>('select * from ascents where id = ?', [args.uuid])
    expect(row).toMatchObject({
      created_by: 3,
      date_time: '2026-10-01',
      notes: 'sent it',
      pending: 1,
      region_fk: 2,
      route_fk: 5,
      type: 'flash',
      uuid: args.uuid,
    })
    expect(row.nid).toBeLessThan(0)
  })

  it('reopens the form while its route is on the device, and not once it is gone', async () => {
    const entry = ascentQueue as QueueEntry<typeof args>
    expect(await entry.reopen(args, db)).toBe('/routes/5/ascents/add')

    await db.execute('delete from routes where id = ?', ['5'])
    expect(await entry.reopen(args, db)).toBeUndefined()
  })
})

describe('answers and transactions out of the ordinary', () => {
  it('keeps a refusal that came without a body, so a text answer from a proxy cannot hold the queue', async () => {
    answers = [
      { ok: false, status: 413 },
      { json: { data: null }, ok: true, status: 200 },
    ]
    const refused = await log('a')
    const next = await log('b')

    await upload()

    expect((await outcomes(refused, next)).map((row) => row?.status)).toEqual(['refused', 'applied'])
  })

  it('completes a transaction that carries no intent without sending anything', async () => {
    await db.execute('insert into ascents (id, notes) values (?, ?)', [crypto.randomUUID(), 'local only'])
    const applied = vi.fn()

    await createUploader({ applied, send })(db)

    expect(sent).toEqual([])
    expect(applied).not.toHaveBeenCalled()
    expect(await queued()).toBe(0)
  })
})
