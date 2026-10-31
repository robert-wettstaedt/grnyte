/**
 * Apply the guidebook pipeline's operation list (`step3_ops.json`) to one region, in one transaction. The list
 * decides everything; this refuses a stale snapshot, writes, and checks (`guidebookApply.ts`).
 *
 * DRY RUN by default: runs everything, prints it, ROLLS BACK. Run it while nobody edits the region.
 * Writes no notifications and calls nothing outside the database; Zero replicates the result.
 *
 *   DATABASE_URL   required
 *   REGION         region id every id in the list must belong to
 *   OPS            path to step3_ops.json
 *   BATCH          label stamped on every event this run writes, e.g. guidebook-2026
 *   ACTOR          user the events and new rows are attributed to
 *   SQL_OUT        optional file to write every executed statement and its parameters to
 *   CONFIRM=true   commit instead of rolling back
 *
 * It prints counts and ids only, never names or texts: its output may be read by someone the book is not for.
 *
 *   DATABASE_URL=… REGION=32 OPS=step3_ops.json BATCH=guidebook-2026 ACTOR=… npx tsx src/lib/db/scripts/guidebook-import.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import type postgres from 'postgres'
import * as schema from '../schema'
import { applyOps } from './guidebookApply'
import { parseOps } from './guidebookPlan'
import { connect, Preflight, runTransaction } from './regionMove'

const REGION = Number(process.env.REGION)
const OPS = process.env.OPS
const BATCH = process.env.BATCH?.trim()
const ACTOR = Number(process.env.ACTOR)
const SQL_OUT = process.env.SQL_OUT
const CONFIRM = process.env.CONFIRM === 'true'
if (!Number.isInteger(REGION)) throw new Error('guidebook-import: REGION is required')
if (!OPS) throw new Error('guidebook-import: OPS is required')
if (!BATCH) throw new Error('guidebook-import: BATCH is required')
if (!Number.isInteger(ACTOR)) throw new Error('guidebook-import: ACTOR must be a user id')

let raw: unknown
try {
  raw = JSON.parse(readFileSync(OPS, 'utf8'))
} catch {
  // a JSON error quotes the text around the fault, which may be a route's name or text
  console.error('guidebook-import: the operation list is not readable JSON')
  process.exit(1)
}
const ops = parseOps(raw)

if (SQL_OUT) writeFileSync(SQL_OUT, `-- guidebook-import region ${REGION} batch ${BATCH}\n\n`)
const sql = connect(
  'guidebook-import',
  SQL_OUT
    ? { debug: (_, query, params) => appendFileSync(SQL_OUT, `${query.trim()};\n-- ${JSON.stringify(params)}\n\n`) }
    : {},
)
const preflight = new Preflight()

/** A failed query's error carries its parameters, a route's name or text among them: only what identifies it. */
function reportFailure(e: unknown) {
  const err = (e ?? {}) as {
    cause?: { code?: string; constraint_name?: string }
    code?: string
    constraint_name?: string
    message?: unknown
  }
  if (typeof err.message === 'string' && /^(guidebook-import|recordImportRefs):/.test(err.message)) {
    console.error(err.message) // our own messages name ids and counts only
  } else {
    const code = err.cause?.code ?? err.code ?? 'unknown'
    const constraint = err.constraint_name ?? err.cause?.constraint_name
    console.error(`guidebook-import: a query failed (code ${code}${constraint ? `, constraint ${constraint}` : ''})`)
  }
  process.exitCode = 1
}

await runTransaction(sql, CONFIRM, async (tx) => {
  // postgres.js leaves `options` off a transaction handle, and drizzle reads it once for its parsers.
  const db = drizzle(Object.assign(tx, { options: sql.options }) as unknown as postgres.Sql, { schema })
  const [actor] = await tx<{ member: boolean }[]>`
    select exists (select 1 from region_members m where m.region_fk = ${REGION} and m.user_fk = u.id) as member
    from users u where u.id = ${ACTOR}`
  if (actor == null) preflight.fail(`actor ${ACTOR} does not exist`)
  else if (!actor.member) preflight.warn(`actor ${ACTOR} is not a member of region ${REGION}`)

  const { counts, events } = await applyOps(tx, db, ops, { actor: ACTOR, batch: BATCH, preflight, region: REGION })
  console.log(`\nGuidebook import into region ${REGION}, batch "${BATCH}", ${events} events:`)
  console.table(counts)
}).catch(reportFailure)

// `runTransaction` returns quietly after a printed preflight failure; a script calling this must still see it
if (preflight.failures.length > 0) process.exitCode = 1
preflight.printWarnings()

await sql.end()
