import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
/**
 * The queue against a running sync service: an ascent queued with no connection is replaced in place by the
 * server's copy, and one the server refuses leaves the device at the next checkpoint.
 *
 * Needs a PowerSync service replicating the test database and verifying the test token secret, so it runs only with
 * POWERSYNC_QUEUE_LOCAL=1 (POWERSYNC_URL names the service).
 */
import { ascentQueue } from '$lib/entities/ascent/queue'
import { sessionToken } from '$lib/remote/testHarness'
import { handleSyncMutate } from '$lib/zero/server/syncMutate.server'
import { PowerSyncDatabase } from '@powersync/node'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deviceSchema } from './localTables'
import { createUploader, enqueue, type QueueEntry, type Sender } from './queue'

const ENABLED = reachable && process.env.POWERSYNC_QUEUE_LOCAL === '1'
const ENDPOINT = process.env.POWERSYNC_URL ?? 'http://localhost:58148'
const REGION = '__queue_local__'

let member: SeedUser
let regionId = 0
let routeId = 0
let dir: string
let db: PowerSyncDatabase

const send: Sender = async (body) => {
  const response = await handleSyncMutate(
    new Request('http://localhost/api/sync/mutate', {
      body,
      headers: { authorization: `Bearer ${await sessionToken(member.authId)}`, 'content-type': 'application/json' },
      method: 'POST',
    }),
  )
  return { json: await response.json().catch(() => undefined), ok: response.ok, status: response.status }
}

const connector = {
  fetchCredentials: async () => ({ endpoint: ENDPOINT, token: await sessionToken(member.authId) }),
  uploadData: createUploader({ send }),
}
const entry = ascentQueue as QueueEntry<Record<string, string>>
const ascentArgs = (route: number) => ({
  dateTime: '2026-10-01',
  routeId: String(route),
  type: 'flash',
  uuid: crypto.randomUUID(),
})
const row = (uuid: string) =>
  db.getOptional<{ nid: number; pending: null | number }>('select nid, pending from ascents where id = ?', [uuid])

async function until(check: () => Promise<boolean>, ms = 30_000) {
  const end = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > end) throw new Error('timed out waiting for the device')
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

beforeAll(async () => {
  if (!ENABLED) return
  ;({ regionId, user: member } = await seedRegion(REGION, 'region_user'))
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by) values ('__queue_local_area__', ${regionId}, ${member.userId})
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", area_fk, region_fk, created_by)
    values ('__queue_local_block__', 0, ${area.id}, ${regionId}, ${member.userId}) returning id`
  ;[{ id: routeId }] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, area_fks, area_ids)
    values ('__queue_local_route__', ${block.id}, ${regionId}, ${member.userId}, ${[area.id]}, ${`^${area.id}$`})
    returning id`

  dir = mkdtempSync(join(tmpdir(), 'grnyte-queue-local-'))
  db = new PowerSyncDatabase({
    database: { dbFilename: 'device.sqlite', dbLocation: dir, implementation: { type: 'node:sqlite' } },
    schema: deviceSchema,
  })
  await db.connect(connector)
  await until(async () => (await db.getOptional('select 1 from routes where nid = ?', [routeId])) != null)
  await db.disconnect()
})

afterAll(async () => {
  if (!ENABLED) return
  await db?.disconnectAndClear().catch(() => {})
  await db?.close()
  rmSync(dir, { force: true, recursive: true })
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.ascents where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
})

describe.skipIf(!ENABLED)('a queued ascent and the sync service', () => {
  it('is replaced in place by the server copy, never absent in between', async () => {
    const args = ascentArgs(routeId)
    await enqueue(db, 'ascents.create', entry, args, member.authId)
    expect(await row(args.uuid)).toMatchObject({ pending: 1 })
    let absent = false
    const stop = db.onChange(
      { onChange: async () => void ((await row(args.uuid)) == null && (absent = true)) },
      { tables: ['ascents'] },
    )

    await db.connect(connector)
    await until(async () => ((await row(args.uuid))?.nid ?? 0) > 0)
    stop()
    await db.disconnect()

    expect(await row(args.uuid)).toMatchObject({ pending: null })
    expect(absent).toBe(false)
    const stored = await sql`select 1 from public.ascents where uuid = ${args.uuid}`
    expect(stored).toHaveLength(1)
  })

  it('leaves the device at the checkpoint once the server refused it, keeping the refusal', async () => {
    const args = ascentArgs(routeId)
    const id = await enqueue(db, 'ascents.create', entry, args, member.authId)
    await sql`update public.routes set deleted_at = now() where id = ${routeId}`

    await db.connect(connector)
    await until(async () => (await row(args.uuid)) == null)
    await db.disconnect()

    const outcome = await db.getOptional<{ status: string }>('select status from write_outcomes where id = ?', [id])
    expect(outcome?.status).toBe('refused')
  })
})
