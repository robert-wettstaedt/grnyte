import * as z from '$lib/forms/zod'
import { authenticatedUserCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'

export const reportsQueryDefs = {
  /** The caller's own open reports. Only their own: nobody else learns who reported what. */
  myOpenReports: defineQuery(
    z.object({}),
    authenticatedUserCan(({ ctx }) =>
      relatedRegion(ctx)(zql.contentReports.whereExists('reporter', (q) => q.where('authUserFk', ctx.authUserId))),
    ),
  ),
}
