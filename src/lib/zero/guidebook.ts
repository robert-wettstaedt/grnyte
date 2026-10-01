import { acrossAreasOrder } from '$lib/entities/block/order'
import * as z from '$lib/forms/zod'
import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

/**
 * The offline guidebook as relation-free tables. Relations cost ~15x per row to hydrate, so the
 * same rows synced as one relational `listRoutes({})` crossed Zero's 10 s dead-connection threshold.
 */
export const guidebookQueryDefs = {
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
    regionMemberCan(() => zql.geolocations),
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
  // `files` has no relation back to `topos`, so a topo's image can only be reached from the topo.
  guidebookTopos: defineQuery(
    z.undefined(),
    regionMemberCan(({ ctx }) => zql.topos.related('file', relatedRegion(ctx))),
  ),
}

/**
 * The map's blocks and areas, joined on the device from the guidebook rows rather than synced as
 * relational queries, which would hydrate the same rows a second time. Never sent to the server:
 * a raw `zql` query has no name, so Zero only runs it locally. No topos, the map draws none.
 */
export const guidebookReads = {
  areas: () =>
    zql.areas
      .where('deletedAt', 'IS', null)
      .orderBy('name', 'asc')
      .related('parent', (q) => q.related('parent'))
      .related('parkingLocations'),
  blocks: () =>
    acrossAreasOrder(zql.blocks.where('deletedAt', 'IS', null))
      .related('area', (q) => q.related('parent'))
      .related('geolocation'),
}

/** The named queries `guidebookReads` joins, in `createResource`'s `register` shape. */
export const guidebookReadRegistrations = ['guidebookAreas', 'guidebookBlocks', 'guidebookGeolocations'] as const
