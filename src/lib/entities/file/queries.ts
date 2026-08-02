import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const filesQueryDefs = {
  // Files by id: an upload's activity row points at the file itself, so the feed has no
  // route or ascent to reach it through. Known ids only, and region-gated like the rest.
  listFilesByIds: defineQuery(
    z.object({ id: z.array(z.string()) }),
    regionMemberCan(({ args }) => zql.files.where('id', 'IN', args.id).related('bunnyStream').related('author')),
  ),

  // A route's own media (topo photos, beta videos). Ascent media hangs off
  // listRouteAscents instead.
  listRouteFiles: defineQuery(
    z.object({ routeId: z.number() }),
    regionMemberCan(({ args }) => zql.files.where('routeFk', args.routeId).related('bunnyStream').related('author')),
  ),
}
