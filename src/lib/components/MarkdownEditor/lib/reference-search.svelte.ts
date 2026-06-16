import type { ReferenceType } from '$lib/components/Markdown/lib/remark-references'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import type { ReferenceItem } from './reference-node'

/** A picker candidate: a reference plus an optional context line (one crumb, or a crumb path). */
export interface ReferenceCandidate extends ReferenceItem {
  context?: string | string[]
}

/** Candidates of one kind; the section header label is localised by the list. */
export interface ReferenceGroup {
  type: ReferenceType
  items: ReferenceCandidate[]
}

// Section order in the dropdown and the per-section cap. The cap is pushed into
// each Zero query as a `limit`, so only this many rows per type ever materialise.
const GROUP_ORDER: ReferenceType[] = ['users', 'areas', 'blocks', 'routes']
const PER_GROUP_LIMIT = 6

interface ReferenceSearchOptions {
  /** Current `@` query (the text typed after the trigger). */
  query: () => string
  /** Region whose members may be `@`-mentioned; `undefined` hides the People group. */
  regionFk: () => number | undefined
  /** Only query while the picker is open — keeps it idle (and synced-down) otherwise. */
  open: () => boolean
}

/**
 * Reactive data source for the `@` picker. The search term and a per-type
 * `limit` are pushed **into** the Zero queries (`content` ILIKE + `limit`), so
 * each keystroke materialises at most `PER_GROUP_LIMIT` rows per type rather
 * than the whole region — no client-side scan. Queries are gated on `open`, so
 * nothing runs (and `users` never syncs over the network) until the picker is
 * actually triggered.
 */
export function referenceSearch({ query, regionFk, open }: ReferenceSearchOptions) {
  const areas = createResource(
    () => queries.listAreas({ content: query(), limit: PER_GROUP_LIMIT }),
    (rows): ReferenceCandidate[] =>
      rows.map((row) => ({ type: 'areas', id: row.id, label: row.name, context: row.parent?.name })),
    { enabled: open },
  )

  const blocks = createResource(
    () => queries.listBlocks({ content: query(), limit: PER_GROUP_LIMIT }),
    (rows): ReferenceCandidate[] =>
      rows.map((row) => ({ type: 'blocks', id: row.id, label: row.name, context: row.area?.name })),
    { enabled: open },
  )

  const routes = createResource(
    () => queries.listRoutes({ content: query(), pageSize: PER_GROUP_LIMIT, sort: 'rating', sortOrder: 'desc' }),
    (rows): ReferenceCandidate[] =>
      rows.map((row) => ({
        type: 'routes',
        id: row.id,
        label: row.name,
        context: [row.block?.area?.name, row.block?.name].filter((crumb) => crumb != null),
      })),
    { enabled: open },
  )

  const users = createResource(
    () => queries.listUsers({ regionFk: regionFk()!, content: query(), limit: PER_GROUP_LIMIT }),
    (rows): ReferenceCandidate[] => rows.map((row) => ({ type: 'users', id: row.id, label: row.username })),
    { enabled: () => open() && regionFk() != null },
  )

  const candidates = (): Record<ReferenceType, ReferenceCandidate[]> => ({
    users: users.data,
    areas: areas.data,
    blocks: blocks.data,
    routes: routes.data,
  })

  return {
    /** Non-empty groups, in section order (already filtered + capped by the queries). */
    get groups(): ReferenceGroup[] {
      const all = candidates()
      return GROUP_ORDER.map((type) => ({ type, items: all[type] })).filter((group) => group.items.length > 0)
    },

    /** Flattened candidates in display order — drives keyboard navigation. */
    get flat(): ReferenceCandidate[] {
      return this.groups.flatMap((group) => group.items)
    },

    /**
     * Best-effort synchronous label lookup for rehydrating `!type:id!` tokens
     * from whatever the picker currently has loaded. Reliable id→name resolution
     * on load belongs to the render resolver (`markdownReferences`), not here.
     */
    resolveLabel(type: ReferenceType, id: string): string | undefined {
      const numericId = Number(id)
      return candidates()[type].find((item) => item.id === numericId)?.label
    },
  }
}
