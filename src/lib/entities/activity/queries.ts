import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'
import type { ActivityEntityType, ActivityParentEntityType } from './dto'

// Exhaustive by construction: a value added to the DB enum (and regenerated into the Zero
// schema) breaks these records at compile time instead of silently failing zod at runtime.
const ENTITY_TYPES: Record<ActivityEntityType, true> = {
  area: true,
  ascent: true,
  block: true,
  file: true,
  route: true,
  user: true,
}
const PARENT_ENTITY_TYPES: Record<ActivityParentEntityType, true> = {
  area: true,
  ascent: true,
  block: true,
  route: true,
}

const activityEntityTypes = Object.keys(ENTITY_TYPES) as [ActivityEntityType, ...ActivityEntityType[]]
const activityParentEntityTypes = Object.keys(PARENT_ENTITY_TYPES) as [
  ActivityParentEntityType,
  ...ActivityParentEntityType[],
]

/** Sync window when a caller doesn't pick one: the feed's first page. */
const DEFAULT_LIMIT = 50

export const activitiesQueryDefs = {
  /**
   * The activity feed's rows, newest first. Region-gated like every other list; the
   * optional `regionFk` narrows further when the user picks one region of several.
   *
   * `user` is the only relation worth syncing: `entityId` is polymorphic text, so the
   * entities themselves are hydrated client-side through their own list resources.
   */
  listActivities: defineQuery(
    z.object({
      category: z.enum(['ascent', 'update']).optional(),
      limit: z.number().optional(),
      regionFk: z.number().optional(),
      // One object rather than two loose fields: an id without its type would silently
      // widen the query back to the global feed.
      scope: z.object({ id: z.string(), type: z.enum(activityEntityTypes) }).optional(),
      userFk: z.number().optional(),
    }),
    regionMemberCan(({ args }) => {
      // `users` carries no regionFk, so it can't take `relatedRegion`'s filter; RLS
      // re-checks it server-side.
      let q = zql.activities.orderBy('createdAt', 'desc').orderBy('id', 'desc').related('user')

      if (args.regionFk != null) {
        q = q.where('regionFk', args.regionFk)
      }

      if (args.userFk != null) {
        q = q.where('userFk', args.userFk)
      }

      // The feed's two segments. Everything that isn't an ascent is a crag or people edit,
      // and so is a photo pulled off an ascent (there `entityType` names the photo's owner).
      if (args.category === 'ascent') {
        q = q.where((q) => q.and(q.cmp('entityType', 'ascent'), q.cmp('columnName', 'IS NOT', 'file')))
      } else if (args.category === 'update') {
        q = q.where((q) => q.or(q.cmp('entityType', '!=', 'ascent'), q.cmp('columnName', 'file')))
      }

      // Scoped to one entity: its own rows plus the rows its children logged against it
      // (a block edit names its area as parent), so an area's section shows its blocks too.
      if (args.scope != null) {
        const { id, type } = args.scope
        const parentType = activityParentEntityTypes.find((candidate) => candidate === type)

        q = q.where((q) =>
          q.or(
            q.and(q.cmp('entityType', type), q.cmp('entityId', id)),
            ...(parentType == null ? [] : [q.and(q.cmp('parentEntityType', parentType), q.cmp('parentEntityId', id))]),
          ),
        )
      }

      // Always bounded: `activities` is the highest-churn table in the schema, so an
      // unlimited query would sync a whole region's audit log into the replica.
      return q.limit(args.limit ?? DEFAULT_LIMIT)
    }),
  ),
}
