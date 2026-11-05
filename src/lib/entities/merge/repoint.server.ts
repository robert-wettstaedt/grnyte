import { contentReports, type ContentReport } from '$lib/db/schema'
import type { Context } from '$lib/remote/authed.server'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { closeReports } from '../report/report.server'
import type { MergeKind } from './sides'

type Db = Pick<Context['db'], 'delete' | 'execute' | 'select' | 'update'>

/** The FK column each level's rows use, in every table that points at them. */
const FK: Record<MergeKind, string> = { areas: 'area_fk', blocks: 'block_fk', routes: 'route_fk' }

/** `content_reports.object_type` and markdown's `!kind:id!` spell the levels differently. */
const REPORT_TYPE: Record<MergeKind, 'area' | 'block' | 'route'> = { areas: 'area', blocks: 'block', routes: 'route' }

/** Columns of `notifications_source_idx` besides the level's own FK: equal on all of them is a duplicate. */
const NOTIFICATION_KEY = [
  'user_fk',
  'source_type',
  'actor_fk',
  'region_fk',
  'event_fk',
  'area_fk',
  'ascent_fk',
  'block_fk',
  'file_fk',
  'route_fk',
  'subject_fk',
  'decision_fk',
  'object_ref',
]

/**
 * Move every row of `table` pointing at `source` to `survivor`. With a `key`, a source row whose key
 * the survivor already holds is deleted first, so the survivor keeps its own and no unique index trips.
 */
export async function repoint(
  db: Db,
  table: string,
  column: string,
  source: number,
  survivor: number,
  { key = [], where }: { key?: string[]; where?: ReturnType<typeof sql> } = {},
) {
  const t = sql.identifier(table)
  const c = sql.identifier(column)
  const extra = where == null ? sql`` : sql` and ${where}`
  if (key.length > 0) {
    const same = sql.join(
      key.map((k) => sql`v.${sql.identifier(k)} is not distinct from s.${sql.identifier(k)}`),
      sql` and `,
    )
    await db.execute(sql`
      delete from ${t} s where s.${c} = ${source}${extra}
      and exists (select 1 from ${t} v where v.${c} = ${survivor} and ${same})`)
  }
  await db.execute(sql`update ${t} s set ${c} = ${survivor} where s.${c} = ${source}${extra}`)
}

/**
 * Open reports on the source follow it to the survivor. A reporter who reported both keeps the one on
 * the survivor; the other closes the way any report closes, so they hear about it.
 */
async function repointReports(
  db: Db,
  kind: MergeKind,
  source: number,
  survivor: { authorFk: null | number; id: number; name: string },
  { actorFk, afterCommit }: { actorFk: number; afterCommit: Context['afterCommit'] },
) {
  const type = REPORT_TYPE[kind]
  const onObject = (id: number) => and(eq(contentReports.objectType, type), eq(contentReports.objectId, String(id)))
  const [onSource, onSurvivor] = await Promise.all([
    db.select().from(contentReports).where(onObject(source)),
    db.select({ reporterFk: contentReports.reporterFk }).from(contentReports).where(onObject(survivor.id)),
  ])
  const twice = new Set(onSurvivor.map((row) => row.reporterFk))
  const closing: ContentReport[] = onSource.filter((row) => twice.has(row.reporterFk))
  if (closing.length > 0) {
    await db.delete(contentReports).where(
      inArray(
        contentReports.id,
        closing.map((row) => row.id),
      ),
    )
    afterCommit(() => closeReports(closing, 'acted_on', actorFk))
  }
  await db
    .update(contentReports)
    .set({ authorFk: survivor.authorFk, objectId: String(survivor.id), objectName: survivor.name })
    .where(onObject(source))
}

/** History of the source row itself, which stays with it: the survivor never claims its edits or moves. */
const SOURCE_OWN_VERBS = sql`('create', 'update', 'delete')`

/** The rows every level shares: favorites, import refs, history, notifications. */
async function repointShared(db: Db, kind: MergeKind, source: number, survivor: number) {
  const fk = FK[kind]
  await repoint(db, 'favorites', fk, source, survivor, { key: ['user_fk'] })
  await repoint(db, 'import_refs', fk, source, survivor)
  await repoint(db, 'events', fk, source, survivor, { where: sql`s.verb not in ${SOURCE_OWN_VERBS}` })
  await repoint(db, 'changes', fk, source, survivor, {
    where: sql`not exists (select 1 from public.events e where e.id = s.event_fk and e.verb in ${SOURCE_OWN_VERBS})`,
  })
  await repoint(db, 'notifications', fk, source, survivor, { key: NOTIFICATION_KEY.filter((k) => k !== fk) })
  // Rows merged into the source earlier now name the survivor, so a pointer is always one hop.
  await repoint(db, kind, 'merged_into', source, survivor)
}

/** Every foreign key into areas, blocks or routes, and what a merge does with it. */
export const FOREIGN_KEYS: Record<string, 'children' | 'repointed'> = {
  'areas.merged_into': 'repointed',
  'areas.parent_fk': 'children',
  'ascents.route_fk': 'repointed',
  'blocks.area_fk': 'children',
  'blocks.merged_into': 'repointed',
  'changes.area_fk': 'repointed',
  'changes.block_fk': 'repointed',
  'changes.route_fk': 'repointed',
  'events.area_fk': 'repointed',
  'events.block_fk': 'repointed',
  'events.route_fk': 'repointed',
  'favorites.area_fk': 'repointed',
  'favorites.block_fk': 'repointed',
  'favorites.route_fk': 'repointed',
  'files.area_fk': 'repointed',
  'files.block_fk': 'repointed',
  'files.route_fk': 'repointed',
  'geolocations.area_fk': 'repointed',
  'geolocations.block_fk': 'repointed',
  'import_refs.area_fk': 'repointed',
  'import_refs.block_fk': 'repointed',
  'import_refs.route_fk': 'repointed',
  'notifications.area_fk': 'repointed',
  'notifications.block_fk': 'repointed',
  'notifications.route_fk': 'repointed',
  'route_external_resources.route_fk': 'repointed',
  'routes.block_fk': 'children',
  'routes.merged_into': 'repointed',
  'routes_to_first_ascensionists.route_fk': 'repointed',
  'routes_to_tags.route_fk': 'repointed',
  'topo_routes.route_fk': 'repointed',
  'topos.block_fk': 'repointed',
}

/** Text ids naming an area, block or route without a foreign key. Only reports follow the survivor;
 *  the rest record what happened to the row they name. */
export const TEXT_REFERENCES: Record<string, 'left' | 'repointed'> = {
  'activities.entity_id': 'left',
  'activities.parent_entity_id': 'left',
  'content_reports.object_id': 'repointed',
  'moderation_decisions.object_id': 'left',
  'notifications.object_ref': 'left',
}

/** Markdown columns whose `!kind:id!` references are rewritten to the survivor. */
export const REWRITTEN = [
  ['areas', 'description'],
  ['blocks', 'description'],
  ['routes', 'description'],
  ['ascents', 'notes'],
  ['reactions', 'body'],
  ['deleted_comments', 'body'],
] as const

/** Text columns a merge leaves as written: history, mail to the operator, imported copy. */
export const LEFT_AS_WRITTEN = [
  ['feedback', 'body'],
  ['route_external_resource_27crags', 'description'],
  ['route_external_resource_the_crag', 'description'],
] as const

/** What every level's merge repoints after its own tables: shared rows, reports, then markdown. */
export async function repointLevel(
  db: Db,
  kind: MergeKind,
  source: number,
  survivor: { createdBy: null | number; id: number; name: string },
  { afterCommit, user }: Pick<Context, 'afterCommit' | 'user'>,
) {
  await repointShared(db, kind, source, survivor.id)
  await repointReports(
    db,
    kind,
    source,
    { authorFk: survivor.createdBy, id: survivor.id, name: survivor.name },
    { actorFk: user.id, afterCommit },
  )
  await rewriteReferences(db, kind, source, survivor.id)
}

/** Point every reference to the source at the survivor. Mechanical, so it writes no event. */
export async function rewriteReferences(db: Db, kind: MergeKind, source: number, survivor: number) {
  // The closing `!` keeps `!blocks:14!` from matching `!blocks:140!`.
  const from = `!${kind}:${source}!`
  const to = `!${kind}:${survivor}!`
  for (const [table, column] of REWRITTEN) {
    const c = sql.identifier(column)
    await db.execute(sql`
      update ${sql.identifier(table)} set ${c} = regexp_replace(${c}, ${escapeRegex(from)}, ${to}, 'gi')
      where ${c} ilike ${`%${from.replaceAll('_', '\\_')}%`}`)
  }
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Lock both rows in id order, so two crossing merges queue instead of both committing. */
export async function lockPair(db: Db, kind: MergeKind, a: number, b: number) {
  const rows = await db.execute<{ deleted_at: null | string; id: number }>(sql`
    select id, deleted_at from ${sql.identifier(kind)} where id in (${a}, ${b}) order by id for update`)
  return rows.length === 2 && rows.every((row) => row.deleted_at == null)
}
