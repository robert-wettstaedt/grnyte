import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const geolocationsQueryDefs = {
  parking: defineQuery(
    z.object({ id: z.number() }),
    regionMemberCan(({ args, ctx }) => {
      const r = relatedRegion(ctx)

      // Parking = a geolocation attached to an area. A block's location (blockFk set,
      // areaFk null) is not a parking, so exclude it — otherwise it would render as one.
      return zql.geolocations
        .where('id', args.id)
        .where('areaFk', 'IS NOT', null)
        .whereExists('area', (q) => r(q).where('deletedAt', 'IS', null))
        .related('area', (q) => r(q).related('parent', (q) => r(q).related('parent', r)))
        .one()
    }),
  ),
}
