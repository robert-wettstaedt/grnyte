import { collections } from '$lib/powersync/collections'
import { psResource, waitForSynced } from '$lib/powersync/resource.svelte'
import { toZeroRow, unwrapParents } from '$lib/powersync/rows'
import { matchesText } from '$lib/powersync/text'
import { holdWhileDeleting } from '$lib/zero/deleting.svelte'
import { guidebookReadRegistrations, guidebookReads } from '$lib/zero/guidebook'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { eq, ilike, inArray, isNull, toArray, type InitialQueryBuilder } from '@tanstack/db'
import { toAreaDetail, type AreaDetailRow } from './mapper'

export interface AreaListFilter {
  content?: string
  /** Restrict to these area ids (e.g. hydrating a favorites list). */
  id?: number | number[]
  /** Cap the result set (e.g. a search preview). */
  limit?: number
  /** Parent area id; `null` filters to top-level areas (no parent), omitted means no filter. */
  parentFk?: null | number
  /** Find areas whose description references the given `!type:id!` token (backlinks). */
  references?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder's ref types do not survive a helper
type Ref = any
// `areaTrees` takes an untyped builder, so its rows are asserted here.
type SyncedArea = { description?: null | string; name?: null | string; parent: Ref[]; parking: object[] }

/** The area chain a breadcrumb reads, each `parent` a one-row array for `unwrapParents`. */
export function areaChain(q: InitialQueryBuilder, fk: Ref, depth: number): Ref {
  return toArray(
    q
      .from({ a: collections().areas })
      .where(({ a }) => eq(a.nid, fk))
      .select(({ a }) => ({
        id: a.nid,
        name: a.name,
        ...(depth > 0 ? { parent: areaChain(q, a.parent_fk, depth - 1) } : {}),
        type: a.type,
      })),
  )
}

export function areaDetail(id: () => number) {
  const area = psResource(
    (q) =>
      areaTrees(
        q,
        q.from({ a: collections().areas }).where(({ a }) => eq(a.nid, id())),
        2,
      ),
    [id],
    (rows) => {
      const row = (rows as SyncedArea[])[0]
      return row == null ? undefined : toAreaDetail(toAreaRow(row))
    },
  )
  return holdWhileDeleting(area, 'areas', id)
}

export function areaList(filter: () => AreaListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  return psResource(
    (q) => {
      const { id, parentFk, references } = filter()
      let query = q.from({ a: collections().areas })
      if (id != null) query = query.where(({ a }) => inArray(a.nid, [id].flat()))
      // A backlink token is fixed per page, so it narrows the query rather than the selection.
      if (references != null) query = query.where(({ a }) => ilike(a.description, `%${references}%`))
      if (parentFk !== undefined) {
        query = query.where(({ a }) => (parentFk === null ? isNull(a.parent_fk) : eq(a.parent_fk, parentFk)))
      }
      return areaTrees(
        q,
        query.orderBy(({ a }) => a.name, 'asc').orderBy(({ a }) => a.nid, 'asc'),
        1,
      )
    },
    // Text and limit apply in `select`, so typing a search does not rebuild the query.
    [() => filter().id, () => filter().parentFk, () => filter().references],
    (rows) =>
      (rows as SyncedArea[])
        .filter(matchesText(filter()))
        .slice(0, filter().limit)
        .map((row) => toAreaDetail(toAreaRow(row))),
    'guidebook',
    opts,
  )
}

/** Every area in your regions for the map, joined on the device. See `guidebookReads`. */
export function areaMapList() {
  return createResource(guidebookReads.areas, (rows) => rows.map(toAreaDetail), {
    register: () => guidebookReadRegistrations.map((name) => queries[name]()),
  })
}

/** A synced area with its parent chain and parking, as `toAreaDetail` reads it. */
export function toAreaRow(row: SyncedArea): AreaDetailRow {
  return {
    ...toZeroRow<AreaDetailRow>('areas', row),
    parent: unwrapParents(row.parent[0]) as AreaDetailRow['parent'],
    parkingLocations: row.parking.map((g) => toZeroRow<AreaDetailRow['parkingLocations'][number]>('geolocations', g)),
  }
}

/** Resolve once the area row for `id` has synced, or after `timeoutMs`. See {@link waitForSynced}. */
export function waitForArea(id: number, timeoutMs = 5000): Promise<void> {
  return waitForSynced('areas', id, timeoutMs)
}

/** Areas with `depth + 1` levels of parents and their parking, as Zero's area queries nested them. */
function areaTrees(q: InitialQueryBuilder, query: Ref, depth: number) {
  return query.select(({ a }: Ref) => ({
    ...a,
    parent: areaChain(q, a.parent_fk, depth),
    parking: toArray(
      q
        .from({ g: collections().geolocations })
        .where(({ g }) => eq(g.area_fk, a.nid))
        .orderBy(({ g }) => g.nid, 'asc'),
    ),
  }))
}
