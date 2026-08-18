import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const filesQueryDefs = {
  // A route's own media (topo photos, beta videos). Ascent media hangs off
  // listRouteAscents instead.
  listRouteFiles: defineQuery(
    z.object({ routeId: z.number() }),
    regionMemberCan(({ args }) => zql.files.where('routeFk', args.routeId).related('bunnyStream').related('author')),
  ),
}
