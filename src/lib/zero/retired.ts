import { FAVORITE_KEY, favoriteEntityArgs } from '$lib/entities/favorite/dto'
import * as z from '$lib/forms/zod'
import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

/**
 * Queries the PowerSync milestone stopped asking for, still answered for one release: a tab on the previous build
 * keeps requesting them until it reloads, and an unknown name answers its screens with an error. Delete this file
 * one release after the milestone ships.
 */
export const retiredQueryDefs = {
  guidebookAreas: defineQuery(
    z.undefined(),
    regionMemberCan(() => zql.areas.where('deletedAt', 'IS', null)),
  ),
  guidebookBlocks: defineQuery(
    z.undefined(),
    regionMemberCan(() => zql.blocks.where('deletedAt', 'IS', null)),
  ),
  guidebookFirstAscensionists: defineQuery(
    z.undefined(),
    regionMemberCan(() => zql.firstAscensionists),
  ),
  guidebookGeolocations: defineQuery(
    z.undefined(),
    regionMemberCan(() =>
      zql.geolocations.where(({ exists, or }) =>
        or(
          exists('block', (q) => q.where('deletedAt', 'IS', null)),
          exists('area', (q) => q.where('deletedAt', 'IS', null)),
        ),
      ),
    ),
  ),
  guidebookRouteFirstAscents: defineQuery(
    z.undefined(),
    regionMemberCan(() => zql.routesToFirstAscensionists),
  ),
  guidebookRoutes: defineQuery(
    z.undefined(),
    regionMemberCan(() => zql.routes.where('deletedAt', 'IS', null)),
  ),
  guidebookRouteTags: defineQuery(
    z.undefined(),
    regionMemberCan(() => zql.routesToTags),
  ),
  guidebookTopoRoutes: defineQuery(
    z.undefined(),
    regionMemberCan(() => zql.topoRoutes),
  ),
  guidebookTopos: defineQuery(
    z.undefined(),
    regionMemberCan(({ ctx }) =>
      zql.topos.whereExists('block', (q) => q.where('deletedAt', 'IS', null)).related('file', relatedRegion(ctx)),
    ),
  ),
  listUserEntityFavorites: defineQuery(
    z.extend(favoriteEntityArgs, { userId: z.number() }),
    regionMemberCan(({ args }) =>
      zql.favorites.where('userFk', args.userId).where(FAVORITE_KEY[args.entityType], args.entityId),
    ),
  ),
}
