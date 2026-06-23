import { areasQueryDefs } from '$lib/entities/area/queries'
import { ascentsQueryDefs } from '$lib/entities/ascent/queries'
import { blocksQueryDefs } from '$lib/entities/block/queries'
import { favoritesQueryDefs } from '$lib/entities/favorite/queries'
import { firstAscensionistsQueryDefs } from '$lib/entities/firstAscensionist/queries'
import { geolocationsQueryDefs } from '$lib/entities/geolocation/queries'
import { gradesQueryDefs } from '$lib/entities/grade/queries'
import { regionsQueryDefs } from '$lib/entities/region/queries'
import { rolePermissionsQueryDefs } from '$lib/entities/rolePermission/queries'
import { routesQueryDefs } from '$lib/entities/route/queries'
import { tagsQueryDefs } from '$lib/entities/tag/queries'
import { usersQueryDefs } from '$lib/entities/user/queries'
import { defineQueries, defineQuery } from '@rocicorp/zero'
import z from 'zod'
import { regionMemberCan, regionPreloadTables } from './permissions'
import { zql } from './zero-schema.gen'

export const queries = defineQueries({
  ...areasQueryDefs,
  ...ascentsQueryDefs,
  ...blocksQueryDefs,
  ...favoritesQueryDefs,
  ...firstAscensionistsQueryDefs,
  ...geolocationsQueryDefs,
  ...gradesQueryDefs,
  ...regionsQueryDefs,
  ...rolePermissionsQueryDefs,
  ...routesQueryDefs,
  ...tagsQueryDefs,
  ...usersQueryDefs,

  ...regionPreloadTables.reduce((obj, table) => {
    const capitalizedTable = table.charAt(0).toUpperCase() + table.slice(1)
    const name = `listAll${capitalizedTable}`

    return {
      ...obj,
      [name]: defineQuery(
        z.undefined(),
        regionMemberCan<undefined, undefined>(() => zql[table]),
      ),
    }
  }, {}),
})
