/**
 * Delete all content belonging to a region. Region data has several FK cycles
 * (blocks<->geolocations, routes<->route_external_resources, external_resources
 * <->providers, files<->bunny_streams), so instead of hand-ordering deletes we
 * run inside one transaction with session_replication_role=replica (drops FK
 * enforcement for the tx) and delete every region-scoped table by region_fk.
 * The one external reference into the region - users.first_ascentionist_fk - is
 * nulled first so kept users stay valid.
 *
 * DRY RUN by default: prints what would be deleted, then ROLLS BACK. Set
 * CONFIRM=true to actually commit. Dev DB only.
 *
 *   REGION_ID=1        which region (default 1)
 *   CONFIRM=true       commit instead of rolling back
 *   DROP_REGION=true   also delete region_members/_invitations + the region row
 *                      (default keeps an empty region shell)
 */
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('strip-region: DATABASE_URL is required')

const REGION_ID = Number(process.env.REGION_ID ?? 1)
const CONFIRM = process.env.CONFIRM === 'true'
const DROP_REGION = process.env.DROP_REGION === 'true'
// Membership tables are only touched when dropping the region outright.
const MEMBERSHIP = ['region_members', 'region_invitations']

const sql = postgres(DATABASE_URL, { prepare: false })

// Every region-scoped table, discovered from the schema so this can't drift.
const regionTables = (
  await sql<{ t: string }[]>`
    select table_name as t from information_schema.columns
    where table_schema = 'public' and column_name = 'region_fk' order by table_name`
).map((r) => r.t)
const contentTables = regionTables.filter((t) => !MEMBERSHIP.includes(t))
const targets = [...contentTables, ...(DROP_REGION ? MEMBERSHIP : [])]

const ROLLBACK = Symbol('dry-run rollback')
try {
  await sql.begin(async (tx) => {
    await tx`set local search_path to public`
    await tx`set local session_replication_role = replica` // drop FK enforcement for this tx

    const before: { rows: number; table: string }[] = []
    for (const t of targets) {
      const [{ c }] = await tx<{ c: number }[]>`select count(*)::int c from ${tx(t)} where region_fk = ${REGION_ID}`
      if (c > 0) before.push({ rows: c, table: t })
    }

    // Null the only reference into the region from a kept table.
    await tx`
      update public.users set first_ascentionist_fk = null
      where first_ascentionist_fk in (select id from public.first_ascensionists where region_fk = ${REGION_ID})`

    for (const t of contentTables) await tx`delete from ${tx(t)} where region_fk = ${REGION_ID}`
    if (DROP_REGION) {
      for (const t of MEMBERSHIP) await tx`delete from ${tx(t)} where region_fk = ${REGION_ID}`
      await tx`delete from public.regions where id = ${REGION_ID}`
    }

    console.table(before)
    const total = before.reduce((a, b) => a + b.rows, 0)
    console.log(
      `region ${REGION_ID}: ${total} rows across ${before.length} tables${DROP_REGION ? ' (+ region row)' : ''}`,
    )

    if (!CONFIRM) {
      console.log('DRY RUN - rolling back. Re-run with CONFIRM=true to commit.')
      throw ROLLBACK
    }
    console.log('COMMITTED.')
  })
} catch (e) {
  if (e !== ROLLBACK) throw e
}

await sql.end()
