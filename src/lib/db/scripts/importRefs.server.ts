import { and, eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'
import type { EntityKind } from './guidebookPlan'

export interface ImportRefEntry {
  id: number
  imported: Record<string, unknown>
  kind: EntityKind
  ref: string
}

type Db = PostgresJsDatabase<typeof schema>

const KINDS = {
  area: { fk: schema.importRefs.areaFk, table: schema.areas },
  block: { fk: schema.importRefs.blockFk, table: schema.blocks },
  route: { fk: schema.importRefs.routeFk, table: schema.routes },
} satisfies Record<EntityKind, unknown>

const kinds = Object.keys(KINDS) as EntityKind[]

/** Every ref of one source in one region, soft-deleted entities included. */
export async function importRefsOf(db: Db, source: string, regionId: number): Promise<ImportRefEntry[]> {
  const rows = await db
    .select({
      area: KINDS.area.fk,
      block: KINDS.block.fk,
      imported: schema.importRefs.imported,
      ref: schema.importRefs.ref,
      route: KINDS.route.fk,
    })
    .from(schema.importRefs)
    .where(and(eq(schema.importRefs.source, source), eq(schema.importRefs.regionFk, regionId)))

  return rows.flatMap((row) =>
    kinds.flatMap((kind) => {
      const id = row[kind]
      return id == null ? [] : [{ id, imported: row.imported, kind, ref: row.ref }]
    }),
  )
}

/** Refuses an entity outside `regionId`, the scope `importRefsOf` reads back by. */
export async function recordImportRefs(
  db: Db,
  source: string,
  regionId: number,
  refs: readonly ImportRefEntry[],
): Promise<void> {
  for (const kind of kinds) {
    const rows = refs.filter((ref) => ref.kind === kind)
    if (rows.length === 0) continue

    const inserted = await db.execute(sql`
      insert into ${schema.importRefs} (region_fk, ${sql.identifier(KINDS[kind].fk.name)}, source, ref, imported)
      select e.region_fk, e.id, ${source}, r.ref, r.imported
      from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(id int, ref text, imported jsonb)
      join ${KINDS[kind].table} e on e.id = r.id and e.region_fk = ${regionId}
      returning id`)
    if (inserted.length !== rows.length) {
      throw new Error(
        `recordImportRefs: ${rows.length - inserted.length} ${kind} id(s) name no entity in region ${regionId}`,
      )
    }
  }
}
