import { PowerSyncDatabase } from '@powersync/node'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appSchema } from './schema'
import * as statements from './sql'

// The tables a phone holds thousands of rows of: a scan of one of them is a frozen screen, not a slow query.
const LARGE = /\bSCAN\b.*\b(?:ps_data__)?(?:areas|ascents|blocks|routes)\b/

let dir: string
let db: PowerSyncDatabase

beforeAll(async () => {
  // A real PowerSync file: the views every statement reads through exist only once the SDK has opened it.
  dir = mkdtempSync(join(tmpdir(), 'grnyte-explain-'))
  db = new PowerSyncDatabase({
    database: { dbFilename: 'explain.sqlite', dbLocation: dir, implementation: { type: 'node:sqlite' } },
    schema: appSchema,
  })
  await db.waitForReady()
})

afterAll(async () => {
  await db?.close()
  rmSync(dir, { force: true, recursive: true })
})

/** The plan's steps after the driving one: a statement may read its first table whole, never one it joins or looks up. */
const innerSteps = async (sql: string) =>
  (await db.getAll<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`)).slice(1).map((row) => row.detail)

describe('every raw statement joins through an index', () => {
  it.each(Object.entries(statements))('%s scans no large table it joins', async (_, sql) => {
    expect((await innerSteps(sql)).filter((step) => LARGE.test(step))).toEqual([])
  })
})
