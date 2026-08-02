import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import type { Schema } from '$lib/zero/zero-schema'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery, type Query } from '@rocicorp/zero'
import z from 'zod'

interface RouteFilterArgs {
  areaId?: null | number
  content?: string
  firstAscensionists?: number[]
  hasBeta?: boolean
  hasTopo?: boolean
  maxGrade?: number
  minGrade?: number
  minRating?: number
  references?: string
  regionFk?: number
  tags?: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic over any related-tree shape; the filters below never read it
type RoutesQuery = Query<'routes', Schema, any>

/**
 * The grade/rating/tag/text/backlink filters shared by `listRoutes` and
 * `listRoutesForMap`. Kept in one place so a filter change can't land on the
 * full list but silently miss the map (they must stay in lockstep).
 */
function applyRouteFilters<Q extends RoutesQuery>(
  query: Q,
  args: RouteFilterArgs,
  r: ReturnType<typeof relatedRegion>,
): Q {
  let q: RoutesQuery = query

  if (args.regionFk != null) {
    q = q.where('regionFk', args.regionFk)
  }

  if (args.areaId != null) {
    q = q.where('areaIds', 'ILIKE', `%^${args.areaId}$%`)
  }

  // Filters run on the community grade/rating, the values every list displays.
  if (args.minGrade != null) {
    q = q.where('userGradeFk', '>=', args.minGrade)
  }
  if (args.maxGrade != null) {
    q = q.where('userGradeFk', '<=', args.maxGrade)
  }

  if (args.minRating != null) {
    q = q.where('userRating', '>=', args.minRating)
  }

  if (args.tags != null && args.tags.length > 0) {
    q = q.whereExists('tags', (q) => r(q).where('tagFk', 'IN', args.tags!))
  }

  if (args.firstAscensionists != null && args.firstAscensionists.length > 0) {
    q = q.whereExists('firstAscents', (q) => r(q).where('firstAscensionistFk', 'IN', args.firstAscensionists!))
  }

  if (args.hasTopo) {
    q = q.whereExists('topoRoutes', r)
  }

  if (args.hasBeta) {
    q = q.where(({ exists, or }) =>
      or(
        exists('files', (f) => r(f).where('bunnyStreamFk', 'IS NOT', null)),
        exists('ascents', (a) => r(a).whereExists('files', (f) => r(f).where('bunnyStreamFk', 'IS NOT', null))),
      ),
    )
  }

  if (args.content != null) {
    q = q.where((q) =>
      q.or(q.cmp('name', 'ILIKE', `%${args.content}%`), q.cmp('description', 'ILIKE', `%${args.content}%`)),
    )
  }

  // Find routes whose description references the given entity (e.g. `!areas:7!`) — its
  // backlinks. The token's delimiters keep it exact (`!areas:7!` ≠ `!areas:71!`).
  if (args.references != null) {
    q = q.where('description', 'ILIKE', `%${args.references}%`)
  }

  return q as Q
}

export const routesQueryDefs = {
  listRoutes: defineQuery(
    z.object({
      areaId: z.number().nullish(),
      content: z.string().optional(),
      firstAscensionists: z.array(z.number()).optional(),
      hasBeta: z.boolean().optional(),
      hasTopo: z.boolean().optional(),
      maxGrade: z.number().optional(),
      minGrade: z.number().optional(),
      minRating: z.number().optional(),
      pageSize: z.number().optional(),
      references: z.string().optional(),
      regionFk: z.number().optional(),
      routeId: z.union([z.number(), z.array(z.number())]).optional(),
      sort: z.enum(['rating', 'grade', 'firstAscentYear']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      tags: z.array(z.string()).optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      let q = zql.routes
        .where('deletedAt', 'IS', null)
        .related('tags', r)
        .related('firstAscents', (q) => r(q).related('firstAscensionist', r))
        .related('block', (q) => r(q).related('area', r))
        .related('topoRoutes', (q) => r(q).related('topo', (q) => r(q).related('file', r)))

      if (args.routeId != null) {
        if (Array.isArray(args.routeId)) {
          q = q.where('id', 'IN', args.routeId)
        } else {
          q = q.where('id', args.routeId)
        }
      }

      q = applyRouteFilters(q, args, r)

      if (args.sortOrder != null && args.sort != null) {
        q = q.orderBy(
          args.sort === 'grade' ? 'userGradeFk' : args.sort === 'rating' ? 'userRating' : args.sort,
          args.sortOrder,
        )

        switch (args.sort) {
          case 'rating':
            q = q.orderBy('userGradeFk', 'asc')
            break

          case 'grade':
            q = q.orderBy('userRating', 'desc')
            break
        }

        q = q.orderBy('id', 'asc')
      }

      if (args.pageSize != null) {
        q = q.limit(args.pageSize)
      }

      return q
    }),
  ),
  /**
   * The map's route list: one bare row per route (no related trees). The /explore map and
   * its Filter only read `id`/`blockFk`/`gradeFk`, while `listRoutes` materializes tags,
   * first ascents, block+area and topo+file for every route, which dominates the cold-load
   * sync (roughly half the synced rows) and Zero's IVM work. Filters still apply
   * server-side via `whereExists`, which doesn't sync the related rows.
   */
  listRoutesForMap: defineQuery(
    z.object({
      areaId: z.number().nullish(),
      content: z.string().optional(),
      firstAscensionists: z.array(z.number()).optional(),
      hasBeta: z.boolean().optional(),
      hasTopo: z.boolean().optional(),
      maxGrade: z.number().optional(),
      minGrade: z.number().optional(),
      minRating: z.number().optional(),
      pageSize: z.number().optional(),
      references: z.string().optional(),
      regionFk: z.number().optional(),
      tags: z.array(z.string()).optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)
      const q = applyRouteFilters(zql.routes.where('deletedAt', 'IS', null), args, r)

      // The map itself never passes one. It is here for the callers that only need to know
      // whether a region holds none, one, or more than one route, which would otherwise sync
      // every row in the region to count them.
      return args.pageSize == null ? q : q.limit(args.pageSize)
    }),
  ),
}
