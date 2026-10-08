import { acrossAreasOrder } from '$lib/entities/block/order'
import * as z from '$lib/forms/zod'
import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

// A soft-deleted block or area takes its coordinates and photos off devices: deletion is the remedy a
// landowner gets. Route link tables stay unfiltered, measured at ~3 s of guidebook sync on prod shape.
const live = <Q extends { where(column: 'deletedAt', op: 'IS', value: null): Q }>(q: Q) =>
  q.where('deletedAt', 'IS', null)

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
    regionMemberCan(() => zql.geolocations.where(({ exists, or }) => or(exists('block', live), exists('area', live)))),
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
    regionMemberCan(({ ctx }) => zql.topos.whereExists('block', live).related('file', relatedRegion(ctx))),
  ),
}

/** The map's blocks and areas, joined on the device from the guidebook rows instead of hydrated
 *  twice as relational queries. A raw `zql` read has no name, so it never reaches the server. */
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
